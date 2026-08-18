//! 实时会话帧处理（live_session.rs 的拆分子模块，保持主文件 ≤300 行）。
//!
//! @ai-context: 屏幕帧 → 变化检测 → 字幕区裁剪 + OCR 输入缩小（P4）→ 内存 OCR
//!              （TD-025，免磁盘临时 BMP）→ 滚动检测/多帧投票（T2）→ 落库 + 内存缓存；
//!              全帧画面要点去重落库。
//! @ai-context: 停止时的融合重写（rewrite_with_fusion）也归本模块——v0.3.0（REQ-031）
//!              增加无字幕短路：subtitles 为空时融合 = ASR 原样拷贝，直接跳过。
//! @ai-context: 屏幕采样在独立线程运行（run_screen_worker，TD-026 修复）——
//!              OCR 推理不再阻塞会话线程的音频消费；语音活跃度（B3）驱动自适应采样。
//! @ai-context: 时间戳统一（ADR-008 A1）：帧时间戳在捕获后覆写为会话纪元 elapsed，
//!              与音频块、flush 尾句同一基准。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::dxgi_capture::CapturedFrame;
use crate::capture::frame_diff::{
    crop_frame, downscale_bgra, DualRateScheduler, FrameDiffDetector, SampleRegion,
};
use crate::capture::ScreenCaptureSampler;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::Result;
use crate::fusion::{merge_transcript, FusedSource, SubtitleSegment};
use crate::subtitle_ocr::{is_scrolling, SubtitleVoter, VotedSubtitle};
use crate::types::{NewSessionOcrBlock, NewSessionSegment, TranscriptSegment};

/// 采样节拍（ms）：与音频消费解耦，固定 1s 一拍（审查 M5 修复）。
const SAMPLE_TICK_MS: u64 = 1000;
/// 采样线程轮询休眠（ms）——空转粒度，影响停止响应延迟。
const WORKER_POLL_MS: u64 = 50;
/// OCR 输入最大宽度（P4：字幕裁剪区缩至该宽度再送 OCR，推理成本近平方下降）。
const MAX_OCR_WIDTH: u32 = 960;
/// 强制 OCR 间隔（s）——diff 采样漏检兜底：变化检测（8 块 × 60 字节采样 hash）
/// 对局部/平滑变化可能漏检（采样点错过变化像素），此时距上次 OCR 超过该间隔
/// 强制识别一次，保证"屏幕在变但无 OCR"场景至少周期性产出（用户反馈 4/5 会话无 OCR 排查项）。
const FORCE_OCR_INTERVAL_SECS: u64 = 15;

/// 实时画面要点事件载荷（前端实时画面流，简要单行卡片）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrEvent {
    pub timestamp_ms: u64,
    pub text: String,
}

/// 字幕事件载荷（TD-043：携带后端会话纪元时间戳，前端显示与时间轴一致）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleEvent {
    pub timestamp_ms: u64,
    pub text: String,
}

/// 屏幕采样统计（诊断：会话无 OCR 时定位失败阶段，定期打印使静默失败可见化）。
#[derive(Default)]
struct ScreenStats {
    /// capture 成功返回帧次数
    sampled: u64,
    /// capture 返回 None（DXGI 超时=桌面无变化）次数
    no_change: u64,
    /// capture 返回 Err 次数
    capture_err: u64,
    /// 变化检测通过、进入 OCR 次数
    diff_pass: u64,
    /// 变化检测未通过、跳过 OCR 次数
    diff_skip: u64,
    /// OCR 成功次数
    ocr_ok: u64,
    /// OCR 失败次数
    ocr_err: u64,
    /// 上次打印统计时刻（15s 节流）
    last_log_at: Option<Instant>,
}

/// 最新捕获帧快照（REQ-051 M6：用户截图命令读取；纯数据跨线程共享）。
#[derive(Clone)]
pub struct LatestCapturedFrame {
    pub timestamp_ms: u64,
    pub bgraw: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// 屏幕采样线程入口（TD-026 修复：OCR 从会话线程移出，音频消费不再被阻塞）。
///
/// @ai-context: ScreenCaptureSampler 持 COM 对象（非 Send），在本线程内创建与使用，
///              规避跨线程约束；节拍自驱动（与音频消费解耦）；字幕段写入共享缓存，
///              停止后由融合线程读取；epoch/speech_active 由会话线程注入（ADR-008）。
/// @ai-context: 参数多为编排上下文传递（停止标志/纪元/活跃度/DB/引擎/事件/缓存），
///              聚合会破坏内聚，登记 clippy 豁免。
#[allow(clippy::too_many_arguments)]
pub fn run_screen_worker(
    stop: Arc<AtomicBool>,
    hwnd: Option<i64>,
    epoch: Instant,
    speech_active: Arc<AtomicBool>,
    db: Db,
    engines: EnginePool,
    app: tauri::AppHandle,
    session_id: i64,
    subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>>,
    // v0.5.0 M1（REQ-043）：视频类型档案（None=默认档案，采样档零回归）
    profile: Option<crate::video_profile::ProfileKind>,
    // v0.5.0 M6（REQ-051）：会话图片存储（关键帧归档；None=未启用）
    mut image_store: Option<crate::image_store::SessionImageStore>,
    // v0.5.0 M6（REQ-051）：最新帧共享缓存（用户截图命令读取）
    latest_frame: std::sync::Arc<std::sync::Mutex<Option<LatestCapturedFrame>>>,
) {
    let mut screen = match ScreenCaptureSampler::new(hwnd.map(crate::windows::hwnd_from_i64)) {
        Ok(s) => {
            eprintln!("[LiveSession] 屏幕捕获后端: {}", s.backend_name());
            Some(s)
        }
        Err(e) => {
            // 采样器创建失败（DXGI/GDI 均不可用）时 worker 空转，但必须可观测（审查补充）
            eprintln!("[LiveSession] 屏幕捕获初始化失败（字幕/画面识别不可用）: {}", e);
            None
        }
    };
    // REQ-043：档案驱动采样预算——按档案查表（默认档案 = Lecture 现状档，零回归）；
    // 实操档案全帧高频（操作画面价值高），口播/访谈/会议全帧极低频（画面几乎无信息）
    let budget = profile
        .map(crate::video_profile::profile_by_kind)
        .map(|p| p.sampling_budget)
        .unwrap_or(crate::video_profile::SamplingBudget {
            subtitle_every: 2,
            full_every: 5,
            silent_subtitle_every: 4,
            silent_full_every: 2,
        });
    // 字幕区变化阈值=1（单行字幕翻页只落 1 块，审查 M6 修复），全帧=2（过滤鼠标微动）
    let mut scheduler = DualRateScheduler::from_budget(
        budget.subtitle_every,
        budget.full_every,
        budget.silent_subtitle_every,
        budget.silent_full_every,
    );
    let mut subtitle_diff = FrameDiffDetector::with_min_changed_blocks(1);
    let mut full_diff = FrameDiffDetector::new();
    let mut voter = SubtitleVoter::new();
    let mut last_frame_text: Option<String> = None;
    let mut last_preview = String::new();
    let mut last_sample_at = Instant::now();
    // 捕获失败日志节流状态（屏幕链路失效时每帧报错会刷屏，5s 一次）
    let mut last_capture_error: Option<Instant> = None;
    // 上次 OCR 时刻（强制 OCR 兜底）与全帧文本去重（强制 OCR 下静止画面不重复落库）
    let mut last_ocr_at = Instant::now();
    let mut last_full_texts: Vec<String> = Vec::new();
    let mut stats = ScreenStats::default();
    // M2/REQ-037：动态字幕区域跟踪（播放区域检测 + ROI 锁定/重扫；尺寸首帧自适应）
    let mut roi_tracker = crate::region_tracker::RoiTracker::new(0, 0);
    // M3/REQ-047：版面缓存（事件帧触发——同版面复用分区，变化才重分析）
    let mut layout_cache = crate::layout_cache::LayoutCache::new();
    // M6/REQ-051：关键帧样本缓冲（全帧分支收集，停止时投票产出关键图候选）
    let mut frame_samples: Vec<crate::frame_cluster::FrameSample> = Vec::new();
    // M6/REQ-051：关键帧归档状态（新文本 + 间隔触发存图）
    let mut last_archived_text: Option<String> = None;
    let mut last_archived_at: Option<Instant> = None;
    // M4/REQ-039 P8：高负载自动降级（CPU 占用采样 → 全帧降频，保 ASR 主链路）
    let mut load_monitor = crate::load_monitor::LoadMonitor::new();
    let mut last_load_check_at = Instant::now();
    let mut degraded = false;

    while !stop.load(Ordering::SeqCst) {
        // M4：每 2s 采样 CPU 负载（降级标志变化打印——静默失败可见化）
        if last_load_check_at.elapsed() >= Duration::from_secs(2) {
            last_load_check_at = Instant::now();
            let new_degraded = load_monitor.tick();
            if new_degraded != degraded {
                degraded = new_degraded;
                if degraded {
                    eprintln!("[ScreenWorker] 负载高，采样降级（全帧 0.1fps 封顶，REQ-039 P8）");
                } else {
                    eprintln!("[ScreenWorker] 负载恢复，采样档位还原");
                }
            }
        }
        if last_sample_at.elapsed().as_millis() as u64 >= SAMPLE_TICK_MS {
            last_sample_at = Instant::now();
            // B3（P3 简化版）+ M4：语音活跃度 + 负载档驱动自适应采样
            let region = scheduler.next_region(speech_active.load(Ordering::Relaxed), degraded);
            if region != SampleRegion::Skip {
                let diff = match region {
                    SampleRegion::Subtitle => &mut subtitle_diff,
                    _ => &mut full_diff,
                };
                process_frame(
                    screen.as_mut(), diff, &mut voter, &mut last_frame_text, &mut last_preview,
                    &db, &engines, &app, session_id, region, &subtitle_segments, epoch,
                    &mut last_capture_error, &mut last_ocr_at, &mut last_full_texts, &mut stats,
                    &mut roi_tracker, &mut layout_cache, &mut frame_samples,
                    &mut last_archived_text, &mut last_archived_at, &latest_frame,
                    image_store.as_mut(),
                );
            }
        }
        // 诊断：每 15s 打印采样统计（会话无 OCR 时定位失败阶段；静默失败可见化）
        if stats
            .last_log_at
            .is_none_or(|t| t.elapsed() >= Duration::from_secs(15))
        {
            stats.last_log_at = Some(Instant::now());
            eprintln!(
                "[ScreenWorker] 采样统计: sampled={} no_change={} capture_err={} diff_pass={} diff_skip={} ocr_ok={} ocr_err={}",
                stats.sampled, stats.no_change, stats.capture_err, stats.diff_pass, stats.diff_skip, stats.ocr_ok, stats.ocr_err
            );
        }
        std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
    }
    // 停止：冲刷未定稿的最后一组字幕（否则末句字幕丢失，T2 语义要求）
    if let Some(voted) = voter.flush(epoch.elapsed().as_millis() as u64) {
        persist_voted_subtitle(&db, &app, session_id, &subtitle_segments, voted);
    }
    // M6/REQ-051：关键帧投票（课后精修：多信号筛选 → 关键图候选；产物层 M7 消费）
    if !frame_samples.is_empty() {
        let votes = crate::frame_cluster::vote_key_frames(&frame_samples, &[]);
        let top: Vec<crate::frame_cluster::KeyFrameCandidate> = votes
            .iter()
            .take(5)
            .cloned()
            .collect();
        if !top.is_empty() {
            let summary: Vec<String> = top
                .iter()
                .map(|c| format!("{}ms({})", c.timestamp_ms, c.reasons.join("+")))
                .collect();
            eprintln!("[ScreenWorker] 会话 {} 关键图候选: {}", session_id, summary.join(", "));
            let _ = app.emit("session:keyframes", top);
        }
    }
    // 显式释放采样器（COM/DXGI 资源）——worker 退出即释放 duplication，
    // 防多会话快速连测时泄漏累积触发 DXGI 并发上限（4/5 会话无 OCR 排查项）
    drop(screen);
    eprintln!("[ScreenWorker] 屏幕采样线程退出（会话 {}）", session_id);
}

/// 处理一帧屏幕采样（字幕区/全帧 OCR）。
#[allow(clippy::too_many_arguments)]
fn process_frame(
    screen: Option<&mut ScreenCaptureSampler>,
    diff: &mut FrameDiffDetector,
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
    last_ocr_at: &mut Instant,
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
    // M6/REQ-051：会话图片存储（None=未启用归档）
    image_store: Option<&mut crate::image_store::SessionImageStore>,
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
    // M6/REQ-051：更新最新帧共享缓存（用户截图命令读取；全帧分支保留原帧）
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
    // M2/REQ-037：播放区域周期重扫（5s 节流）与窗口尺寸自适应（须在全帧数据上执行）
    roi_tracker.resize(frame.width, frame.height);
    roi_tracker.refresh_playback_region(&frame.bgraw, frame.width, frame.height);
    // A1：帧时间戳统一为会话纪元（与音频/flush 同基准，ADR-008）
    frame.timestamp_ms = epoch.elapsed().as_millis() as u64;
    // 强制 OCR 兜底（diff 采样漏检防御）：变化检测 hash 对局部/平滑变化可能漏检
    // （采样点错过变化像素）——距上次 OCR 超过 FORCE_OCR_INTERVAL 时无条件放行，
    // 保证"屏幕在变但无 OCR"场景至少周期性产出（用户反馈 4/5 会话无 OCR 排查项）
    let force_ocr = last_ocr_at.elapsed() >= Duration::from_secs(FORCE_OCR_INTERVAL_SECS);
    if !diff.has_changed(&frame.bgraw) && !force_ocr {
        stats.diff_skip += 1;
        return;
    }
    stats.diff_pass += 1;
    let is_subtitle = region == SampleRegion::Subtitle;
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
                let q = crate::capture::frame_diff::Rect {
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
            layout_regions = regions;
        }
    }

    // TD-025：BGRA8 帧 → 内存 RgbImage 直送 OCR（不再写磁盘临时 BMP，杜绝崩溃残留）
    let Some(rgb) = bgra_to_rgb_image(&frame.bgraw, frame.width, frame.height) else { return };
    // M6/REQ-051：OCR 输入图 aHash（关键帧样本去重/聚类输入）
    let ocr_input_hash = crate::ocr_cache::average_hash(&rgb);
    // M4/REQ-048：全帧分支优先分区域 OCR（版面区域 → 区域裁剪 → 识别 → 坐标还原）；
    // 无区域（空白帧/分析失败）回退整帧直跑（现状行为，回退链）
    if !is_subtitle && !layout_regions.is_empty() {
        match region_ocr_blocks(&frame, engines, &layout_regions, stats) {
            Ok(blocks) => {
                stats.ocr_ok += 1;
                *last_ocr_at = Instant::now();
                handle_full_frame(
                    &frame, &blocks, db, app, session_id, last_full_texts, frame_samples,
                    last_archived_text, last_archived_at, image_store, ocr_input_hash,
                );
            }
            Err(e) => {
                // 区域编排失败 → 回退整帧直跑（低置信区域已标记 unknown，不丢内容）
                stats.ocr_err += 1;
                eprintln!("[ScreenWorker] 分区域 OCR 失败，回退整帧: {}", e);
                match engines.recognize_image(rgb) {
                    Ok(blocks) => {
                        stats.ocr_ok += 1;
                        *last_ocr_at = Instant::now();
                        handle_full_frame(
                            &frame, &blocks, db, app, session_id, last_full_texts, frame_samples,
                            last_archived_text, last_archived_at, image_store, ocr_input_hash,
                        );
                    }
                    Err(e2) => {
                        stats.ocr_err += 1;
                        eprintln!("[ScreenWorker] OCR 识别失败（下帧重试）: {}", e2)
                    }
                }
            }
        }
    } else {
        match engines.recognize_image(rgb) {
            Ok(blocks) => {
                stats.ocr_ok += 1;
                // 成功识别即刷新 OCR 时刻（无论是否产出文本——防漏检兜底周期基准）
                *last_ocr_at = Instant::now();
                if is_subtitle {
                    // M2/REQ-037：bbox 回喂 ROI 跟踪器（锁定/失效判定；
                    // 裁剪图坐标系 + 原点平移 + TD-046 缩放比反算）
                    let boxes: Vec<crate::types::TextBox> =
                        blocks.iter().filter_map(|b| b.bbox).collect();
                    roi_tracker.feed_ocr(&boxes, crop_origin, ocr_input_scale);
                    handle_subtitle_frame(
                        &frame, &blocks, voter, last_frame_text, last_preview, db, app, session_id, subtitle_segments,
                    );
                } else {
                    handle_full_frame(
                        &frame, &blocks, db, app, session_id, last_full_texts, frame_samples,
                        last_archived_text, last_archived_at, image_store, ocr_input_hash,
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

/// 分区域 OCR（REQ-048 编排器）：区域调度（权重+封顶）→ 逐区域裁剪 →
/// 区域级预处理（放大）→ 识别 → 坐标还原 + region_kind 标注 → 合并。
///
/// @ai-context: 区域识别失败不阻断整体（该区域标记 unknown，低置信 → 图片归档候选）；
///              坐标还原（map_to_frame）为纯函数单测覆盖（region_ocr_tests）。
/// @ai-context: 每帧最多 MAX_REGIONS_PER_FRAME 区（防多区域调用失控）。
fn region_ocr_blocks(
    frame: &CapturedFrame,
    engines: &EnginePool,
    regions: &[crate::layout_analyzer::LayoutRegion],
    stats: &mut ScreenStats,
) -> crate::error::Result<Vec<crate::types::OcrBlock>> {
    let scheduled = crate::region_ocr::schedule_regions(regions);
    let mut merged: Vec<crate::types::OcrBlock> = Vec::new();
    for region in scheduled {
        let Some(spec) = crate::region_ocr::crop_spec(region, frame.width, frame.height) else {
            continue;
        };
        // 内存裁剪（含边距）→ 区域级预处理（表格/公式放大）
        let Some((mut crop, mut cw, mut ch)) =
            crate::region_ocr::crop_region_bgra(&frame.bgraw, frame.width, frame.height, &spec)
        else {
            continue;
        };
        if let Some((up, uw, uh)) = crate::region_ocr::upscale_bgra(&crop, cw, ch, spec.scale) {
            crop = up;
            cw = uw;
            ch = uh;
        }
        let Some(rgb) = bgra_to_rgb_image(&crop, cw, ch) else { continue };
        match engines.recognize_image(rgb) {
            Ok(blocks) => {
                for mut b in blocks {
                    // 坐标还原：裁剪图坐标 → 原帧坐标（bbox 相对 OCR 输入图）
                    if let Some(bbox) = b.bbox {
                        let origin = crate::capture::frame_diff::Rect {
                            left: region.x as i32,
                            top: region.y as i32,
                            right: (region.x + region.w) as i32,
                            bottom: (region.y + region.h) as i32,
                        };
                        let mapped = crate::region_ocr::map_to_frame(
                            crate::region_ocr::FrameCoord { x: bbox.x as i32, y: bbox.y as i32 },
                            &origin,
                            spec.scale,
                        );
                        b.bbox = Some(crate::types::TextBox {
                            x: mapped.x as f32,
                            y: mapped.y as f32,
                            w: bbox.w / spec.scale,
                            h: bbox.h / spec.scale,
                        });
                    }
                    // 区域类型标注（M4：产物/补缝判定器消费）
                    b.region_kind = Some(region.kind.as_str().to_string());
                    merged.push(b);
                }
            }
            Err(e) => {
                // 区域级失败：标记 unknown 不阻断整体（诚实降级）
                stats.ocr_err += 1;
                eprintln!("[ScreenWorker] 区域 {:?} 识别失败（标记 unknown）: {}", region.kind, e);
            }
        }
    }
    Ok(merged)
}

/// BGRA8 像素 → image::RgbImage（纯函数；尺寸与像素长度不匹配返回 None）。
fn bgra_to_rgb_image(bgraw: &[u8], width: u32, height: u32) -> Option<image::RgbImage> {
    let pixel_len = width as usize * height as usize * 4;
    if width == 0 || height == 0 || bgraw.len() != pixel_len {
        return None;
    }
    let mut rgb = Vec::with_capacity(pixel_len / 4 * 3);
    for px in bgraw.chunks_exact(4) {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    image::RgbImage::from_raw(width, height, rgb)
}

/// 字幕区帧：文本拼接 → 滚动检测 → 多帧投票（T2）→ 切换时定稿落库。
///
/// @ai-context: 参数多源于编排上下文传递（DB/事件/状态/投票器），聚合会破坏内聚，登记豁免。
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
) {
    let text = blocks.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join("");
    if text.trim().is_empty() {
        return;
    }
    // 滚动字幕（股票/歌词）丢弃——投票分组对逐帧漂移文本失效
    let prev = last_frame_text.clone().unwrap_or_default();
    if is_scrolling(&text, &prev, 0.6) {
        return;
    }
    *last_frame_text = Some(text.clone());
    // 多帧投票：同字幕帧累积为样本；字幕切换时定稿上一组（投票纠错 + 真实时间轴）
    if let Some(voted) = voter.observe(&text, frame.timestamp_ms) {
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
fn persist_voted_subtitle(
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

/// 全帧：画面要点落 OCR 块（低置信度过滤 + 帧间文本去重 + 实时事件推送）。
///
/// @ai-context: 去重（与导入链路 same_texts 同口径）：强制 OCR 兜底会使静止画面
///              每 15s 重复识别——文本集合与上次完全一致时跳过落库，防要点列表刷屏。
/// @ai-context: 落库成功即 emit live:ocr（前端实时画面流，简要单行卡片）。
/// @ai-context: M6/REQ-051：关键帧样本收集（停止时投票）+ 新画面文本归档存图
///              （三层图结构参考图集数据源；预算上限由 image_store 控制）。
#[allow(clippy::too_many_arguments)]
fn handle_full_frame(
    frame: &CapturedFrame,
    blocks: &[crate::types::OcrBlock],
    db: &Db,
    app: &tauri::AppHandle,
    session_id: i64,
    last_texts: &mut Vec<String>,
    frame_samples: &mut Vec<crate::frame_cluster::FrameSample>,
    last_archived_text: &mut Option<String>,
    last_archived_at: &mut Option<Instant>,
    image_store: Option<&mut crate::image_store::SessionImageStore>,
    ocr_input_hash: u64,
) {
    let texts: Vec<String> = blocks
        .iter()
        .filter(|b| b.score >= 0.5 && !b.text.trim().is_empty())
        .map(|b| b.text.clone())
        .collect();
    // M6：关键帧样本收集（全帧分支每次 OCR 成功记录；停止时投票器消费）
    if !texts.is_empty() {
        frame_samples.push(crate::frame_cluster::FrameSample {
            timestamp_ms: frame.timestamp_ms,
            ahash: ocr_input_hash,
            ocr_text: Some(texts.join(" ")),
            change_magnitude: 0.0,
        });
    }
    // M6：新画面文本 → 归档存图（参考图集；同文本不重复归档 + 2s 防抖）
    let joined = texts.join(" ");
    let is_new_text = last_archived_text.as_deref() != Some(joined.as_str());
    let interval_ok = last_archived_at.is_none_or(|t| t.elapsed() >= Duration::from_secs(2));
    if is_new_text && interval_ok {
        if let Some(store) = image_store {
            if let Err(e) = store.save_frame(
                frame.timestamp_ms,
                &frame.bgraw,
                frame.width,
                frame.height,
            ) {
                // 归档失败不阻断 OCR 主链路（预算满/IO 错误静默降级，日志可观测）
                eprintln!("[ScreenWorker] 关键帧归档失败: {}", e);
            }
        }
        *last_archived_text = Some(joined);
        *last_archived_at = Some(Instant::now());
    }
    if crate::import_frame::same_texts(&texts, last_texts) {
        return;
    }
    for block in blocks {
        if block.score >= 0.5 && !block.text.trim().is_empty() {
            let _ = db.add_ocr_block(&NewSessionOcrBlock {
                session_id,
                timestamp_ms: frame.timestamp_ms,
                text: block.text.clone(),
                score: block.score,
                region: "full".to_string(),
                // M4/REQ-048：整帧直跑路径无区域标注（None=兼容旧数据口径）
                region_kind: None,
            });
            let _ = app.emit(
                "live:ocr",
                OcrEvent { timestamp_ms: frame.timestamp_ms, text: block.text.clone() },
            );
        }
    }
    *last_texts = texts;
}

/// 融合并重写会话段：单事务原子替换（删除原段 + 插入融合时间轴，ADR-005 §3）。
///
/// @ai-context: 原子性由 db.replace_segments 保证（审查 M1 修复）——
///              失败整体回滚，原段不丢失。
/// @ai-context: REQ-031 无字幕短路：subtitles 为空时融合四规则全部退化为无操作
///              （融合输出 = ASR 原样拷贝）——直接跳过，省去无意义的全量重写。
pub fn rewrite_with_fusion(
    db: &Db,
    session_id: i64,
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
) -> Result<()> {
    if subtitles.is_empty() {
        eprintln!("[Fusion] 会话 {} 无字幕段，短路跳过融合（ASR 段原样保留）", session_id);
        return Ok(());
    }
    let fused = merge_transcript(subtitles, asr_segments, 0);
    if fused.is_empty() {
        return Ok(());
    }
    let items: Vec<NewSessionSegment> = fused
        .iter()
        .map(|s| NewSessionSegment {
            session_id,
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            source: match s.source {
                FusedSource::Subtitle => "subtitle",
                FusedSource::Asr => "asr",
                FusedSource::Fused => "fused",
            }
            .to_string(),
            confidence: None,
        })
        .collect();
    db.replace_segments(session_id, &items)?;
    Ok(())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_frame_tests.rs"]
mod tests;
