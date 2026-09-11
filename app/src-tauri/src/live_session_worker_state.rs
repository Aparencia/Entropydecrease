//! 屏幕采样线程状态聚合（live_session_frame.rs 的拆分子模块）。
//!
//! @ai-context: TD-24-A 既定方案（D2）——把 `run_screen_worker` 的装配参数与主循环
//!              状态量收敛为一个上下文对象，使各子系统能按「节拍/域」拆到兄弟子模块的
//!              `impl` 块里，搬运成本 = 加 `self.` 前缀（可机械审阅）。
//! @ai-context: 本类型**只承载数据**，不承载业务逻辑；初始化顺序（采样器创建 →
//!              采样预算/调度器 → 观测器 → 各节流时刻 `Instant::now()`）与拆分前
//!              逐字一致——顺序变化会改变节流相位。
//! @ai-context: 字段一律 `pub(super)`：`impl` 块分布在 5 个兄弟子模块
//!              （liveness / pause_poll / player_probe / profile_runtime / consume），
//!              非 `pub` 字段对兄弟模块不可见。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::capture::frame_diff::DualRateScheduler;
use crate::capture::ScreenCaptureSampler;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::fusion::SubtitleSegment;
use crate::live_frame_process::{ScreenStats, TriggerState};
use crate::subtitle_ocr::SubtitleVoter;

use super::LatestCapturedFrame;

/// 屏幕采样线程状态聚合（装配参数 + 主循环状态量 → 1）。
///
/// @ai-context: 生命周期与 `run_screen_worker` 同帧——在本线程内构造（含非 Send 的
///              `ScreenCaptureSampler` COM 对象），随函数返回析构；无 `Drop` 实现，
///              采样器仍由收尾处显式释放（`screen.take()`，DXGI 资源及时归还）。
pub(super) struct FrameWorkerState {
    pub(super) stop: Arc<AtomicBool>,
    pub(super) hwnd: Option<i64>,
    pub(super) epoch: Instant,
    pub(super) speech_active: Arc<AtomicBool>,
    pub(super) db: Db,
    pub(super) engines: EnginePool,
    pub(super) app: tauri::AppHandle,
    pub(super) session_id: i64,
    pub(super) subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>>,
    pub(super) image_store: Option<crate::image_store::SessionImageStore>,
    pub(super) latest_frame: Arc<Mutex<Option<LatestCapturedFrame>>>,
    pub(super) ui_junk: crate::ui_junk::UiJunkList,
    pub(super) foreground_monitor: crate::foreground_timeline::ForegroundMonitor,
    pub(super) pause: crate::capture::audio_loopback::SessionPause,
    pub(super) media_sound: Arc<Mutex<Option<Instant>>>,
    pub(super) session_info: crate::session_info::SessionInfoCollector,
    pub(super) tier_override: Arc<Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    pub(super) applied_tier: Arc<Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    pub(super) profile_override: Arc<Mutex<Option<crate::live_session::ProfileOverride>>>,
    pub(super) window_title: String,
    pub(super) applied_profile: Arc<Mutex<Option<crate::live_session::ProfileOverride>>>,
    pub(super) screen: Option<ScreenCaptureSampler>,
    pub(super) scheduler: DualRateScheduler,
    pub(super) tier_observer: crate::video_tier_detect::TierObserver,
    pub(super) last_tier_diff_pass: u64,
    pub(super) last_tier_ocr_ok: u64,
    pub(super) tier_applied_tier: Option<crate::video_profile_spec::VisualTier>,
    pub(super) current_form: Option<crate::video_profile_spec::ContentForm>,
    pub(super) current_domain_kind: Option<crate::video_profile_domain::DomainKind>,
    pub(super) current_fine_ids: Vec<String>,
    pub(super) domain_user_locked: bool,
    pub(super) accumulated_ocr_text: Vec<String>,
    pub(super) last_profile_reeval_secs: u64,
    pub(super) trigger: TriggerState,
    pub(super) voter: SubtitleVoter,
    pub(super) last_frame_text: Option<String>,
    pub(super) last_preview: String,
    pub(super) last_sample_at: Instant,
    pub(super) last_capture_error: Option<Instant>,
    pub(super) last_full_texts: Vec<String>,
    pub(super) last_changed_texts: Vec<String>,
    pub(super) stats: ScreenStats,
    pub(super) liveness: crate::frame_liveness::FrameLiveness,
    pub(super) got_frame: bool,
    pub(super) media_detector: crate::media_state::MediaDetector,
    pub(super) last_motion_at: Option<Instant>,
    pub(super) last_media_tick: Instant,
    pub(super) roi_tracker: crate::region_tracker::RoiTracker,
    pub(super) frame_samples: Vec<crate::frame_cluster::FrameSample>,
    pub(super) last_archived_text: Option<String>,
    pub(super) last_archived_at: Option<Instant>,
    pub(super) screen_tracker: crate::screen_tracker::ScreenTracker,
    pub(super) load_monitor: crate::load_monitor::LoadMonitor,
    pub(super) last_load_check_at: Instant,
    pub(super) degraded: bool,
    pub(super) idle_governor: crate::idle_governor::IdleGovernor,
    pub(super) last_diff_pass: u64,
    pub(super) last_probe_ms: u64,
    pub(super) last_fg_poll_ms: u64,
    pub(super) last_player_check_at: Instant,
    pub(super) last_player_paused: bool,
    pub(super) player_state_initialized: bool,
    pub(super) last_info_probe_at: Instant,
    pub(super) worker_paused: bool,
    pub(super) fg_gate: crate::foreground_pause::ForegroundGate,
    pub(super) fg_eligible: bool,
    pub(super) last_fg_gate_ms: u64,
}

impl FrameWorkerState {
    /// 构造（顺序 = 拆分前 `run_screen_worker` 开头，逐字保持）。
    #[allow(clippy::too_many_arguments)]
    pub(super) fn new(
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
        latest_frame: Arc<Mutex<Option<LatestCapturedFrame>>>,
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
        tier_override: Arc<Mutex<Option<crate::video_profile_spec::VisualTier>>>,
        // v0.9.0 M2（REQ-189）：当前生效画面档共享槽（应用档位时写入——
        // command 查询用；事件可能早于前端面板挂载，拉取兑底）
        applied_tier: Arc<Mutex<Option<crate::video_profile_spec::VisualTier>>>,
        // v0.11.5（Task 6）：档案三维覆写共享槽（command 写入，本 worker 消费后清空）
        profile_override: Arc<Mutex<Option<crate::live_session::ProfileOverride>>>,
        // v0.11.5（Task 6）：窗口标题（形态/领域自动重评用）
        window_title: String,
        // v0.11.5（Task 6）：当前生效三维档案快照共享槽（worker 消费 override 后写入）
        applied_profile: Arc<Mutex<Option<crate::live_session::ProfileOverride>>>,
    ) -> Self {
    let screen = match ScreenCaptureSampler::new(hwnd.map(crate::windows::hwnd_from_i64)) {
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
    let scheduler = DualRateScheduler::from_budget(
        budget.subtitle_every,
        budget.full_every,
        budget.silent_subtitle_every,
        budget.silent_full_every,
    );
    // v0.9.0 M2（REQ-189）：画面价值观测器（每 2-3 分钟重评窗口；
    // 帧切换/OCR 面积/结构区三信号 → 升档静默/降档确认——见 video_tier_detect.rs）
    let tier_observer =
        crate::video_tier_detect::TierObserver::new(epoch.elapsed().as_secs());
    // 观测增量基线（diff_pass/ocr_ok 只增不减——差量即本 tick 是否发生）
    let last_tier_diff_pass: u64 = 0;
    let last_tier_ocr_ok: u64 = 0;
    // 已生效画面档（None=未定档——开始前默认中档占位由前端声明）
    let tier_applied_tier: Option<crate::video_profile_spec::VisualTier> = None;
    // v0.11.5（Task 6）：已生效形态/领域状态（内存跟踪；None=未定）
    let current_form: Option<crate::video_profile_spec::ContentForm> = None;
    let current_domain_kind: Option<crate::video_profile_domain::DomainKind> = None;
    // v0.13.6（REQ-220）：已生效细目 id（与 domain 同栅——domain 未定时为空）
    let current_fine_ids: Vec<String> = Vec::new();
    // v0.11.5（终审 I-1）：领域用户手动覆写标记——用户裁决 > 自动检测，
    // 覆写后自动重评不再覆盖该维度（用户手动改过的不自动推翻）
    let domain_user_locked = false;
    // OCR 文本累计（领域自动检测用；去重上限 50 条）
    let accumulated_ocr_text: Vec<String> = Vec::new();
    // 重评窗口计数器（form/domain 仅在窗口结算后做一次自动重评）
    let last_profile_reeval_secs: u64 = 0;
    // ADR-011：触发链路状态（全帧/ROI 网格 diff + 面板检测 + OCR 时刻）
    let trigger = TriggerState::new();
    let voter = SubtitleVoter::new();
    let last_frame_text: Option<String> = None;
    let last_preview = String::new();
    let last_sample_at = Instant::now();
    // 捕获失败日志节流状态（屏幕链路失效时每帧报错会刷屏，5s 一次）
    let last_capture_error: Option<Instant> = None;
    // 全帧文本去重（强制 OCR 下静止画面不重复落库）
    let last_full_texts: Vec<String> = Vec::new();
    // v0.11.5（Task 2）：变化区域新颖度基准（独立于全量文本——比较域解耦）
    let last_changed_texts: Vec<String> = Vec::new();
    let stats = ScreenStats::default();
    // REQ-281（v0.19.6）：停更监测状态 + 本拍帧到达标记（每次采样调用前由
    // process_frame/capture_latest_only 内部清零，无需手动重置）
    let liveness = crate::frame_liveness::FrameLiveness::new();
    let got_frame = false;
    // REQ-291（v0.19.7）：随播随停状态——双通道检测器 + 画面动最近时刻
    // （got_frame 采样点更新；1s 媒体拍独立于采样——idle 静默期仍判暂停）
    let media_detector = crate::media_state::MediaDetector::new();
    let last_motion_at: Option<Instant> = None;
    let last_media_tick = Instant::now();
    // M2/REQ-037：动态字幕区域跟踪（播放区域检测 + ROI 锁定/重扫；尺寸首帧自适应）
    let roi_tracker = crate::region_tracker::RoiTracker::new(0, 0);
    // M6/REQ-051：关键帧样本缓冲（全帧分支收集，停止时投票产出关键图候选）
    let frame_samples: Vec<crate::frame_cluster::FrameSample> = Vec::new();
    // M6/REQ-051：关键帧归档状态（新文本 + 间隔触发存图）
    let last_archived_text: Option<String> = None;
    let last_archived_at: Option<Instant> = None;
    // v0.7.3（REQ-155，ADR-015）：在线屏分配器（全帧落库带屏号）
    let screen_tracker = crate::screen_tracker::ScreenTracker::new();
    // M4/REQ-039 P8：高负载自动降级（CPU 占用采样 → 全帧降频，保 ASR 主链路）
    let load_monitor = crate::load_monitor::LoadMonitor::new();
    let last_load_check_at = Instant::now();
    let degraded = false;
    // M5/REQ-073（PF6）：空闲降频——静音+画面无变化持续 → 跳过采样
    // （引擎自然空闲）；空闲期低频探针（5s 一次全帧）检测画面恢复
    let idle_governor = crate::idle_governor::IdleGovernor::new(Default::default());
    let last_diff_pass: u64 = 0;
    let last_probe_ms: u64 = 0;
    // M16/REQ-128：前台时间线轮询节流（2s 一次；epoch 纪元 ms 时刻）
    let last_fg_poll_ms: u64 = 0;
    // M1/REQ-125：播放器行为检测节流（5s 一次；从最新帧缓存取帧）+ 暂停状态机
    // 审查修复：player_state_initialized 标记首次检测（只初始化基线不写事件）
    let last_player_check_at = Instant::now();
    let last_player_paused = false;
    let player_state_initialized = false;
    // v0.7.2（REQ-151）：播放器信息探测节流（10s 一次——播放器区域 OCR 成本
    // ~100-300ms，秒级粒度足够；信息变化才 emit）
    let last_info_probe_at = Instant::now();
    // 2026-08 A1：暂停边沿跟踪（暂停期画面链整体冻结：采样/前台监控/播放器
    // 检测全部跳过——"会话时间"在暂停期间不前进）
    // 批 2a：auto_paused 局部 bool 删除——暂停来源收敛在 pause_state 单状态机
    // （reason/条件锁存）；本 worker 只按自身来源行动：auto 条件（media/fg，
    // P2-4 起 fg 期同样）持有时轻量轮询找恢复信号、manual 锁存期全冻结
    // （不跟随任何自动源）
    let worker_paused = pause.paused.load(Ordering::SeqCst);
    // 前台自动暂停门控（批 2a）：250ms 节拍独立于采样拍；锚定资格=有目标
    // 窗口（本 worker 存在 ⇔ 画面链开启，anchor_eligible 第二参装配侧已隐含）
    let fg_gate = crate::foreground_pause::ForegroundGate::new();
    let fg_eligible = crate::foreground_pause::anchor_eligible(hwnd.is_some(), true);
    let last_fg_gate_ms: u64 = 0;
        Self {
            stop, hwnd, epoch, speech_active, db, engines, app, session_id, subtitle_segments, image_store, latest_frame, ui_junk, foreground_monitor, pause, media_sound, session_info, tier_override, applied_tier, profile_override, window_title, applied_profile, screen, scheduler, tier_observer, last_tier_diff_pass, last_tier_ocr_ok, tier_applied_tier, current_form, current_domain_kind, current_fine_ids, domain_user_locked, accumulated_ocr_text, last_profile_reeval_secs, trigger, voter, last_frame_text, last_preview, last_sample_at, last_capture_error, last_full_texts, last_changed_texts, stats, liveness, got_frame, media_detector, last_motion_at, last_media_tick, roi_tracker, frame_samples, last_archived_text, last_archived_at, screen_tracker, load_monitor, last_load_check_at, degraded, idle_governor, last_diff_pass, last_probe_ms, last_fg_poll_ms, last_player_check_at, last_player_paused, player_state_initialized, last_info_probe_at, worker_paused, fg_gate, fg_eligible, last_fg_gate_ms,
        }
    }

    /// 时间戳补偿纪元（D7）：会话时间 = epoch + 累计暂停时长。
    ///
    /// @ai-context: 纯读 `SeqCst` 共享量（`total_paused_ms` 的唯一维护者是捕获线程，
    ///              本线程只读）；三处调用时机不变——暂停分支取帧前、主路径每拍、
    ///              收尾 flush（末句字幕时间基）。
    pub(super) fn compensated_epoch(&self) -> Instant {
        self.epoch + Duration::from_millis(self.pause.total_paused_ms.load(Ordering::SeqCst))
    }
}
