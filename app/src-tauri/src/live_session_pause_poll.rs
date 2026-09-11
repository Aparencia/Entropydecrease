//! 暂停隔离与轻量轮询（live_session_frame.rs 的拆分子模块）。
//!
//! @ai-context: 会话暂停期画面链的**双闸门**语义在此集中可见——manual 锁存期全冻结
//!              （`light_poll_enabled` 返回 false，worker 不跟随任何自动源）；media **或**
//!              fg 任一 auto 条件持有时维持 1s 取帧 + 媒体/播放器恢复检测，并周期性
//!              WGC 自愈（watchdog 探针）。前台门控拍（250ms）独立于采样拍，负责 fg
//!              条件的锁存与解除（互不解除，只解自己）。
//! @ai-context: 副作用 = 屏幕取帧（`capture_latest_only`）/ 播放器区域 OCR 探测 /
//!              `db` 落库（PlayerAction）/ `pause.request_*` 条件变更 / `app.emit`
//!              （live:media-resumed、live:session-info）；锁顺序与拆分前逐字一致。
//! @ai-context: 时间基准 = `self.compensated_epoch()`（补偿暂停时长）；取帧节流沿用
//!              `super::SAMPLE_TICK_MS`（1s），空转 `super::WORKER_POLL_MS`（50ms）留主循环。

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Emitter;

use super::live_session_liveness::watchdog_paused_probe;
use super::{FrameWorkerState, SAMPLE_TICK_MS};
use crate::live_frame_process::capture_latest_only;

/// REQ-291：媒体级"最近有声"判定（窗口=SOUND_RECENT_MS ≥ 采样拍 1s——
/// 保证一拍内出现的声音必被读到；锁中毒按无声处理，零阻断）。
pub(super) fn media_sound_recent(slot: &Arc<Mutex<Option<Instant>>>) -> bool {
    let last = slot.lock().ok().and_then(|g| *g);
    last.is_some_and(|t| t.elapsed().as_millis() as u64 <= crate::media_state::SOUND_RECENT_MS)
}

/// 暂停分支轻量轮询门控（纯函数；P2-4 审查修复抽离以便单测）。
///
/// @ai-context(Why)：manual 锁存期语义=用户冻结，worker 不跟随任何自动源
///              （全冻结不轮询）；media **或 fg** 任一 auto 条件持有时维持
///              1s 取帧 + 媒体检测拍——fg 暂停期媒体条件照常锁存：用户离开
///              期间视频暂停/结束即锁存 media（否则回位 fg 解除即"恢复采集"，
///              主路径需 ~3-4s 滞回才重锁存 media，期间环境声混入/UI 闪采集
///              中/时间轴伪运行段）；回位链条 = fg 解除 → media 仍 held →
///              不真恢复 → 视频恢复播放 → 自动真恢复。
pub(super) fn light_poll_enabled(cond: crate::pause_state::PauseConditions) -> bool {
    !cond.manual && (cond.media || cond.foreground)
}

impl FrameWorkerState {
    /// 前台自动暂停门控拍（批 2a；250ms 节拍——独立于 1s 采样拍）。
    pub(super) fn foreground_gate_tick(&mut self) {
        // ── 前台门控采样（批 2a；250ms 节拍）──
        // @ai-context: 非 manual 锁存期持续观察（含媒体/前台暂停期间——暂停期
        //              也允许前台源锁存/解除）；manual 锁存期冻结。观察分类：
        //              前台=目标 → Target；前台=本进程自窗（浮窗/overlay/原生
        //              对话框）→ Neutral（中性：不推进也不撤销）；其余 Foreign；
        //              全屏无锚点/探测失败 → Neutral（无证据不推断）
        if self.fg_eligible {
            let fg_now_ms = self.epoch.elapsed().as_millis() as u64;
            if fg_now_ms.saturating_sub(self.last_fg_gate_ms) >= crate::foreground_pause::FG_TICK_MS
                && !self.pause.manual_held()
            {
                self.last_fg_gate_ms = fg_now_ms;
                let obs = match (self.hwnd, crate::windows::foreground_hwnd()) {
                    (Some(target), Some(fg)) if fg == target => {
                        crate::foreground_pause::ForegroundObs::Target
                    }
                    (Some(_), Some(fg)) if crate::windows::is_self_hwnd(fg) => {
                        crate::foreground_pause::ForegroundObs::Neutral
                    }
                    (Some(_), Some(_)) => crate::foreground_pause::ForegroundObs::Foreign,
                    _ => crate::foreground_pause::ForegroundObs::Neutral,
                };
                match self.fg_gate.tick(obs) {
                    crate::foreground_pause::ForegroundDecision::Suspend => {
                        let _ = self.pause
                            .request_pause(crate::pause_state::PauseSource::Foreground);
                        eprintln!("[ScreenWorker] 前台离开目标窗口（连续确认）→ 自动暂停捕获");
                    }
                    crate::foreground_pause::ForegroundDecision::Resume => {
                        let _ = self.pause
                            .request_release(crate::pause_state::PauseSource::Foreground);
                        eprintln!("[ScreenWorker] 前台回到目标窗口 → 解除前台暂停");
                    }
                    crate::foreground_pause::ForegroundDecision::None => {}
                }
            }
        }
    }

    /// 暂停分支主体（已确认 `paused`）：冻结边沿打印 + 按 auto 条件轻量轮询。
    ///
    /// @ai-context: 调用方（主循环）随后 `sleep(WORKER_POLL_MS)` + `continue`——
    ///              空转粒度留在主循环，本方法只做一拍内的取帧/检测/探测。
    pub(super) fn poll_while_paused(&mut self) {
        if !self.worker_paused {
            self.worker_paused = true;
            eprintln!("[ScreenWorker] 会话暂停，画面链冻结（等恢复/来源解除）");
        }
        // 非 manual 锁存：auto 条件（media/fg）持有时轻量轮询找恢复信号。
        // P2-4：门控扩到 fg 期——fg 暂停期也维持媒体检测（视频暂停/结束即
        // 锁存 media；否则回位 fg 解除即伪恢复采集，见 light_poll_enabled
        // 注释）；fg 条件的解除仍由上方门控节拍负责（互不解除只解自己）
        if light_poll_enabled(self.pause.conditions()) {
            // P2 自动暂停：轻量轮询——仅取帧刷新 latest_frame + 播放检测。
            // 检测读的就是 latest_frame，不刷新则永远看到暂停帧 → 无法发现
            // 恢复；1s 一拍仅取帧（零分析），5s 一拍检测（沿用 REQ-125 节流）
            let comp_epoch = self.compensated_epoch();
            if self.last_sample_at.elapsed().as_millis() as u64 >= SAMPLE_TICK_MS {
                self.last_sample_at = Instant::now();
                capture_latest_only(
                    self.screen.as_mut(),
                    &self.app,
                    comp_epoch,
                    &self.latest_frame,
                    &mut self.last_capture_error,
                    &mut self.got_frame,
                );
                // 审查 F3：暂停期 watchdog 探针（无提示）——WGC 会话失活时
                // 恢复检测永远读不到新帧 → 自动暂停永久卡死；此处定期自愈。
                // P2-4：轻量轮询扩到 fg 期后探针随之覆盖 fg 期（fg 期视频
                // 暂停/画面停更同样会饿死媒体恢复检测，需同款 WGC 自愈；
                // 探针只观测 + 复活，任意暂停期无提示副作用）
                watchdog_paused_probe(
                    self.screen.as_mut(),
                    &mut self.liveness,
                    self.got_frame,
                    Instant::now(),
                );
                // REQ-291 快恢复（主通道）：声画任一恢复 ≤~1.5s 解除自动暂停
                // （OCR 5s 判定降级为辅助——保留其后兜底）
                if self.last_media_tick.elapsed() >= Duration::from_secs(1) {
                    self.last_media_tick = Instant::now();
                    let sound_recent = media_sound_recent(&self.media_sound);
                    if self.media_detector.tick(sound_recent, self.got_frame)
                        == crate::media_state::MediaDecision::Resume
                    {
                        let resume_ms = comp_epoch.elapsed().as_millis() as u64;
                        crate::player_behavior::record_action(
                            &crate::player_behavior::PlayerAction {
                                kind: crate::player_behavior::PlayerActionKind::Play,
                                value: None,
                            },
                            resume_ms,
                            self.session_id,
                            &self.db,
                        );
                        // 批 2a：经 request API 解除媒体条件（只解自己——fg
                        // 仍锁存则暂停延续，本 worker 暂停分支继续等）
                        let _ = self.pause
                            .request_release(crate::pause_state::PauseSource::Media);
                        self.last_player_paused = false;
                        let _ = self.app.emit("live:media-resumed", ());
                        eprintln!("[ScreenWorker] 随播随停：声画恢复 → 自动解除暂停");
                    }
                }
                // P2-4：OCR 恢复判定只在 media 条件持有时有意义——fg-only
                // 暂停期视频正常播放（帧无暂停图标），裸跑会把"播放中"误当
                // 恢复沿，每 5s 落一次伪 Play/伪 live:media-resumed（时间轴
                // 伪运行段）；media 持有时仍是 REQ-125 恢复兜底（5s 判定）
                if self.pause.media_held()
                    && self.last_player_check_at.elapsed() >= Duration::from_secs(5)
                {
                    self.last_player_check_at = Instant::now();
                    let check_now_ms = comp_epoch.elapsed().as_millis() as u64;
                    if let Some(f) = self.latest_frame.lock().ok().and_then(|g| g.clone()) {
                        if let Some(img) =
                            crate::region_ocr::bgra_to_rgb_image(&f.bgraw, f.width, f.height)
                        {
                            let still_paused =
                                crate::player_behavior::detect_player_action(&img).is_some();
                            if !still_paused {
                                // 恢复播放：落 Play 事件（REQ-125 语义一致）+
                                // 解除媒体条件（音频/捕获线程沿边沿自动恢复）
                                crate::player_behavior::record_action(
                                    &crate::player_behavior::PlayerAction {
                                        kind: crate::player_behavior::PlayerActionKind::Play,
                                        value: None,
                                    },
                                    check_now_ms,
                                    self.session_id,
                                    &self.db,
                                );
                                let _ = self.pause
                                    .request_release(crate::pause_state::PauseSource::Media);
                                self.last_player_paused = false;
                                let _ = self.app.emit("live:media-resumed", ());
                                eprintln!("[ScreenWorker] 视频恢复播放，自动解除暂停");
                            }
                        }
                    }
                }
                // v0.7.2（REQ-151）：暂停态也探测播放器信息（时间文本仍在画面）——
                // 会话开始时视频已暂停的场景，时长/集号识别不因此缺席
                if self.last_info_probe_at.elapsed() >= Duration::from_secs(10) {
                    self.last_info_probe_at = Instant::now();
                    super::probe_player_info(&self.app, &self.engines, &self.session_info, &self.roi_tracker, &self.latest_frame);
                }
            }
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_pause_poll_tests.rs"]
mod tests;
