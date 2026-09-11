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

use crate::capture::frame_diff::SampleRegion;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::fusion::SubtitleSegment;
use crate::live_frame_process::{persist_voted_subtitle, process_frame};

use live_session_liveness::liveness_check;
use live_session_pause_poll::media_sound_recent;
use live_session_worker_state::FrameWorkerState;

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

/// REQ-281 停更监测（停更判定/心跳载荷/WGC 自愈；本文件 ≤300 行，AGENTS.md §3）。
#[path = "live_session_liveness.rs"]
pub(super) mod live_session_liveness;

/// 线程状态聚合 `FrameWorkerState`（TD-24-A：装配参数 + 主循环状态量 → 1；§3）。
#[path = "live_session_worker_state.rs"]
pub(super) mod live_session_worker_state;

/// 暂停隔离与轻量轮询（前台门控拍/暂停期恢复检测；§3）。
#[path = "live_session_pause_poll.rs"]
pub(super) mod live_session_pause_poll;


/// 屏幕采样线程入口（TD-026 修复：OCR 从会话线程移出，音频消费不再被阻塞）。
///
/// @ai-context: ScreenCaptureSampler 持 COM 对象（非 Send），在本线程内创建与使用，
///              规避跨线程约束；节拍自驱动（与音频消费解耦）；字幕段写入共享缓存，
///              停止后由融合线程读取；epoch/speech_active 由会话线程注入（ADR-008）。
/// @ai-context: 参数为**装配上下文**（停止标志/纪元/活跃度/DB/引擎/事件/共享槽），
///              函数体只做两件事：① 交给 `FrameWorkerState::new` 聚合（TD-24-A/D2）；
///              ② 跑主循环骨架（各子系统在分文件 `impl` 里）。公共签名与调用点
///              （live_session.rs 装配侧）保持不变，登记 clippy 豁免。
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
    image_store: Option<crate::image_store::SessionImageStore>,
    // v0.5.0 M6（REQ-051）：最新帧共享缓存（用户截图命令读取）
    latest_frame: std::sync::Arc<std::sync::Mutex<Option<LatestCapturedFrame>>>,
    // v0.6.0 M1（REQ-083）：UI 垃圾黑名单（字幕源头过滤——文本特征命中不进投票器）
    ui_junk: crate::ui_junk::UiJunkList,
    // v0.7.0 M2（REQ-128）：前台时间线监控（2s 轮询 observe → ForegroundSwitch 落库）
    foreground_monitor: crate::foreground_timeline::ForegroundMonitor,
    // 2026-08 A1：会话暂停共享状态（暂停跳过采样；恢复后时间戳补偿暂停时长）
    pause: crate::capture::audio_loopback::SessionPause,
    // REQ-291（v0.19.7）：媒体级"最后有声时刻"戳（音频线程写；随播随停输入）
    media_sound: Arc<Mutex<Option<Instant>>>,
    // v0.7.2（REQ-151）：会话信息聚合（播放器 OCR 文本 → 平台/时长/合集信息面板）
    session_info: crate::session_info::SessionInfoCollector,
    // v0.9.0 M2（REQ-189）：画面档降档确认共享状态（前端确认后写入——
    // 本 worker 消费并 retune 采样器；None=无待确认）
    tier_override: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    // v0.9.0 M2（REQ-189）：当前生效画面档共享槽（应用档位时写入——
    // command 查询用；事件可能早于前端面板挂载，拉取兑底）
    applied_tier: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    // v0.11.5（Task 6）：档案三维覆写共享槽（command 写入，本 worker 消费后清空）
    profile_override:
        std::sync::Arc<std::sync::Mutex<Option<crate::live_session::ProfileOverride>>>,
    // v0.11.5（Task 6）：窗口标题（形态/领域自动重评用）
    window_title: String,
    // v0.11.5（Task 6）：当前生效三维档案快照共享槽（worker 消费 override 后写入）
    applied_profile:
        std::sync::Arc<std::sync::Mutex<Option<crate::live_session::ProfileOverride>>>,
) {
    let mut w = FrameWorkerState::new(
        stop, hwnd, epoch, speech_active, db, engines, app, session_id, subtitle_segments,
        profile, image_store, latest_frame, ui_junk, foreground_monitor, pause, media_sound,
        session_info, tier_override, applied_tier, profile_override, window_title,
        applied_profile,
    );

    while !w.stop.load(Ordering::SeqCst) {
        w.foreground_gate_tick();
        // ── 暂停检查（2026-08 A1 硬暂停；批 2a 来源感知扩展）──
        let paused_now = w.pause.paused.load(Ordering::SeqCst);
        if paused_now {
            w.poll_while_paused();
            std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
            continue;
        }
        if w.worker_paused {
            // 恢复：短暂等待捕获线程更新累计补偿时长（10ms 粒度），
            // 防恢复首帧时间戳读到旧补偿值（含暂停时长偏差）
            w.worker_paused = false;
            std::thread::sleep(Duration::from_millis(100));
            eprintln!("[ScreenWorker] 会话恢复，画面链继续");
        }
        // 时间戳补偿（2026-08 A1）：会话时间 = epoch - 累计暂停时长；
        // process_frame 内部以 epoch 为基准生成帧时间戳——每次构造补偿后的
        // 纪元传入（暂停期间不采样，补偿值在恢复后恒定）
        let comp_epoch = w.compensated_epoch();
        // REQ-291（v0.19.7）：随播随停 1s 拍（独立于采样——idle 静默期仍判暂停；
        // 手动暂停不判：manual 锁存期语义是用户冻结，不跟随视频——批 2a 起
        // 主路径只在未暂停时运行，暂停期恢复检测在暂停分支按 auto 条件
        // （media/fg）轮询）
        if !paused_now && w.last_media_tick.elapsed() >= Duration::from_secs(1) {
            w.last_media_tick = Instant::now();
            let sound_recent = media_sound_recent(&w.media_sound);
            let motion_recent = w.last_motion_at.is_some_and(|t| {
                w.last_media_tick.duration_since(t) <= Duration::from_millis(1500)
            });
            let decision = w.media_detector.tick(sound_recent, motion_recent);
            if decision == crate::media_state::MediaDecision::Suspend {
                let ms = comp_epoch.elapsed().as_millis() as u64;
                // 批 2a：经 request API 锁存媒体条件（暂停动作由机器层完成——
                // manual 锁存期 auto 提议只记条件不动作）
                let _ = w.pause.request_pause(crate::pause_state::PauseSource::Media);
                crate::player_behavior::record_action(
                    &crate::player_behavior::PlayerAction {
                        kind: crate::player_behavior::PlayerActionKind::Pause,
                        value: None,
                    },
                    ms,
                    w.session_id,
                    &w.db,
                );
                let _ = w.app.emit("live:media-paused", ());
                eprintln!("[ScreenWorker] 随播随停：声画双通道确认视频暂停 → 自动暂停捕获");
            }
            // 注：主路径 Resume 决策（审查 F1 曾清 auto_paused 标记）已随
            // auto_paused 删除——检测器相位自更新；媒体解除只发生在暂停分支
            // 的恢复检测（机器层保证暂停 ⇔ 条件锁存，主路径无残留标记可清）
        }
        // M4：每 2s 采样 CPU 负载（降级标志变化打印——静默失败可见化）
        if w.last_load_check_at.elapsed() >= Duration::from_secs(2) {
            w.last_load_check_at = Instant::now();
            let new_degraded = w.load_monitor.tick();
            if new_degraded != w.degraded {
                w.degraded = new_degraded;
                if w.degraded {
                    eprintln!("[ScreenWorker] 负载高，采样降级（全帧 0.1fps 封顶，REQ-039 P8）");
                } else {
                    eprintln!("[ScreenWorker] 负载恢复，采样档位还原");
                }
            }
        }
        if w.last_sample_at.elapsed().as_millis() as u64 >= SAMPLE_TICK_MS {
            w.last_sample_at = Instant::now();
            // REQ-084：前台窗口切换检测（每秒一次）——前台与录制目标不一致 →
            // ROI 强制重扫 + 字幕处理冻结（防其他窗口底部内容被当字幕）；
            // 无目标窗口（全屏捕获）或探测失败 → 静默跳过（误触发阈值校准）
            let foreign = match (w.hwnd, crate::windows::foreground_hwnd()) {
                (Some(target), Some(fg)) => fg != target,
                _ => false,
            };
            w.roi_tracker.on_foreground_switch(foreign);
            // B3（P3 简化版）+ M4：语音活跃度 + 负载档驱动自适应采样
            let mut region = w.scheduler.next_region(w.speech_active.load(Ordering::Relaxed), w.degraded);
            // M5/REQ-073：空闲降频状态机——画面变化信号 = diff 通过计数增长
            // （process_frame 内更新，同线程可见）；idle 时跳过采样（引擎
            // 阻塞空闲零 CPU）；空闲期低频探针（5s 一次全帧）检测无声恢复
            let now_ms = comp_epoch.elapsed().as_millis() as u64;
            // M16/REQ-128：前台时间线监控（独立 2s 轮询——不改 region_tracker 行为；
            // 变化 → ForegroundSwitch 事件落库；观测失败 None → 静默跳过）
            if now_ms.saturating_sub(w.last_fg_poll_ms) >= 2_000 {
                w.last_fg_poll_ms = now_ms;
                w.foreground_monitor.observe(
                    crate::windows::foreground_hwnd(),
                    now_ms,
                    w.session_id,
                    &w.db,
                );
            }
            let changed = w.stats.diff_pass > w.last_diff_pass;
            w.last_diff_pass = w.stats.diff_pass;
            let _ = w.idle_governor.observe(
                w.speech_active.load(Ordering::Relaxed),
                changed,
                now_ms,
            );
            let idle = w.idle_governor.is_idle();
            let probe = idle && now_ms.saturating_sub(w.last_probe_ms) >= IDLE_PROBE_INTERVAL_MS;
            if probe {
                w.last_probe_ms = now_ms;
                region = SampleRegion::Full;
            }
            if (region != SampleRegion::Skip && !idle) || probe {
                process_frame(
                    w.screen.as_mut(), &mut w.trigger, &mut w.voter, &mut w.last_frame_text, &mut w.last_preview,
                    &w.db, &w.engines, &w.app, w.session_id, region, &w.subtitle_segments, comp_epoch,
                    &mut w.last_capture_error, &mut w.last_full_texts, &mut w.stats,
                    &mut w.roi_tracker, &mut w.frame_samples,
                    &mut w.last_archived_text, &mut w.last_archived_at, &w.latest_frame,
                    &mut w.image_store, &w.ui_junk, &mut w.screen_tracker,
                    // v0.11.5（Task 2）：变化区域基准 + 生效画面档（None=未定档→medium 默认）
                    &mut w.last_changed_texts,
                    &mut w.got_frame,
                    w.tier_applied_tier.map(|t| t.as_str()).unwrap_or("medium"),
                );
                // REQ-281（v0.19.6）：停更监测 + WGC watchdog + 帧心跳（真实采样拍）
                liveness_check(&w.app, w.screen.as_mut(), &mut w.liveness, w.got_frame, Instant::now());
                // REQ-291：画面动时刻（媒体拍 motion_recent 数据源——WGC 内容驱动
                // 出帧，got_frame 即"画面变了"的近真信号）
                if w.got_frame {
                    w.last_motion_at = Some(Instant::now());
                }
                // v0.11.5（Task 6）：OCR 文本累计（去重→领域检测用）
                // v0.11.5 审查修复（A6）：FIFO 上限 50→100——领域检测信号缓存
                // 保守放大，避免 B站选集证据（`P3/12`/`第3集/共12集`）在
                // 150s 重评窗口前被 FIFO 淘汰而丢失平台证据
                for t in &w.last_changed_texts {
                    if !w.accumulated_ocr_text.contains(t) {
                        w.accumulated_ocr_text.push(t.clone());
                        if w.accumulated_ocr_text.len() > 100 {
                            w.accumulated_ocr_text.remove(0);
                        }
                    }
                }
            }
            // v0.9.0 M2（REQ-189）：画面价值观测注入（每采样 tick）——帧切换
            // 上升沿（diff_pass 增量）、OCR 面积占比（ocr_ok 增量：本版以
            // 固定 0.4 近似——全帧变化路径即画面有文字；区域构成留 M4 迭代）
            // @review C12: has_structure 恒 false(区域构成信号暂缺实际注入)
            w.tier_observer.observe(
                now_ms / 1000,
                w.stats.diff_pass > w.last_tier_diff_pass,
                (w.stats.ocr_ok > w.last_tier_ocr_ok).then_some(0.4),
                false,
            );
            w.last_tier_diff_pass = w.stats.diff_pass;
            w.last_tier_ocr_ok = w.stats.ocr_ok;
            // 重评窗口结算后：升档静默生效（retune 采样器）；降档需确认——
            // 确认结果经 tier_override 共享状态回流（前端 confirm_tier_downgrade）
            if let Some(new_tier) = w.tier_observer.current_tier() {
                let applied = w.tier_applied_tier;
                if applied != Some(new_tier) {
                    let change = crate::video_tier_detect::decide_change(applied, Some(new_tier));
                    let budget = crate::video_profile_spec_data::sampling_for_tier(new_tier);
                    match change {
                        crate::video_tier_detect::TierChange::UpgradeSilent
                        | crate::video_tier_detect::TierChange::None => {
                            // 升档/首定档静默应用（更积极采样无损失）；同档无需动作
                            w.scheduler.retune(budget);
                            w.tier_applied_tier = Some(new_tier);
                            if let Ok(mut guard) = w.applied_tier.lock() {
                                *guard = Some(new_tier);
                            }
                            let _ = w.app.emit(
                                "live:tier-changed",
                                serde_json::json!({
                                    "tier": new_tier.as_str(),
                                    "reason": "upgrade-silent",
                                }),
                            );
                        }
                        crate::video_tier_detect::TierChange::DowngradeConfirm => {
                            // 降档需确认：读取共享确认状态——用户已确认 → 应用；
                            // 未确认 → 保持现状档（不丢信息），下轮重评再询
                            let confirmed = w.tier_override
                                .lock()
                                .ok()
                                .and_then(|g| *g)
                                .filter(|t| *t == new_tier);
                            if confirmed.is_some() {
                                w.scheduler.retune(budget);
                                w.tier_applied_tier = Some(new_tier);
                                if let Ok(mut guard) = w.applied_tier.lock() {
                                    *guard = Some(new_tier);
                                }
                                if let Ok(mut guard) = w.tier_override.lock() {
                                    *guard = None;
                                }
                                let _ = w.app.emit(
                                    "live:tier-changed",
                                    serde_json::json!({
                                        "tier": new_tier.as_str(),
                                        "reason": "downgrade-confirmed",
                                    }),
                                );
                            } else {
                                let _ = w.app.emit(
                                    "live:tier-downgrade-request",
                                    serde_json::json!({
                                        "from": w.tier_applied_tier.map(|t| t.as_str()),
                                        "to": new_tier.as_str(),
                                    }),
                                );
                            }
                        }
                    }
                }
            }
            // ── v0.11.5 Task 6: 消费档案三维覆写 ──
            if let Ok(mut guard) = w.profile_override.lock() {
                if let Some(po) = guard.take() {
                    let mut changed = false;
                    if let Some(t) = po.tier {
                        let budget = crate::video_profile_spec_data::sampling_for_tier(t);
                        w.scheduler.retune(budget);
                        w.tier_applied_tier = Some(t);
                        if let Ok(mut ag) = w.applied_tier.lock() { *ag = Some(t); }
                        changed = true;
                    }
                    if let Some(f) = po.form { w.current_form = Some(f); changed = true; }
                    // v0.11.5 审查修复（A3）：domain 为 None（用户未选领域）→
                    // 重置锁定，重新启用自动检测（领域重评不再跳过覆盖）；
                    // v0.13.6（审查修复）：领域一并清空——避免 emit 出
                    // domain=旧/fine=[] 的不一致快照（"领域自动"语义）
                    if po.domain.is_none() && w.domain_user_locked {
                        w.domain_user_locked = false;
                        w.current_domain_kind = None;
                        w.current_fine_ids.clear();
                    }
                    if let Some(d) = po.domain {
                        w.current_domain_kind = Some(d);
                        // 用户手动覆写 → 锁定该维度（重评不覆盖）
                        w.domain_user_locked = true;
                        changed = true;
                        // v0.13.6（REQ-220）：细目随领域覆写（空=仅粗领域，合法）
                        w.current_fine_ids = po.fine.clone();
                    }
                    if changed {
                        let snapshot = crate::live_session::ProfileOverride {
                            form: w.current_form,
                            tier: w.tier_applied_tier,
                            domain: w.current_domain_kind,
                            fine: w.current_fine_ids.clone(),
                        };
                        if let Ok(mut ag) = w.applied_profile.lock() { *ag = Some(snapshot); }
                        let _ = w.app.emit("live:profile-updated", serde_json::json!({
                            "form": w.current_form.map(|f| f.as_str()),
                            "tier": w.tier_applied_tier.map(|t| t.as_str()),
                            "domain": w.current_domain_kind.map(|d| d.as_str()),
                            "fine": w.current_fine_ids,
                        }));
                    } else {
                        // v0.11.5 审查修复（A2）：override 取到全空值（command 层
                        // 应已拒绝全空，此为防御）
                        eprintln!("[LiveSession] profile_override 取到全空值（command 层应已拒绝全空，此为防御）");
                    }
                }
            }
            // ── v0.11.5 Task 6: 领域自动重评（同画面档窗口节拍）──
            let profile_reeval_now = now_ms / 1000;
            if profile_reeval_now >= w.last_profile_reeval_secs + 150 {
                w.last_profile_reeval_secs = profile_reeval_now;
                // v0.11.5 Task 7: B站 选集 OCR 证据增强——标题确认 B站 且累计
                // OCR 中选集命中（`P3/12`/`第X集`，adapt_bilibili_episode 解析）
                // → 累计 OCR 文本提升为平台证据（命中才加权，不命中不惩罚）
                let mut platform_tags: Vec<String> = Vec::new();
                if crate::platform_adapter::infer_platform(
                    Some(&w.window_title),
                    None,
                ) == Some(crate::platform_adapter::PlatformKind::Bilibili)
                    && w.accumulated_ocr_text
                        .iter()
                        .any(|t| crate::platform_adapter::adapt_bilibili_episode(t).is_some())
                {
                    platform_tags = w.accumulated_ocr_text.clone();
                }
                // v0.11.5 Task 7: ASR 开场白——前 30s 段文本（现有段累计可达，
                // 不为它新建数据流）；无段 → None 诚实降级
                let asr_opening: Option<String> = w.subtitle_segments
                    .lock()
                    .ok()
                    .map(|g| {
                        g.iter()
                            .filter(|s| s.start_ms <= 30_000)
                            .map(|s| s.text.clone())
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .filter(|t| !t.trim().is_empty());
                let domain_signal = crate::video_profile_domain::DomainSignals {
                    title: Some(w.window_title.clone()),
                    platform_tags,
                    user_confirmed: None,
                    term_freq: w.accumulated_ocr_text.clone(),
                    asr_opening,
                };
                let detected = crate::video_profile_domain::detect_domain(&domain_signal);
                // 终审 I-1：用户已手动覆写领域 → 跳过自动覆盖（用户裁决优先）
                if !w.domain_user_locked
                    && detected.kind.is_some()
                    && detected.kind != w.current_domain_kind
                    && detected.confidence >= 0.6
                {
                    w.current_domain_kind = detected.kind;
                    // v0.13.6：自动重评命中的细目随之生效（curated 预选；空则仅粗领域）
                    w.current_fine_ids = detected.fine_ids;
                    let snapshot = crate::live_session::ProfileOverride {
                        form: w.current_form,
                        tier: w.tier_applied_tier,
                        domain: w.current_domain_kind,
                        fine: w.current_fine_ids.clone(),
                    };
                    if let Ok(mut ag) = w.applied_profile.lock() { *ag = Some(snapshot); }
                    let _ = w.app.emit("live:profile-updated", serde_json::json!({
                        "form": w.current_form.map(|f| f.as_str()),
                        "tier": w.tier_applied_tier.map(|t| t.as_str()),
                        "domain": w.current_domain_kind.map(|d| d.as_str()),
                        "fine": w.current_fine_ids,
                    }));
                }
            }
            // M1/REQ-125：播放器行为检测（5s 节流——非每帧；从最新帧缓存取帧做
            // 暂停图标检测；Pause→无图标 状态机推导 Play 事件；无帧/转换失败 →
            // 状态保持（诚实：无证据不推断））
            // 审查修复（v0.7.0 新增代码审查）：
            // ① MEDIUM-6：now_ms 在此处现取（原用采样块开头的旧时刻——OCR 耗时
            //    + 5s 周期叠加使暂停事件时戳滞后 5-10s）；
            // ② MEDIUM-9：首次检测只初始化状态不写事件（录制开始前已暂停的视频
            //    首轮 paused=true ≠ 初始 false 会写非转换假 Pause）
            if w.last_player_check_at.elapsed() >= Duration::from_secs(5) {
                w.last_player_check_at = Instant::now();
                let check_now_ms = comp_epoch.elapsed().as_millis() as u64;
                if let Some(f) = w.latest_frame.lock().ok().and_then(|g| g.clone()) {
                    if let Some(img) =
                        crate::region_ocr::bgra_to_rgb_image(&f.bgraw, f.width, f.height)
                    {
                        let paused =
                            crate::player_behavior::detect_player_action(&img).is_some();
                        if !w.player_state_initialized {
                            // 首次检测：仅记录基线状态，不写事件（防假 Pause）
                            w.player_state_initialized = true;
                            w.last_player_paused = paused;
                            // P2：基线即暂停（会话开始时视频已暂停）→ 自动暂停。
                            // 不写假 Pause 事件（MEDIUM-9），但锁存媒体条件——
                            // 音频/捕获线程沿边沿同步暂停（批 2a 经 request API）
                            if paused && !w.pause.paused.load(Ordering::SeqCst) {
                                let _ = w.pause
                                    .request_pause(crate::pause_state::PauseSource::Media);
                                let _ = w.app.emit("live:media-paused", ());
                                eprintln!("[ScreenWorker] 视频处于暂停态，会话自动暂停");
                            }
                        } else if paused != w.last_player_paused {
                            w.last_player_paused = paused;
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
                                w.session_id,
                                &w.db,
                            );
                            if paused && !w.pause.paused.load(Ordering::SeqCst) {
                                // P2：检测到视频暂停 → 自动暂停捕获（媒体条件；
                                // 下一轮循环进入轻量轮询，恢复检测不中断）。
                                // 审查 F5：已暂停（pause=true）时不重复记账/发事件
                                // （同迭代双系统重复 Pause——机器层同样幂等）
                                let _ = w.pause
                                    .request_pause(crate::pause_state::PauseSource::Media);
                                let _ = w.app.emit("live:media-paused", ());
                                eprintln!("[ScreenWorker] 检测到视频暂停，自动暂停捕获");
                            }
                        } else if paused && !w.pause.paused.load(Ordering::SeqCst) {
                            // P2 兜底（批 2a 语义推广——机器层"manual 解除瞬间重评
                            // 估 auto 条件"的 worker 侧实现）：手动恢复后视频仍
                            // 暂停 → 重新锁存媒体条件（捕获跟随视频状态，用户
                            // 手动继续不覆盖）；经 request API 只记条件不动作
                            let _ = w.pause
                                .request_pause(crate::pause_state::PauseSource::Media);
                            let _ = w.app.emit("live:media-paused", ());
                            eprintln!("[ScreenWorker] 视频处于暂停态，重新自动暂停");
                        }
                    }
                }
            }
            // v0.7.2（REQ-151）：播放器信息探测（10s 节流）——播放器区域 OCR
            // 文本（时间对 `12:34 / 1:23:45`、分P `P3/12`）→ 会话信息更新 →
            // 值变化才 emit live:session-info（防 IPC 风暴）；无播放区域/OCR
            // 失败 → 静默跳过（诚实：不猜不填；下轮再试）
            if w.last_info_probe_at.elapsed() >= Duration::from_secs(10) {
                w.last_info_probe_at = Instant::now();
                probe_player_info(&w.app, &w.engines, &w.session_info, &w.roi_tracker, &w.latest_frame);
            }
        }
        // 诊断：每 15s 打印采样统计（会话无 OCR 时定位失败阶段；静默失败可见化）
        if w.stats
            .last_log_at
            .is_none_or(|t| t.elapsed() >= Duration::from_secs(15))
        {
            w.stats.last_log_at = Some(Instant::now());
            eprintln!(
                "[ScreenWorker] 采样统计: sampled={} no_change={} capture_err={} diff_pass={} diff_skip={} ocr_ok={} ocr_err={} junk_filtered={} panel_filtered={}",
                w.stats.sampled, w.stats.no_change, w.stats.capture_err, w.stats.diff_pass, w.stats.diff_skip, w.stats.ocr_ok, w.stats.ocr_err, w.stats.junk_filtered, w.stats.panel_filtered
            );
        }
        std::thread::sleep(Duration::from_millis(WORKER_POLL_MS));
    }
    // 停止：冲刷未定稿的最后一组字幕（否则末句字幕丢失，T2 语义要求）
    // 2026-08 A1：flush 时间戳同样补偿暂停时长（会话时间基准）
    let flush_epoch = w.compensated_epoch();
    if let Some(voted) = w.voter.flush(flush_epoch.elapsed().as_millis() as u64) {
        persist_voted_subtitle(&w.db, &w.app, w.session_id, &w.subtitle_segments, voted);
    }
    // M6/REQ-051：关键帧投票（课后精修：多信号筛选 → 关键图候选；产物层 M7 消费）
    crate::live_keyframes::vote_and_emit_keyframes(&w.frame_samples, &w.app, w.session_id);
    // 显式释放采样器（COM/DXGI 资源）——worker 退出即释放 duplication，
    // 防多会话快速连测时泄漏累积触发 DXGI 并发上限（4/5 会话无 OCR 排查项）
    drop(w.screen);
    eprintln!("[ScreenWorker] 屏幕采样线程退出（会话 {}）", w.session_id);
}

/// 播放器信息探测（REQ-151，v0.7.2）：播放器区域 OCR 文本（时间对/分P）→
/// 会话信息更新 → 值变化才 emit live:session-info（防 IPC 风暴）。
///
/// @ai-context: 主采样循环与自动暂停轻量轮询共用——暂停时播放器时间文本仍
///              在画面，时长/集号识别不因暂停缺席（10s 节流由调用方控制）；
///              无播放区域/OCR 失败 → 静默跳过（诚实：不猜不填，下轮再试）。
fn probe_player_info(
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

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_frame_tests.rs"]
mod tests;
