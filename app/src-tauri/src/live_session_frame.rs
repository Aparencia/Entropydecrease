//! 实时会话屏幕采样线程（live_session.rs 的拆分子模块）。
//!
//! @ai-context: 屏幕采样在独立线程运行（run_screen_worker，TD-026 修复）——
//!              OCR 推理不再阻塞会话线程的音频消费；语音活跃度（B3）驱动自适应采样。
//! @ai-context: 帧处理（网格差异触发/字幕 OCR/面板抑制/落库）已拆至
//!              live_frame_process.rs（v0.6.0 ADR-011 拆分，本文件 >600 行
//!              硬拆，见 standards/line-limit-exemptions.md）。
//! @ai-context: 时间戳统一（ADR-008 A1）：帧时间戳在捕获后覆写为会话纪元 elapsed，
//!              与音频块、flush 尾句同一基准（由 live_frame_process 执行）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::frame_diff::{DualRateScheduler, SampleRegion};
use crate::capture::ScreenCaptureSampler;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::fusion::SubtitleSegment;
use crate::live_frame_process::{
    capture_latest_only, persist_voted_subtitle, process_frame, ScreenStats, TriggerState,
};
use crate::subtitle_ocr::SubtitleVoter;

/// 采样节拍（ms）：与音频消费解耦，固定 1s 一拍（审查 M5 修复）。
const SAMPLE_TICK_MS: u64 = 1000;
/// 采样线程轮询休眠（ms）——空转粒度，影响停止响应延迟。
const WORKER_POLL_MS: u64 = 50;
/// 空闲探针间隔（ms）：REQ-073 空闲降频期间低频全帧采样——无声视频恢复
/// 播放（画面变化）靠探针检测唤醒（5s 一次，成本可忽略）。
const IDLE_PROBE_INTERVAL_MS: u64 = 5_000;

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
    // v0.6.0 M1（REQ-083）：UI 垃圾黑名单（字幕源头过滤——文本特征命中不进投票器）
    ui_junk: crate::ui_junk::UiJunkList,
    // v0.7.0 M2（REQ-128）：前台时间线监控（2s 轮询 observe → ForegroundSwitch 落库）
    mut foreground_monitor: crate::foreground_timeline::ForegroundMonitor,
    // 2026-08 A1：会话暂停共享状态（暂停跳过采样；恢复后时间戳补偿暂停时长）
    pause: crate::capture::audio_loopback::SessionPause,
    // v0.7.2（REQ-151）：会话信息聚合（播放器 OCR 文本 → 平台/时长/合集信息面板）
    session_info: crate::session_info::SessionInfoCollector,
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
    let mut scheduler = DualRateScheduler::from_budget(
        budget.subtitle_every,
        budget.full_every,
        budget.silent_subtitle_every,
        budget.silent_full_every,
    );
    // ADR-011：触发链路状态（全帧/ROI 网格 diff + 面板检测 + OCR 时刻）
    let mut trigger = TriggerState::new();
    let mut voter = SubtitleVoter::new();
    let mut last_frame_text: Option<String> = None;
    let mut last_preview = String::new();
    let mut last_sample_at = Instant::now();
    // 捕获失败日志节流状态（屏幕链路失效时每帧报错会刷屏，5s 一次）
    let mut last_capture_error: Option<Instant> = None;
    // 全帧文本去重（强制 OCR 下静止画面不重复落库）
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
    // M5/REQ-073（PF6）：空闲降频——静音+画面无变化持续 → 跳过采样
    // （引擎自然空闲）；空闲期低频探针（5s 一次全帧）检测画面恢复
    let mut idle_governor = crate::idle_governor::IdleGovernor::new(Default::default());
    let mut last_diff_pass: u64 = 0;
    let mut last_probe_ms: u64 = 0;
    // M16/REQ-128：前台时间线轮询节流（2s 一次；epoch 纪元 ms 时刻）
    let mut last_fg_poll_ms: u64 = 0;
    // M1/REQ-125：播放器行为检测节流（5s 一次；从最新帧缓存取帧）+ 暂停状态机
    // 审查修复：player_state_initialized 标记首次检测（只初始化基线不写事件）
    let mut last_player_check_at = Instant::now();
    let mut last_player_paused = false;
    let mut player_state_initialized = false;
    // v0.7.2（REQ-151）：播放器信息探测节流（10s 一次——播放器区域 OCR 成本
    // ~100-300ms，秒级粒度足够；信息变化才 emit）
    let mut last_info_probe_at = Instant::now();
    // 2026-08 A1：暂停边沿跟踪（暂停期画面链整体冻结：采样/前台监控/播放器
    // 检测全部跳过——"会话时间"在暂停期间不前进）
    let mut worker_paused = pause.paused.load(Ordering::SeqCst);
    // P2 自动暂停：本次暂停是否由本 worker 的视频检测置位（置位时保持轻量
    // 轮询找恢复信号；手动暂停保持 A1 全冻结，二者互斥由标志来源区分）
    let mut auto_paused = false;

    while !stop.load(Ordering::SeqCst) {
        // ── 暂停检查（2026-08 A1 硬暂停；P2 自动暂停扩展）──
        let paused_now = pause.paused.load(Ordering::SeqCst);
        if paused_now {
            if !worker_paused {
                worker_paused = true;
                eprintln!(
                    "[ScreenWorker] 会话暂停，画面链{}",
                    if auto_paused { "进入轻量轮询（等视频恢复）" } else { "冻结" }
                );
            }
            if auto_paused {
                // P2 自动暂停：轻量轮询——仅取帧刷新 latest_frame + 播放检测。
                // 检测读的就是 latest_frame，不刷新则永远看到暂停帧 → 无法发现
                // 恢复；1s 一拍仅取帧（零分析），5s 一拍检测（沿用 REQ-125 节流）
                let comp_epoch = epoch
                    + Duration::from_millis(pause.total_paused_ms.load(Ordering::SeqCst));
                if last_sample_at.elapsed().as_millis() as u64 >= SAMPLE_TICK_MS {
                    last_sample_at = Instant::now();
                    capture_latest_only(
                        screen.as_mut(),
                        &app,
                        comp_epoch,
                        &latest_frame,
                        &mut last_capture_error,
                    );
                    if last_player_check_at.elapsed() >= Duration::from_secs(5) {
                        last_player_check_at = Instant::now();
                        let check_now_ms = comp_epoch.elapsed().as_millis() as u64;
                        if let Some(f) = latest_frame.lock().ok().and_then(|g| g.clone()) {
                            if let Some(img) =
                                crate::region_ocr::bgra_to_rgb_image(&f.bgraw, f.width, f.height)
                            {
                                let still_paused =
                                    crate::player_behavior::detect_player_action(&img).is_some();
                                if !still_paused {
                                    // 恢复播放：落 Play 事件（REQ-125 语义一致）+
                                    // 清自动暂停（音频/捕获线程沿边沿自动恢复）
                                    crate::player_behavior::record_action(
                                        &crate::player_behavior::PlayerAction {
                                            kind: crate::player_behavior::PlayerActionKind::Play,
                                            value: None,
                                        },
                                        check_now_ms,
                                        session_id,
                                        &db,
                                    );
                                    pause.paused.store(false, Ordering::SeqCst);
                                    auto_paused = false;
                                    last_player_paused = false;
                                    eprintln!("[ScreenWorker] 视频恢复播放，自动解除暂停");
                                }
                            }
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
            continue;
        }
        if worker_paused {
            // 恢复：短暂等待捕获线程更新累计补偿时长（10ms 粒度），
            // 防恢复首帧时间戳读到旧补偿值（含暂停时长偏差）
            worker_paused = false;
            std::thread::sleep(Duration::from_millis(100));
            eprintln!("[ScreenWorker] 会话恢复，画面链继续");
        }
        // 时间戳补偿（2026-08 A1）：会话时间 = epoch - 累计暂停时长；
        // process_frame 内部以 epoch 为基准生成帧时间戳——每次构造补偿后的
        // 纪元传入（暂停期间不采样，补偿值在恢复后恒定）
        let comp_epoch = epoch
            + Duration::from_millis(pause.total_paused_ms.load(Ordering::SeqCst));
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
            // REQ-084：前台窗口切换检测（每秒一次）——前台与录制目标不一致 →
            // ROI 强制重扫 + 字幕处理冻结（防其他窗口底部内容被当字幕）；
            // 无目标窗口（全屏捕获）或探测失败 → 静默跳过（误触发阈值校准）
            let foreign = match (hwnd, crate::windows::foreground_hwnd()) {
                (Some(target), Some(fg)) => fg != target,
                _ => false,
            };
            roi_tracker.on_foreground_switch(foreign);
            // B3（P3 简化版）+ M4：语音活跃度 + 负载档驱动自适应采样
            let mut region = scheduler.next_region(speech_active.load(Ordering::Relaxed), degraded);
            // M5/REQ-073：空闲降频状态机——画面变化信号 = diff 通过计数增长
            // （process_frame 内更新，同线程可见）；idle 时跳过采样（引擎
            // 阻塞空闲零 CPU）；空闲期低频探针（5s 一次全帧）检测无声恢复
            let now_ms = comp_epoch.elapsed().as_millis() as u64;
            // M16/REQ-128：前台时间线监控（独立 2s 轮询——不改 region_tracker 行为；
            // 变化 → ForegroundSwitch 事件落库；观测失败 None → 静默跳过）
            if now_ms.saturating_sub(last_fg_poll_ms) >= 2_000 {
                last_fg_poll_ms = now_ms;
                foreground_monitor.observe(
                    crate::windows::foreground_hwnd(),
                    now_ms,
                    session_id,
                    &db,
                );
            }
            let changed = stats.diff_pass > last_diff_pass;
            last_diff_pass = stats.diff_pass;
            let _ = idle_governor.observe(
                speech_active.load(Ordering::Relaxed),
                changed,
                now_ms,
            );
            let idle = idle_governor.is_idle();
            let probe = idle && now_ms.saturating_sub(last_probe_ms) >= IDLE_PROBE_INTERVAL_MS;
            if probe {
                last_probe_ms = now_ms;
                region = SampleRegion::Full;
            }
            if (region != SampleRegion::Skip && !idle) || probe {
                process_frame(
                    screen.as_mut(), &mut trigger, &mut voter, &mut last_frame_text, &mut last_preview,
                    &db, &engines, &app, session_id, region, &subtitle_segments, comp_epoch,
                    &mut last_capture_error, &mut last_full_texts, &mut stats,
                    &mut roi_tracker, &mut layout_cache, &mut frame_samples,
                    &mut last_archived_text, &mut last_archived_at, &latest_frame,
                    &mut image_store, &ui_junk,
                );
            }
            // M1/REQ-125：播放器行为检测（5s 节流——非每帧；从最新帧缓存取帧做
            // 暂停图标检测；Pause→无图标 状态机推导 Play 事件；无帧/转换失败 →
            // 状态保持（诚实：无证据不推断））
            // 审查修复（v0.7.0 新增代码审查）：
            // ① MEDIUM-6：now_ms 在此处现取（原用采样块开头的旧时刻——OCR 耗时
            //    + 5s 周期叠加使暂停事件时戳滞后 5-10s）；
            // ② MEDIUM-9：首次检测只初始化状态不写事件（录制开始前已暂停的视频
            //    首轮 paused=true ≠ 初始 false 会写非转换假 Pause）
            if last_player_check_at.elapsed() >= Duration::from_secs(5) {
                last_player_check_at = Instant::now();
                let check_now_ms = comp_epoch.elapsed().as_millis() as u64;
                if let Some(f) = latest_frame.lock().ok().and_then(|g| g.clone()) {
                    if let Some(img) =
                        crate::region_ocr::bgra_to_rgb_image(&f.bgraw, f.width, f.height)
                    {
                        let paused =
                            crate::player_behavior::detect_player_action(&img).is_some();
                        if !player_state_initialized {
                            // 首次检测：仅记录基线状态，不写事件（防假 Pause）
                            player_state_initialized = true;
                            last_player_paused = paused;
                            // P2：基线即暂停（会话开始时视频已暂停）→ 自动暂停。
                            // 不写假 Pause 事件（MEDIUM-9），但置共享标志——
                            // 音频/捕获线程沿边沿同步暂停
                            if paused && !pause.paused.load(Ordering::SeqCst) {
                                pause.paused.store(true, Ordering::SeqCst);
                                auto_paused = true;
                                eprintln!("[ScreenWorker] 视频处于暂停态，会话自动暂停");
                            }
                        } else if paused != last_player_paused {
                            last_player_paused = paused;
                            let action = if paused {
                                crate::player_behavior::PlayerAction {
                                    kind: crate::player_behavior::PlayerActionKind::Pause,
                                    value: None,
                                }
                            } else {
                                crate::player_behavior::PlayerAction {
                                    kind: crate::player_behavior::PlayerActionKind::Play,
                                    value: None,
                                }
                            };
                            crate::player_behavior::record_action(
                                &action,
                                check_now_ms,
                                session_id,
                                &db,
                            );
                            if paused {
                                // P2：检测到视频暂停 → 自动暂停捕获（共享标志；
                                // 下一轮循环进入轻量轮询，恢复检测不中断）
                                pause.paused.store(true, Ordering::SeqCst);
                                auto_paused = true;
                                eprintln!("[ScreenWorker] 检测到视频暂停，自动暂停捕获");
                            }
                        } else if paused && !pause.paused.load(Ordering::SeqCst) {
                            // P2 兜底：手动恢复后视频仍暂停 → 重新自动暂停
                            // （语义：捕获跟随视频状态，用户手动继续不覆盖）
                            pause.paused.store(true, Ordering::SeqCst);
                            auto_paused = true;
                            eprintln!("[ScreenWorker] 视频处于暂停态，重新自动暂停");
                        }
                    }
                }
            }
            // v0.7.2（REQ-151）：播放器信息探测（10s 节流）——播放器区域 OCR
            // 文本（时间对 `12:34 / 1:23:45`、分P `P3/12`）→ 会话信息更新 →
            // 值变化才 emit live:session-info（防 IPC 风暴）；无播放区域/OCR
            // 失败 → 静默跳过（诚实：不猜不填；下轮再试）
            if last_info_probe_at.elapsed() >= Duration::from_secs(10) {
                last_info_probe_at = Instant::now();
                let mut probe =
                    latest_frame.lock().ok().and_then(|g| g.clone()).unwrap_or(LatestCapturedFrame {
                        timestamp_ms: 0,
                        bgraw: Vec::new(),
                        width: 0,
                        height: 0,
                    });
                if !probe.bgraw.is_empty() {
                    if let Some(rect) = roi_tracker.playback_rect() {
                        let w = probe.width as i32;
                        let h = probe.height as i32;
                        let q = crate::capture::frame_diff::Rect {
                            left: rect.left.clamp(0, w),
                            top: rect.top.clamp(0, h),
                            right: rect.right.clamp(0, w),
                            bottom: rect.bottom.clamp(0, h),
                        };
                        if q.width() > 0 && q.height() > 0 {
                            crate::capture::frame_diff::crop_frame(
                                &mut probe.bgraw,
                                &mut probe.width,
                                &mut probe.height,
                                Some(&q),
                            );
                        }
                    }
                    if !probe.bgraw.is_empty() {
                        // P4：OCR 输入缩小（播放器 UI 文字大，质量无损）
                        crate::capture::frame_diff::downscale_bgra(
                            &mut probe.bgraw,
                            &mut probe.width,
                            &mut probe.height,
                            960,
                        );
                        if let Some(img) = crate::region_ocr::bgra_to_rgb_image(
                            &probe.bgraw,
                            probe.width,
                            probe.height,
                        ) {
                            if let Ok(blocks) = engines.recognize_image(img) {
                                let text = blocks
                                    .iter()
                                    .map(|b| b.text.as_str())
                                    .collect::<Vec<_>>()
                                    .join(" ");
                                if session_info.observe_player_text(&text) {
                                    let _ = app.emit(
                                        "live:session-info",
                                        session_info.snapshot(),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
        // 诊断：每 15s 打印采样统计（会话无 OCR 时定位失败阶段；静默失败可见化）
        if stats
            .last_log_at
            .is_none_or(|t| t.elapsed() >= Duration::from_secs(15))
        {
            stats.last_log_at = Some(Instant::now());
            eprintln!(
                "[ScreenWorker] 采样统计: sampled={} no_change={} capture_err={} diff_pass={} diff_skip={} ocr_ok={} ocr_err={} junk_filtered={} panel_filtered={}",
                stats.sampled, stats.no_change, stats.capture_err, stats.diff_pass, stats.diff_skip, stats.ocr_ok, stats.ocr_err, stats.junk_filtered, stats.panel_filtered
            );
        }
        std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
    }
    // 停止：冲刷未定稿的最后一组字幕（否则末句字幕丢失，T2 语义要求）
    // 2026-08 A1：flush 时间戳同样补偿暂停时长（会话时间基准）
    let flush_epoch = epoch
        + Duration::from_millis(pause.total_paused_ms.load(Ordering::SeqCst));
    if let Some(voted) = voter.flush(flush_epoch.elapsed().as_millis() as u64) {
        persist_voted_subtitle(&db, &app, session_id, &subtitle_segments, voted);
    }
    // M6/REQ-051：关键帧投票（课后精修：多信号筛选 → 关键图候选；产物层 M7 消费）
    crate::live_keyframes::vote_and_emit_keyframes(&frame_samples, &app, session_id);
    // 显式释放采样器（COM/DXGI 资源）——worker 退出即释放 duplication，
    // 防多会话快速连测时泄漏累积触发 DXGI 并发上限（4/5 会话无 OCR 排查项）
    drop(screen);
    eprintln!("[ScreenWorker] 屏幕采样线程退出（会话 {}）", session_id);
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_frame_tests.rs"]
mod tests;
