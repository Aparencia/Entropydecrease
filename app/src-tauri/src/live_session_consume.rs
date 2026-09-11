//! 采样 tick 消费（live_session_frame.rs 的拆分子模块）。
//!
//! @ai-context: 1s 主循环里四个**节拍体**集中于此——①REQ-291 随播随停 1s 媒体拍
//!              （声画双通道 → 锁存 media 条件）；②M4 每 2s CPU 负载降级拍；
//!              ③采样 1s 拍（前台切换 ROI 重扫 → 自适应档/空闲降频 → `process_frame`
//!              → 停更监测 → 画面动时刻 → OCR 文本 FIFO 累计 → 档案拍 → 播放器拍）；
//!              ④15s 采样统计诊断打印。
//! @ai-context: **块间隐式数据流逐字保留**——`stats.diff_pass/ocr_ok` 在 `process_frame`
//!              内更新、其后才被 `profile_tick` 读差量；`accumulated_ocr_text` 更新后
//!              才被领域重评读；`got_frame` 由 `process_frame`/`capture_latest_only`
//!              内部清零后被读。顺序、读点位置、节拍层级一律不变。
//! @ai-context: 副作用 = 屏幕取帧 + OCR/落库（经 process_frame）/ `pause.request_pause`
//!              / `app.emit`（live:media-paused）/ eprintln 诊断；`speech_active` 读
//!              一律 `Relaxed`（勿改 SeqCst）；空转 sleep 留在主循环。

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::Emitter;

use super::live_session_liveness::liveness_check;
use super::live_session_pause_poll::media_sound_recent;
use super::{FrameWorkerState, IDLE_PROBE_INTERVAL_MS, SAMPLE_TICK_MS};
use crate::capture::frame_diff::SampleRegion;
use crate::live_frame_process::process_frame;

impl FrameWorkerState {
    /// REQ-291 随播随停 1s 拍（未暂停路径）：声画双通道确认 → 锁存 media 条件。
    ///
    /// @ai-context: `comp_epoch` 由调用方注入（主循环当拍构造，恢复后补偿值恒定）；
    ///              调用方已保证非暂停（`!paused_now` 在调用点判定，语义与拆分前的
    ///              `if !paused_now && …` 短路顺序一致）。Idle 静默期仍判暂停。
    pub(super) fn media_tick(&mut self, comp_epoch: Instant) {
        // REQ-291（v0.19.7）：随播随停 1s 拍（独立于采样——idle 静默期仍判暂停；
        // 手动暂停不判：manual 锁存期语义是用户冻结，不跟随视频——批 2a 起
        // 主路径只在未暂停时运行，暂停期恢复检测在暂停分支按 auto 条件
        // （media/fg）轮询）
        if self.last_media_tick.elapsed() >= Duration::from_secs(1) {
            self.last_media_tick = Instant::now();
            let sound_recent = media_sound_recent(&self.media_sound);
            let motion_recent = self.last_motion_at.is_some_and(|t| {
                self.last_media_tick.duration_since(t) <= Duration::from_millis(1500)
            });
            let decision = self.media_detector.tick(sound_recent, motion_recent);
            if decision == crate::media_state::MediaDecision::Suspend {
                let ms = comp_epoch.elapsed().as_millis() as u64;
                // 批 2a：经 request API 锁存媒体条件（暂停动作由机器层完成——
                // manual 锁存期 auto 提议只记条件不动作）
                let _ = self.pause.request_pause(crate::pause_state::PauseSource::Media);
                crate::player_behavior::record_action(
                    &crate::player_behavior::PlayerAction {
                        kind: crate::player_behavior::PlayerActionKind::Pause,
                        value: None,
                    },
                    ms,
                    self.session_id,
                    &self.db,
                );
                let _ = self.app.emit("live:media-paused", ());
                eprintln!("[ScreenWorker] 随播随停：声画双通道确认视频暂停 → 自动暂停捕获");
            }
            // 注：主路径 Resume 决策（审查 F1 曾清 auto_paused 标记）已随
            // auto_paused 删除——检测器相位自更新；媒体解除只发生在暂停分支
            // 的恢复检测（机器层保证暂停 ⇔ 条件锁存，主路径无残留标记可清）
        }
    }

    /// M4/REQ-039 P8：每 2s 采样 CPU 负载（降级标志变化打印——静默失败可见化）。
    pub(super) fn load_tick(&mut self) {
        // M4：每 2s 采样 CPU 负载（降级标志变化打印——静默失败可见化）
        if self.last_load_check_at.elapsed() >= Duration::from_secs(2) {
            self.last_load_check_at = Instant::now();
            let new_degraded = self.load_monitor.tick();
            if new_degraded != self.degraded {
                self.degraded = new_degraded;
                if self.degraded {
                    eprintln!("[ScreenWorker] 负载高，采样降级（全帧 0.1fps 封顶，REQ-039 P8）");
                } else {
                    eprintln!("[ScreenWorker] 负载恢复，采样档位还原");
                }
            }
        }
    }

    /// 采样 1s 拍主体（含自适应档/空闲降频/process_frame/停更监测/档案与播放器拍）。
    ///
    /// @ai-context: 节流判定在方法内（与拆分前的 `if last_sample_at…` 逐字一致）；
    ///              `now_ms` 在 process_frame **之前**取（前台时间线/空闲降频/
    ///              档案拍共用同一时刻——顺序不可前移/后移）。
    pub(super) fn sample_tick(&mut self, comp_epoch: Instant) {
        if self.last_sample_at.elapsed().as_millis() as u64 >= SAMPLE_TICK_MS {
            self.last_sample_at = Instant::now();
            // REQ-084：前台窗口切换检测（每秒一次）——前台与录制目标不一致 →
            // ROI 强制重扫 + 字幕处理冻结（防其他窗口底部内容被当字幕）；
            // 无目标窗口（全屏捕获）或探测失败 → 静默跳过（误触发阈值校准）
            let foreign = match (self.hwnd, crate::windows::foreground_hwnd()) {
                (Some(target), Some(fg)) => fg != target,
                _ => false,
            };
            self.roi_tracker.on_foreground_switch(foreign);
            // B3（P3 简化版）+ M4：语音活跃度 + 负载档驱动自适应采样
            let mut region = self.scheduler.next_region(self.speech_active.load(Ordering::Relaxed), self.degraded);
            // M5/REQ-073：空闲降频状态机——画面变化信号 = diff 通过计数增长
            // （process_frame 内更新，同线程可见）；idle 时跳过采样（引擎
            // 阻塞空闲零 CPU）；空闲期低频探针（5s 一次全帧）检测无声恢复
            let now_ms = comp_epoch.elapsed().as_millis() as u64;
            // M16/REQ-128：前台时间线监控（独立 2s 轮询——不改 region_tracker 行为；
            // 变化 → ForegroundSwitch 事件落库；观测失败 None → 静默跳过）
            if now_ms.saturating_sub(self.last_fg_poll_ms) >= 2_000 {
                self.last_fg_poll_ms = now_ms;
                self.foreground_monitor.observe(
                    crate::windows::foreground_hwnd(),
                    now_ms,
                    self.session_id,
                    &self.db,
                );
            }
            let changed = self.stats.diff_pass > self.last_diff_pass;
            self.last_diff_pass = self.stats.diff_pass;
            let _ = self.idle_governor.observe(
                self.speech_active.load(Ordering::Relaxed),
                changed,
                now_ms,
            );
            let idle = self.idle_governor.is_idle();
            let probe = idle && now_ms.saturating_sub(self.last_probe_ms) >= IDLE_PROBE_INTERVAL_MS;
            if probe {
                self.last_probe_ms = now_ms;
                region = SampleRegion::Full;
            }
            if (region != SampleRegion::Skip && !idle) || probe {
                process_frame(
                    self.screen.as_mut(), &mut self.trigger, &mut self.voter, &mut self.last_frame_text, &mut self.last_preview,
                    &self.db, &self.engines, &self.app, self.session_id, region, &self.subtitle_segments, comp_epoch,
                    &mut self.last_capture_error, &mut self.last_full_texts, &mut self.stats,
                    &mut self.roi_tracker, &mut self.frame_samples,
                    &mut self.last_archived_text, &mut self.last_archived_at, &self.latest_frame,
                    &mut self.image_store, &self.ui_junk, &mut self.screen_tracker,
                    // v0.11.5（Task 2）：变化区域基准 + 生效画面档（None=未定档→medium 默认）
                    &mut self.last_changed_texts,
                    &mut self.got_frame,
                    self.tier_applied_tier.map(|t| t.as_str()).unwrap_or("medium"),
                );
                // REQ-281（v0.19.6）：停更监测 + WGC watchdog + 帧心跳（真实采样拍）
                liveness_check(&self.app, self.screen.as_mut(), &mut self.liveness, self.got_frame, Instant::now());
                // REQ-291：画面动时刻（媒体拍 motion_recent 数据源——WGC 内容驱动
                // 出帧，got_frame 即"画面变了"的近真信号）
                if self.got_frame {
                    self.last_motion_at = Some(Instant::now());
                }
                // v0.11.5（Task 6）：OCR 文本累计（去重→领域检测用）
                // v0.11.5 审查修复（A6）：FIFO 上限 50→100——领域检测信号缓存
                // 保守放大，避免 B站选集证据（`P3/12`/`第3集/共12集`）在
                // 150s 重评窗口前被 FIFO 淘汰而丢失平台证据
                for t in &self.last_changed_texts {
                    if !self.accumulated_ocr_text.contains(t) {
                        self.accumulated_ocr_text.push(t.clone());
                        if self.accumulated_ocr_text.len() > 100 {
                            self.accumulated_ocr_text.remove(0);
                        }
                    }
                }
            }
            self.profile_tick(now_ms);
            self.player_tick(comp_epoch);
        }
    }

    /// 15s 采样统计诊断打印（会话无 OCR 时定位失败阶段；静默失败可见化）。
    pub(super) fn diagnostic_tick(&mut self) {
        // 诊断：每 15s 打印采样统计（会话无 OCR 时定位失败阶段；静默失败可见化）
        if self.stats
            .last_log_at
            .is_none_or(|t| t.elapsed() >= Duration::from_secs(15))
        {
            self.stats.last_log_at = Some(Instant::now());
            eprintln!(
                "[ScreenWorker] 采样统计: sampled={} no_change={} capture_err={} diff_pass={} diff_skip={} ocr_ok={} ocr_err={} junk_filtered={} panel_filtered={}",
                self.stats.sampled, self.stats.no_change, self.stats.capture_err, self.stats.diff_pass, self.stats.diff_skip, self.stats.ocr_ok, self.stats.ocr_err, self.stats.junk_filtered, self.stats.panel_filtered
            );
        }
    }
}
