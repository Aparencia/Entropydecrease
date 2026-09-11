//! 播放器行为/信息探测（live_session_frame.rs 的拆分子模块）。
//!
//! @ai-context: 屏幕采样拍的两个**低频旁路**集中于此——5s 播放器暂停图标检测
//!              （Pause↔Play 状态机，从 latest_frame 取帧做纯 CV）与 10s 播放器区域
//!              OCR 信息探测（时间对/分P → live:session-info）。两者都是"无证据不推断"：
//!              无帧/转换失败/OCR 失败一律静默保持或跳过。
//! @ai-context: 副作用 = 读 latest_frame 共享槽（`lock().ok().and_then(|g| g.clone())` 为语句级短锁：
//!              守卫 move 进闭包、返回即释放 ⇒ 块体 CV/落库/emit/OCR **无锁**〔Task 3 评审 rustc 探针实证〕）/
//!              `db` 落库 / `pause.request_pause` 条件锁存 / `app.emit`（live:media-paused、live:session-info）/ 有界等待 OCR（OCR_REQUEST_TIMEOUT）。
//! @ai-context: `probe_player_info` 同时服务暂停轻量轮询（live_session_pause_poll），
//!              故为 `pub(super)` 自由函数而非方法；10s/5s 节流由调用方控制。

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Emitter;

use super::{FrameWorkerState, LatestCapturedFrame};

impl FrameWorkerState {
    /// 播放器行为检测拍 + 播放器信息探测拍（同一采样 tick 内的两个低频旁路）。
    ///
    /// @ai-context: `comp_epoch` 由调用方注入（主循环当拍构造）——不在此重算，
    ///              否则会多读一次 `total_paused_ms` 改变事件时戳基准。
    pub(super) fn player_tick(&mut self, comp_epoch: Instant) {
        // M1/REQ-125：播放器行为检测（5s 节流——非每帧；从最新帧缓存取帧做
        // 暂停图标检测；Pause→无图标 状态机推导 Play 事件；无帧/转换失败 →
        // 状态保持（诚实：无证据不推断））
        // 审查修复（v0.7.0 新增代码审查）：
        // ① MEDIUM-6：now_ms 在此处现取（原用采样块开头的旧时刻——OCR 耗时
        //    + 5s 周期叠加使暂停事件时戳滞后 5-10s）；
        // ② MEDIUM-9：首次检测只初始化状态不写事件（录制开始前已暂停的视频
        //    首轮 paused=true ≠ 初始 false 会写非转换假 Pause）
        if self.last_player_check_at.elapsed() >= Duration::from_secs(5) {
            self.last_player_check_at = Instant::now();
            let check_now_ms = comp_epoch.elapsed().as_millis() as u64;
            if let Some(f) = self.latest_frame.lock().ok().and_then(|g| g.clone()) {
                if let Some(img) =
                    crate::region_ocr::bgra_to_rgb_image(&f.bgraw, f.width, f.height)
                {
                    let paused =
                        crate::player_behavior::detect_player_action(&img).is_some();
                    if !self.player_state_initialized {
                        // 首次检测：仅记录基线状态，不写事件（防假 Pause）
                        self.player_state_initialized = true;
                        self.last_player_paused = paused;
                        // P2：基线即暂停（会话开始时视频已暂停）→ 自动暂停。
                        // 不写假 Pause 事件（MEDIUM-9），但锁存媒体条件——
                        // 音频/捕获线程沿边沿同步暂停（批 2a 经 request API）
                        if paused && !self.pause.paused.load(Ordering::SeqCst) {
                            let _ = self.pause
                                .request_pause(crate::pause_state::PauseSource::Media);
                            let _ = self.app.emit("live:media-paused", ());
                            eprintln!("[ScreenWorker] 视频处于暂停态，会话自动暂停");
                        }
                    } else if paused != self.last_player_paused {
                        self.last_player_paused = paused;
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
                            self.session_id,
                            &self.db,
                        );
                        if paused && !self.pause.paused.load(Ordering::SeqCst) {
                            // P2：检测到视频暂停 → 自动暂停捕获（媒体条件；
                            // 下一轮循环进入轻量轮询，恢复检测不中断）。
                            // 审查 F5：已暂停（pause=true）时不重复记账/发事件
                            // （同迭代双系统重复 Pause——机器层同样幂等）
                            let _ = self.pause
                                .request_pause(crate::pause_state::PauseSource::Media);
                            let _ = self.app.emit("live:media-paused", ());
                            eprintln!("[ScreenWorker] 检测到视频暂停，自动暂停捕获");
                        }
                    } else if paused && !self.pause.paused.load(Ordering::SeqCst) {
                        // P2 兜底（批 2a 语义推广——机器层"manual 解除瞬间重评
                        // 估 auto 条件"的 worker 侧实现）：手动恢复后视频仍
                        // 暂停 → 重新锁存媒体条件（捕获跟随视频状态，用户
                        // 手动继续不覆盖）；经 request API 只记条件不动作
                        let _ = self.pause
                            .request_pause(crate::pause_state::PauseSource::Media);
                        let _ = self.app.emit("live:media-paused", ());
                        eprintln!("[ScreenWorker] 视频处于暂停态，重新自动暂停");
                    }
                }
            }
        }
        // v0.7.2（REQ-151）：播放器信息探测（10s 节流）——播放器区域 OCR
        // 文本（时间对 `12:34 / 1:23:45`、分P `P3/12`）→ 会话信息更新 →
        // 值变化才 emit live:session-info（防 IPC 风暴）；无播放区域/OCR
        // 失败 → 静默跳过（诚实：不猜不填；下轮再试）
        if self.last_info_probe_at.elapsed() >= Duration::from_secs(10) {
            self.last_info_probe_at = Instant::now();
            probe_player_info(&self.app, &self.engines, &self.session_info, &self.roi_tracker, &self.latest_frame);
        }
    }
}

/// 播放器信息探测（REQ-151，v0.7.2）：播放器区域 OCR 文本（时间对/分P）→
/// 会话信息更新 → 值变化才 emit live:session-info（防 IPC 风暴）。
///
/// @ai-context: 主采样循环与自动暂停轻量轮询共用——暂停时播放器时间文本仍
///              在画面，时长/集号识别不因暂停缺席（10s 节流由调用方控制）；
///              无播放区域/OCR 失败 → 静默跳过（诚实：不猜不填，下轮再试）。
pub(super) fn probe_player_info(
    app: &tauri::AppHandle,
    engines: &crate::engine::EnginePool,
    session_info: &crate::session_info::SessionInfoCollector,
    roi_tracker: &crate::region_tracker::RoiTracker,
    latest_frame: &Arc<Mutex<Option<LatestCapturedFrame>>>,
) {
    let mut probe = latest_frame
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or(LatestCapturedFrame { timestamp_ms: 0, bgraw: Vec::new(), width: 0, height: 0 });
    if probe.bgraw.is_empty() {
        return;
    }
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
    if probe.bgraw.is_empty() {
        return;
    }
    // P4：OCR 输入缩小（播放器 UI 文字大，质量无损）
    crate::capture::frame_diff::downscale_bgra(&mut probe.bgraw, &mut probe.width, &mut probe.height, 960);
    let Some(img) =
        crate::region_ocr::bgra_to_rgb_image(&probe.bgraw, probe.width, probe.height)
    else {
        return;
    };
    // H2 修复：有界等待变体——探测帧 OCR 卡死时超时即弃（实时链路不得无限阻塞）
    let Ok(blocks) = engines.recognize_image_timeout(img, crate::engine::OCR_REQUEST_TIMEOUT) else { return };
    let text = blocks.iter().map(|b| b.text.as_str()).collect::<Vec<_>>().join(" ");
    if session_info.observe_player_text(&text) {
        let _ = app.emit("live:session-info", session_info.snapshot());
    }
}
