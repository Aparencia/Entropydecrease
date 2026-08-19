//! 实时会话帧处理（v0.6.0 拆分：live_session_frame.rs >600 行硬拆，
//! 见 standards/line-limit-exemptions.md 拆分计划）。
//!
//! @ai-context: 屏幕帧 → 网格差异变化检测（ADR-011）→ 字幕区裁剪 + OCR 输入缩小
//!              （P4）→ 内存 OCR（TD-025，免磁盘临时 BMP）→ 滚动检测/多帧投票
//!              （T2）→ 落库 + 内存缓存；全帧画面要点去重落库。
//! @ai-context: ADR-011（REQ-086/REQ-087）：全帧网格 diff 每采样 tick 计算
//!              （带外变化 → 事件驱动全帧 OCR，翻页 ≤2s 触发）；字幕判变在
//!              ROI 裁剪帧上做（与页面变化解耦）；UI 面板事件（变化格连通
//!              聚类）活跃期字幕源头丢弃。
//! @ai-context: 本模块由 run_screen_worker（live_session_frame.rs）独占调用，
//!              不直接跨线程；时间戳统一（ADR-008 A1）由调用方注入。

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::dxgi_capture::CapturedFrame;
use crate::capture::frame_diff::{crop_frame, downscale_bgra, Rect, SampleRegion};
// ADR-011：网格差异变化检测（替代分块采样 hash）+ 面板事件
use crate::capture::grid_diff::{
    is_outside_band, GridDiffDetector, PanelDetector, GRID_COLS, GRID_ROWS, LARGE_CHANGE_RATIO,
    ROI_COLS, ROI_ROWS,
};
use crate::capture::ScreenCaptureSampler;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::fusion::SubtitleSegment;
use crate::live_session_frame::LatestCapturedFrame;
use crate::subtitle_ocr::{is_scrolling, SubtitleVoter, VotedSubtitle};
use crate::types::{NewSessionOcrBlock, NewSessionSegment};

/// OCR 输入最大宽度（P4：字幕裁剪区缩至该宽度再送 OCR，推理成本近平方下降）。
const MAX_OCR_WIDTH: u32 = 960;
/// 强制 OCR 间隔（s）——diff 采样漏检兜底：网格差异已结构性消除采样混叠
/// （ADR-011），但保留周期兜底（用户反馈 4/5 会话无 OCR 排查项）。
const FORCE_OCR_INTERVAL_SECS: u64 = 15;
/// ADR-011：带外变化触发全帧 OCR 的冷却（ms）——翻页等页面级变化
/// 事件驱动立即全帧采样，但 2s 内不重复（防 OCR 频率失控）。
const EVENT_FULL_OCR_COOLDOWN_MS: u64 = 2_000;

/// 字幕事件载荷（TD-043：携带后端会话纪元时间戳，前端显示与时间轴一致）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleEvent {
    pub timestamp_ms: u64,
    pub text: String,
}

/// 屏幕采样统计（诊断：会话无 OCR 时定位失败阶段，定期打印使静默失败可见化）。
#[derive(Default)]
pub struct ScreenStats {
    /// capture 成功返回帧次数
    pub sampled: u64,
    /// capture 返回 None（DXGI 超时=桌面无变化）次数
    pub no_change: u64,
    /// capture 返回 Err 次数
    pub capture_err: u64,
    /// 变化检测通过、进入 OCR 次数（ADR-011 起 = 画面变化 tick 数：
    /// 由全帧网格差异驱动，idle_governor 依赖其增长）
    pub diff_pass: u64,
    /// 变化检测未通过、跳过 OCR 次数（ADR-011 起 = 画面静止 tick 数）
    pub diff_skip: u64,
    /// OCR 成功次数
    pub ocr_ok: u64,
    /// OCR 失败次数
    pub ocr_err: u64,
    /// REQ-083：UI 垃圾字幕被源头过滤次数（可观测：误拦排查依据）
    pub junk_filtered: u64,
    /// REQ-087（ADR-011）：UI 面板活跃期字幕被源头丢弃次数
    pub panel_filtered: u64,
    /// 上次打印统计时刻（15s 节流）
    pub last_log_at: Option<Instant>,
}

/// ADR-011：触发链路状态（全帧/ROI 两级网格差异 + 面板检测 + OCR 时刻）。
///
/// @ai-context: 全帧网格 diff 每采样 tick 计算（带外信号/面板事件/idle 信号）；
///              ROI 网格 diff 在字幕裁剪帧上计算（字幕触发与页面变化解耦）；
///              last_ocr_at = 任一路径 OCR 成功时刻（force_ocr 兜底基准）；
///              last_full_ocr_at = 全帧 OCR 成功时刻（带外触发冷却基准）。
pub struct TriggerState {
    pub full_grid: GridDiffDetector,
    pub roi_grid: GridDiffDetector,
    pub panel: PanelDetector,
    pub last_ocr_at: Instant,
    pub last_full_ocr_at: Instant,
}

impl TriggerState {
    pub fn new() -> Self {
        Self {
            full_grid: GridDiffDetector::new(GRID_COLS, GRID_ROWS),
            roi_grid: GridDiffDetector::new(ROI_COLS, ROI_ROWS),
            panel: PanelDetector::default(),
            last_ocr_at: Instant::now(),
            last_full_ocr_at: Instant::now(),
        }
    }
}

/// 处理一帧屏幕采样（字幕区/全帧 OCR）。
///
/// @ai-context: ADR-011 两级判变：①全帧网格差异（每 tick，与路径无关）——
///              带外变化事件驱动全帧 OCR（2s 冷却）+ 面板事件 + idle 信号；
///              ②字幕路径在 ROI 裁剪帧上判变（与页面/鼠标/动作解耦），
///              静止画面下字幕 OCR 只随 ROI 内容触发。
#[allow(clippy::too_many_arguments)]
pub fn process_frame(
    screen: Option<&mut ScreenCaptureSampler>,
    // ADR-011：触发链路状态（全帧/ROI 网格 diff + 面板检测 + OCR 时刻）
    trigger: &mut TriggerState,
    voter: &mut SubtitleVoter,
    last_frame_text: &mut Option<String>,
    last_preview: &mut String,
    db: &Db,
    engines: &EnginePool,
    app: &tauri::AppHandle,
    session_id: i64,
    region: SampleRegion,
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
    epoch: Instant,
    last_capture_error: &mut Option<Instant>,
    last_full_texts: &mut Vec<String>,
    stats: &mut ScreenStats,
    roi_tracker: &mut crate::region_tracker::RoiTracker,
    // M3/REQ-047：版面缓存（事件帧触发——同版面复用，变化才重分析）
    layout_cache: &mut crate::layout_cache::LayoutCache,
    // M6/REQ-051：关键帧样本缓冲（全帧分支收集，停止时投票）
    frame_samples: &mut Vec<crate::frame_cluster::FrameSample>,
    // M6/REQ-051：关键帧归档状态（新文本 + 间隔触发存图）
    last_archived_text: &mut Option<String>,
    last_archived_at: &mut Option<Instant>,
    // M6/REQ-051：最新帧共享缓存（用户截图命令读取）
    latest_frame: &std::sync::Arc<std::sync::Mutex<Option<LatestCapturedFrame>>>,
    // M6/REQ-051：会话图片存储（None=未启用归档；mut 供区域裁剪图归档）
    image_store: &mut Option<crate::image_store::SessionImageStore>,
    // v0.6.0 M1（REQ-083）：UI 垃圾黑名单（字幕源头过滤）
    ui_junk: &crate::ui_junk::UiJunkList,
) {
    let Some(sampler) = screen else { return };
    // 字幕区裁剪决策由 M2/REQ-037 RoiTracker 给出（播放区域 + ROI；首帧扫描期全帧）
    let capture_result = sampler.capture(None);
    // ADR-007：目标窗口关闭等捕获事件无论捕获结果如何都要转发——
    // 窗口关闭瞬间若 GDI 捕获也失败，事件不得被吞掉（审查发现）
    match sampler.take_event() {
        Some(crate::capture::dxgi_capture::CaptureEvent::WindowLost) => {
            let _ = app.emit("live:window-lost", ());
        }
        None => {}
    }
    let Ok(Some(mut frame)) = capture_result else {
        match capture_result {
            // 捕获失败（DXGI/GDI 均失效）——曾静默返回导致"会话无 OCR"无法定位；
            // 日志节流 5s（降级期间每帧失败会刷屏）
            Err(e) => {
                stats.capture_err += 1;
                let now = Instant::now();
                let should_log = last_capture_error
                    .map(|t| now.duration_since(t) >= Duration::from_secs(5))
                    .unwrap_or(true);
                if should_log {
                    *last_capture_error = Some(now);
                    eprintln!("[ScreenWorker] 屏幕捕获失败（日志节流 5s）: {}", e);
                }
            }
            // DXGI 超时（桌面无变化）——正常分支，非错误
            Ok(None) => stats.no_change += 1,
            // let-else 已保证不会走到这里（Ok(Some(_)) 被解构），但 match 需穷尽
            Ok(Some(_)) => unreachable!("let-else 已解构 Ok(Some)"),
        }
        return;
    };
    stats.sampled += 1;
    // M2/REQ-037：播放区域周期重扫（5s 节流）与窗口尺寸自适应（须在全帧数据上执行）
    roi_tracker.resize(frame.width, frame.height);
    roi_tracker.refresh_playback_region(&frame.bgraw, frame.width, frame.height);
    // A1：帧时间戳统一为会话纪元（与音频/flush 同基准，ADR-008）
    frame.timestamp_ms = epoch.elapsed().as_millis() as u64;
    // ── ADR-011：全帧网格差异（每采样 tick，与路径无关）──
    // 结构性消除分块采样 hash 的采样列混叠（旧算法 1920 宽下采样列仅
    // {0,480,960,1440}，静止画面局部文字变化漏检 → OCR 不触发）
    let grid = trigger.full_grid.diff(&frame.bgraw, frame.width, frame.height);
    let full_changed = !grid.changed_cells.is_empty();
    // 诊断/idle 信号：diff_pass = 画面变化 tick 数（idle_governor 依赖其增长）
    if full_changed {
        stats.diff_pass += 1;
    } else {
        stats.diff_skip += 1;
    }
    // REQ-087：UI 面板事件（变化格连通聚类；与 OCR 路径无关，
    // 活跃期内字幕文本源头丢弃——见 handle_subtitle_frame 门控）
    trigger.panel.feed(
        &grid.changed_cells,
        GRID_COLS as usize,
        GRID_ROWS as usize,
        frame.timestamp_ms,
    );
    // 带外变化（页面级/翻页）→ 事件驱动全帧 OCR（2s 冷却）：
    // 幻灯片翻页响应从"≤5s + 可能漏检"降为"≤2s 必触发"
    let band = roi_tracker.subtitle_band();
    let force_full = is_outside_band(
        grid.bounds.as_ref(),
        &band,
        grid.changed_ratio,
        LARGE_CHANGE_RATIO,
    ) && trigger.last_full_ocr_at.elapsed() >= Duration::from_millis(EVENT_FULL_OCR_COOLDOWN_MS);
    let mut region = region;
    if force_full {
        region = SampleRegion::Full;
    }
    // 强制 OCR 兜底（网格差异已去混叠，仍保留周期兜底：屏幕在变但 OCR 未产出
    // 时至少周期性放行，用户反馈 4/5 会话无 OCR 排查项）
    let force_ocr = trigger.last_ocr_at.elapsed() >= Duration::from_secs(FORCE_OCR_INTERVAL_SECS);
    let is_subtitle = region == SampleRegion::Subtitle;
    // M6/REQ-051：更新最新帧共享缓存（用户截图命令读取；全帧分支保留原帧）。
    // 用最终 region 判定（审查修复 2026-08-19）：带外强制全帧时本 tick 是全帧数据，
    // 若按原始 region 跳过缓存，截图命令会读到旧帧；此位置 frame 尚未裁剪，缓存必为全帧
    if region != SampleRegion::Subtitle {
        if let Ok(mut guard) = latest_frame.lock() {
            *guard = Some(LatestCapturedFrame {
                timestamp_ms: frame.timestamp_ms,
                bgraw: frame.bgraw.clone(),
                width: frame.width,
                height: frame.height,
            });
        }
    }
    // M2/REQ-037：字幕区裁剪由 ROI 决策替代固定底部 1/4（播放区域内动态锁定）；
    // 扫描期/重扫期走全帧（ROI 未锁定时 bbox 密度聚簇需全帧 det）
    let mut crop_origin: Option<(u32, u32)> = None;
    // TD-046 修复：OCR 输入经 downscale（≤960px）后 bbox 处于缩小坐标系——
    // 记录 downscale 前尺寸，回喂 RoiTracker 时按缩放比反算回帧坐标系
    let mut ocr_input_scale = (1.0f32, 1.0f32);
    if is_subtitle {
        let pre_scale_w = frame.width;
        let pre_scale_h = frame.height;
        match roi_tracker.decide() {
            crate::region_tracker::RoiDecision::UseRoi(roi) => {
                // ROI 钳制到帧内（窗口移动瞬间 ROI 可能越界——防御）
                let w = frame.width as i32;
                let h = frame.height as i32;
                let q = Rect {
                    left: roi.left.clamp(0, w),
                    top: roi.top.clamp(0, h),
                    right: roi.right.clamp(0, w),
                    bottom: roi.bottom.clamp(0, h),
                };
                if q.width() == 0 || q.height() == 0 {
                    return;
                }
                crop_origin = Some((q.left as u32, q.top as u32));
                crop_frame(&mut frame.bgraw, &mut frame.width, &mut frame.height, Some(&q));
            }
            crate::region_tracker::RoiDecision::FullFrame => {}
        }
        if frame.bgraw.is_empty() {
            return;
        }
        // M2/ADR-011：字幕判变在 ROI 裁剪帧上做（与页面变化/鼠标/教师动作
        // 完全解耦）——静止画面下字幕 OCR 只随 ROI 内容触发；未变且非
        // force_ocr → 跳过（省 downscale + OCR 推理）
        let roi_diff = trigger.roi_grid.diff(&frame.bgraw, frame.width, frame.height);
        if roi_diff.changed_cells.is_empty() && !force_ocr {
            return;
        }
        // P4：OCR 输入缩小——宽超上限时最近邻缩小（文字大，质量无损；扫描帧同样受益）
        downscale_bgra(&mut frame.bgraw, &mut frame.width, &mut frame.height, MAX_OCR_WIDTH);
        if frame.bgraw.is_empty() {
            return;
        }
        // TD-046：bbox 换算比例 = downscale 前后尺寸比（宽/高各自独立）
        if pre_scale_w > 0 && pre_scale_h > 0 {
            ocr_input_scale = (
                pre_scale_w as f32 / frame.width as f32,
                pre_scale_h as f32 / frame.height as f32,
            );
        }
    } else if !full_changed && !force_ocr {
        // 全帧路径判变（网格 diff 已在上面计算；未变且非 force → 跳过）
        return;
    }

    // M3/REQ-047 + M4/REQ-048：版面分析（事件帧触发）——全帧分支做区域分类，
    // 结果经缓存复用（同版面零重分析）；区域存在时走分区域 OCR（M4）
    let mut layout_regions: Vec<crate::layout_analyzer::LayoutRegion> = Vec::new();
    if !is_subtitle {
        if let Some(grid) = crate::frame_features::grid_from_bgra(&frame.bgraw, frame.width, frame.height) {
            let (regions, reused) =
                crate::layout_cache::analyze_or_reuse(layout_cache, &grid, frame.timestamp_ms);
            if !reused && !regions.is_empty() {
                // 新版面：分类构成（开发期日志；区域列表驱动分区域 OCR）
                let summary: Vec<String> = regions
                    .iter()
                    .map(|r| format!("{:?}@{}x{}+{}+{}", r.kind, r.w, r.h, r.x, r.y))
                    .collect();
                eprintln!("[Layout] 会话 {} 版面区域: {}", session_id, summary.join(", "));
            }
            // 网格坐标 → 帧像素坐标（crop_spec/map_to_frame 按像素消费；修复：
            // 此前网格坐标被当像素裁剪，区域错位漏识别——layout_analyzer 与
            // region_ocr 注释互相声称对方换算，实际谁都没做）
            layout_regions = crate::frame_features::regions_to_frame(
                &regions,
                grid.cols,
                grid.rows,
                frame.width,
                frame.height,
            );
        }
    }

    // TD-025：BGRA8 帧 → 内存 RgbImage 直送 OCR（不再写磁盘临时 BMP，杜绝崩溃残留）
    let Some(rgb) = crate::region_ocr::bgra_to_rgb_image(&frame.bgraw, frame.width, frame.height) else { return };
    // M6/REQ-051：OCR 输入图 aHash（关键帧样本去重/聚类输入）
    let ocr_input_hash = crate::ocr_cache::average_hash(&rgb);
    // M3/REQ-067：dHash 双指纹（与 aHash 组合——帧聚类任一显著变化即新簇）
    let ocr_input_dhash = crate::ocr_cache::difference_hash(&rgb);
    // M4/REQ-048：全帧分支优先分区域 OCR（版面区域 → 区域裁剪 → 识别 → 坐标还原）；
    // 区域路径空产出（误判区域/空白区域/识别失败）→ 回退整帧直跑（修复：
    // 此前区域一旦存在即独占整帧路径，OCR 只跑在小裁剪块上——视频画面误判
    // 区域时全程 0 OCR 块，参考图集只剩首帧占坑图，会话 14/15 实测）
    if !is_subtitle && !layout_regions.is_empty() {
        let (blocks, failed_regions) =
            crate::region_ocr::region_ocr_blocks(&frame, engines, &layout_regions, image_store);
        // 六轮审查修复：回退判定以**过滤后有无可用块**为准（score ≥0.5 + 非空 +
        // 非 UI 垃圾）——原实现看原始块是否为空：区域 OCR 产出任意低分/垃圾块
        // （播放器时间码/画面误检）时整帧兜底被跳过，真实画面文字仍可能无出口
        if crate::live_keyframes::has_useful_blocks(&blocks, ui_junk) {
            // 区域路径有可用产出：正常分支（失败区域数计入统计，不阻断整体）
            stats.ocr_err += failed_regions as u64;
            stats.ocr_ok += 1;
            // OCR 成功即刷新兜底基准（无论是否产出文本）
            trigger.last_ocr_at = Instant::now();
            trigger.last_full_ocr_at = Instant::now();
            crate::live_keyframes::handle_full_frame(
                &frame, &blocks, db, app, session_id, last_full_texts, frame_samples,
                last_archived_text, last_archived_at, image_store, ocr_input_hash,
                ocr_input_dhash, ui_junk,
            );
        } else {
            // 区域路径无可用产出（误判/空白区域/垃圾块）→ 整帧 OCR 兜底
            // （结构性回退链：误判/空白区域不得阻断全帧识别——真实画面文字必须仍有出口）
            match engines.recognize_image(rgb) {
                Ok(blocks) => {
                    stats.ocr_err += failed_regions as u64;
                    stats.ocr_ok += 1;
                    trigger.last_ocr_at = Instant::now();
                    trigger.last_full_ocr_at = Instant::now();
                    crate::live_keyframes::handle_full_frame(
                        &frame, &blocks, db, app, session_id, last_full_texts, frame_samples,
                        last_archived_text, last_archived_at, image_store, ocr_input_hash,
                        ocr_input_dhash, ui_junk,
                    );
                }
                Err(e) => {
                    stats.ocr_err += 1 + failed_regions as u64;
                    eprintln!("[ScreenWorker] 整帧 OCR 兜底失败（区域 OCR 亦无产出）: {}", e);
                }
            }
        }
    } else {
        match engines.recognize_image(rgb) {
            Ok(blocks) => {
                stats.ocr_ok += 1;
                // 成功识别即刷新 OCR 时刻（无论是否产出文本——防漏检兜底周期基准）
                trigger.last_ocr_at = Instant::now();
                if is_subtitle {
                    // M2/REQ-037：bbox 回喂 ROI 跟踪器（锁定/失效判定；
                    // 裁剪图坐标系 + 原点平移 + TD-046 缩放比反算；
                    // REQ-084：前台非目标窗口期间 feed_ocr 内部冻结）
                    let boxes: Vec<crate::types::TextBox> =
                        blocks.iter().filter_map(|b| b.bbox).collect();
                    roi_tracker.feed_ocr(&boxes, crop_origin, ocr_input_scale);
                    // REQ-084：前台切换期间其他窗口内容不得进字幕投票器
                    if !roi_tracker.foreground_foreign() {
                        // REQ-087（ADR-011）：UI 面板活跃期 → 字幕源头丢弃
                        // （控制栏/弹窗文本不得进投票器/落段；原料层不动可复查）
                        if trigger.panel.is_active() {
                            stats.panel_filtered += 1;
                        } else {
                            handle_subtitle_frame(
                                &frame, &blocks, voter, last_frame_text, last_preview, db, app,
                                session_id, subtitle_segments, ui_junk, stats,
                            );
                        }
                    }
                } else {
                    // 全帧 OCR 成功时刻：带外触发冷却基准（ADR-011）
                    trigger.last_full_ocr_at = Instant::now();
                    crate::live_keyframes::handle_full_frame(
                        &frame, &blocks, db, app, session_id, last_full_texts, frame_samples,
                        last_archived_text, last_archived_at, image_store, ocr_input_hash,
                        ocr_input_dhash, ui_junk,
                    );
                }
            }
            Err(e) => {
                stats.ocr_err += 1;
                eprintln!("[ScreenWorker] OCR 识别失败（下帧重试）: {}", e)
            }
        }
    }
}

/// 字幕区帧：文本拼接 → UI 垃圾源头过滤 → 滚动检测 → 多帧投票（T2）→ 切换时定稿落库。
///
/// @ai-context: 参数多源于编排上下文传递（DB/事件/状态/投票器），聚合会破坏内聚，登记豁免。
/// @ai-context: REQ-083：is_ui_junk 命中 → 整帧丢弃——不进投票器/不落 OCR 块/
///              不落段/不推事件（源头治本；note_filter 兜底同表）。
#[allow(clippy::too_many_arguments)]
fn handle_subtitle_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    voter: &mut SubtitleVoter,
    last_frame_text: &mut Option<String>,
    last_preview: &mut String,
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
    ui_junk: &crate::ui_junk::UiJunkList,
    stats: &mut ScreenStats,
) {
    let text = blocks.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join("");
    if text.trim().is_empty() {
        return;
    }
    // REQ-083：UI 垃圾特征（水印/播放器/编辑器/应用 UI）→ 源头过滤
    if ui_junk.is_junk(&text) {
        stats.junk_filtered += 1;
        return;
    }
    // 滚动字幕（股票/歌词）丢弃——投票分组对逐帧漂移文本失效
    let prev = last_frame_text.clone().unwrap_or_default();
    if is_scrolling(&text, &prev, 0.6) {
        return;
    }
    *last_frame_text = Some(text.clone());
    // REQ-065：加权投票——帧权重 = 字幕区块平均 score（清晰度×score 启发式；
    // score 未暴露时恒 1.0 → 退化为等权，零回归）
    let weight = blocks.iter().map(|b| b.score).sum::<f32>() / (blocks.len() as f32).max(1.0);
    // 多帧投票：同字幕帧累积为样本；字幕切换时定稿上一组（投票纠错 + 真实时间轴）
    if let Some(voted) = voter.observe_weighted(&text, frame.timestamp_ms, weight) {
        persist_voted_subtitle(db, app, session_id, subtitle_segments, voted);
    }
    // UI 即时预览：新组首帧原文立刻推送（定稿文本在切换时再推，纠正可见；
    // TD-043：预览事件同样携带后端时间戳）
    if let Some(preview) = voter.preview() {
        if *last_preview != preview {
            *last_preview = preview.to_string();
            let _ = app.emit(
                "live:subtitle",
                SubtitleEvent { timestamp_ms: frame.timestamp_ms, text: preview.to_string() },
            );
        }
    }
}

/// 定稿一条字幕：OCR 块 + 转写段 + 共享缓存 + 事件（T2 语义：切换/停止时落库）。
pub fn persist_voted_subtitle(
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    subtitle_segments: &Mutex<Vec<SubtitleSegment>>,
    voted: VotedSubtitle,
) {
    let text = voted.text.clone();
    let _ = db.add_ocr_block(&NewSessionOcrBlock {
        session_id,
        timestamp_ms: voted.start_ms,
        text: text.clone(),
        score: 0.9,
        region: "subtitle".to_string(),
        // 字幕区独立 ROI 管线，不属版面区域（M3 设计：字幕区不进版面分析）
        region_kind: None,
    });
    let _ = db.add_segment(&NewSessionSegment {
        session_id,
        start_ms: voted.start_ms,
        end_ms: voted.end_ms,
        text: text.clone(),
        source: "subtitle".to_string(),
        confidence: None,
    });
    // 跨线程共享缓存（TD-026：采样线程写、停止后融合线程读）
    let start_ms = voted.start_ms;
    subtitle_segments
        .lock()
        .expect("subtitle segments lock poisoned")
        .push(voted.into_segment());
    // TD-043：字幕事件携带后端会话纪元时间戳（start_ms = 首样本时刻）
    let _ = app.emit("live:subtitle", SubtitleEvent { timestamp_ms: start_ms, text });
}
