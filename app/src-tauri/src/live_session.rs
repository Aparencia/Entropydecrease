//! 实时会话管理（v0.2.0 汇总：REQ-007~012 的运行时组合层；v0.3.0 REQ-031/034 增强）。
//!
//! @ai-context: 一次"开始实时捕获"启动一个会话线程，线程内串联：
//!              WASAPI 环回（ADR-001）→ 流式 ASR（ADR-003）→ 字幕区 OCR
//!              （ADR-005）→ 实时落库（ADR-004）；停止时 finish+emit 秒回，
//!              融合移入后台线程（REQ-031，无字幕短路），完成后 session:fused。
//! @ai-context: v0.7.0 M0 X-O5 行数拆分（798 行超限硬拆）：
//!              - live_session_loop.rs——音频主循环（run_audio_loop + LiveLoopCtx）
//!              - live_session_persist.rs——定稿落库（persist_final/digest_merged）
//!              - live_session_fusion.rs——融合状态跟踪 + 后台融合线程
//!              本文件保留：参数/管理器/会话线程装配骨架（引擎+捕获+worker 启动）。
//! @ai-context: 2026-08-21 Task #14 硬限拆分（实测 727 行 >600 必拆）：
//!              - live_session_manager.rs——状态查询/控制方法簇（快照/暂停/停止/会话 id）
//!              - live_session_lifecycle.rs——启动与预热生命周期（start/prepare/run_session）
//!              本文件保留：参数/结构体定义 + 构造 + 引擎就绪后装配骨架
//!              （run_session_after_engine）。impl LiveSessionManager 跨文件分布，
//!              公共 API 签名零变化。

use std::sync::atomic::AtomicBool;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

use tauri::Emitter;

use crate::capture::{AudioChunk, AudioLoopbackCapture};
use crate::db::Db;
use crate::engine::EnginePool;
use crate::fusion::SubtitleSegment;
use crate::live_session_fusion::{spawn_fusion, FusionTracker};
use crate::live_session_loop::{run_audio_loop, LiveLoopCtx};
use crate::live_session_prepare::PreparedSession;
use crate::streaming_asr::{StreamingAsrEngine, StreamingAsrModels};

/// 实时电平事件载荷（2026-08 A2：VU 表数据源；live:audio-level 事件）。
///
/// @ai-context: rms 为 0-1 归一化原始 RMS（前端按显示需求映射 dB/分段）；
///              clipping 复用预处理链削波检测——电平条削波段标红。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevelEvent {
    pub rms: f32,
    pub clipping: bool,
}

/// 实时会话启动参数（由 command 层组装）。
pub struct LiveSessionParams {
    pub title: String,
    pub source_window: Option<String>,
    /// 目标窗口句柄（i64 传输，None=全屏）
    pub hwnd: Option<i64>,
    pub db: Db,
    pub engines: EnginePool,
    pub streaming_models: StreamingAsrModels,
    /// ADR-012 F4-2：标点恢复模型路径（None=无标点降级，不阻断 ASR）
    pub punctuation_model: Option<String>,
    /// 融合状态跟踪（与 LiveSessionManager 共享同一实例）
    pub fusion: FusionTracker,
    /// M5/REQ-040：共享词表（热词注入流式识别）
    pub vocab: std::sync::Arc<std::sync::Mutex<crate::vocab::VocabStore>>,
    /// v0.5.0 M1（REQ-043）：视频类型档案（None=默认档案，采样按 Lecture 现状档零回归）
    pub profile: Option<crate::video_profile::ProfileKind>,
    /// v0.5.0 M6（REQ-051）：应用数据目录（会话图片存储基目录）
    pub data_dir: std::path::PathBuf,
    /// 前端事件推送（live:asr-partial / live:subtitle / live:error / live:status / session:*）
    pub app: tauri::AppHandle,
    /// v0.6.0 M1（REQ-083）：UI 垃圾黑名单（字幕源头过滤）
    pub ui_junk: crate::ui_junk::UiJunkList,
    /// v0.7.0 M2（REQ-115）：VAD 阈值共享槽（会话线程发布当前阈值，诊断可查）
    pub vad_slot: std::sync::Arc<crate::vad_threshold_slot::VadThresholdSlot>,
    /// v0.9.0 M2（REQ-189）：画面档降档确认共享状态（None=无待确认/升档静默
    /// 直改；降档时前端确认后写入——screen worker 消费并 retune 采样器）
    pub tier_override: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    /// v0.9.0 M2（REQ-189）：当前生效画面档共享槽（worker 应用档位时写入，
    /// command 查询——live:tier-changed 事件可能早于前端面板挂载，拉取兜底）
    pub applied_tier: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    /// v0.11.5（Task 6）：采集态档案三维热切换覆写共享槽（command 写入，worker 消费）
    pub profile_override:
        std::sync::Arc<std::sync::Mutex<Option<ProfileOverride>>>,
    /// v0.11.5（Task 6）：当前生效三维档案快照（worker 应用后写入，command 查询/事件）
    pub applied_profile:
        std::sync::Arc<std::sync::Mutex<Option<ProfileOverride>>>,
    /// v0.11.5（Task 6）：窗口标题（档案重评用——form/domain 检测依赖标题信号）
    pub window_title: String,
}

/// 活动会话记录。
///
/// @ai-context: Task #14 拆分后 pub(crate)——live_session_lifecycle.rs（start
///              写入）与 live_session_manager.rs（stop/查询读取）跨模块访问。
pub(crate) struct ActiveSession {
    pub(crate) stop_flag: Arc<AtomicBool>,
    pub(crate) thread: JoinHandle<()>,
    pub(crate) session_id: i64,
}

/// 实时会话管理器（AppState 持有，同一时刻最多一个活动会话）。
///
/// @ai-context: Task #14 拆分后字段 pub(crate)——impl LiveSessionManager 分布于
///              live_session_manager.rs / live_session_lifecycle.rs 跨模块访问；
///              crate 外不可见，封装边界不变。
pub struct LiveSessionManager {
    pub(crate) active: Arc<Mutex<Option<ActiveSession>>>,
    pub(crate) fusion: FusionTracker,
    /// M6/REQ-051：最新帧共享缓存（用户截图命令读取；会话进行中由屏幕 worker 写入）
    pub(crate) latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
    /// 2026-08 A1：会话暂停共享状态（硬暂停——命令层置位，捕获/屏幕/主循环消费）
    pub(crate) pause: crate::capture::audio_loopback::SessionPause,
    /// P3：预备会话（引擎预热——选窗口阶段后台加载；start 交接复用）
    pub(crate) prepared: Arc<Mutex<Option<PreparedSession>>>,
    /// v0.7.2（REQ-151）：会话信息聚合（面板数据源——屏幕 worker 写入，事件/命令读取）
    pub(crate) session_info: crate::session_info::SessionInfoCollector,
    /// v0.9.0 M2（REQ-189）：画面档降档确认共享状态（命令层写入，worker 消费）
    pub(crate) tier_override: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    /// v0.9.0 M2（REQ-189）：当前生效画面档（worker 应用档位时写入，command 查询）
    pub(crate) applied_tier: std::sync::Arc<std::sync::Mutex<Option<crate::video_profile_spec::VisualTier>>>,
    /// v0.11.5（Task 6）：采集态档案三维热切换共享覆写槽（command 写入，worker 消费）
    pub(crate) profile_override:
        std::sync::Arc<std::sync::Mutex<Option<ProfileOverride>>>,
    /// v0.11.5（Task 6）：当前生效三维档案快照（worker 应用后写入，事件/命令读取）
    pub(crate) applied_profile:
        std::sync::Arc<std::sync::Mutex<Option<ProfileOverride>>>,
}

impl Default for LiveSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for LiveSessionManager {
    fn clone(&self) -> Self {
        Self {
            active: self.active.clone(),
            fusion: self.fusion.clone(),
            latest_frame: self.latest_frame.clone(),
            pause: self.pause.clone(),
            prepared: self.prepared.clone(),
            session_info: self.session_info.clone(),
            tier_override: self.tier_override.clone(),
            applied_tier: self.applied_tier.clone(),
            profile_override: self.profile_override.clone(),
            applied_profile: self.applied_profile.clone(),
        }
    }
}

impl LiveSessionManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(None)),
            fusion: FusionTracker::default(),
            latest_frame: Arc::new(Mutex::new(None)),
            pause: Default::default(),
            prepared: Arc::new(Mutex::new(None)),
            session_info: crate::session_info::SessionInfoCollector::new(),
            tier_override: Arc::new(Mutex::new(None)),
            applied_tier: Arc::new(Mutex::new(None)),
            profile_override: Arc::new(Mutex::new(None)),
            applied_profile: Arc::new(Mutex::new(None)),
        }
    }
}

/// 采集态档案三维热切换覆写（v0.11.5 Task 6）。
///
/// @ai-context: form/tier/domain 全可选（至少一项），由 update_live_profile 写入，
///              screen worker 下轮采样 tick 一次性消费并清空。None = 不覆写该维。
#[derive(Debug, Clone, Default)]
pub struct ProfileOverride {
    pub form: Option<crate::video_profile_spec::ContentForm>,
    pub tier: Option<crate::video_profile_spec::VisualTier>,
    pub domain: Option<crate::video_profile_domain::DomainKind>,
    /// v0.13.6（REQ-220）：细目 id 多选（与 domain 同传；空=仅粗领域）
    pub fine: Vec<String>,
}

/// 会话装配后半段（引擎就绪后）：音频捕获 → 屏幕 worker → 主循环 → 后台融合。
///
/// @ai-context: P3：run_session（内联加载）与预备线程（预热交接）共用——
///              引擎就绪后路径唯一，防两处装配漂移；epoch 由调用方注入
///              （内联路径=run_session 起点，交接路径=Start 移交后创建，
///              模型已加载无 A1 秒级偏移）。
#[allow(clippy::too_many_arguments)]
pub(crate) fn run_session_after_engine(
    mut asr_engine: StreamingAsrEngine,
    stop: Arc<AtomicBool>,
    params: LiveSessionParams,
    session_id: i64,
    // M6/REQ-051：最新帧共享缓存（屏幕 worker 写入，manager 持同一实例）
    latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
    // 2026-08 A1：会话暂停共享状态（manager 持同一实例；捕获线程维护补偿时长）
    pause: crate::capture::audio_loopback::SessionPause,
    // A1：会话纪元——音频/屏幕/flush 三处时间戳的唯一基准（ADR-008）
    epoch: Instant,
    // v0.7.2（REQ-151）：会话信息聚合（屏幕 worker 播放器 OCR 写入）
    session_info: crate::session_info::SessionInfoCollector,
) {
    let db = params.db.clone();
    let engines = params.engines.clone();
    // ADR-007：会话启动成功（引擎就绪）→ 广播录制态（前端全局采集徽标依赖此事件；
    // 音频/屏幕后续故障走自动恢复不再终止会话）
    let _ = params.app.emit("live:status", "recording");
    // v0.7.2（REQ-151）：标题信息就绪即推送（平台/系列/集号；时长待播放器 OCR）
    let _ = params.app.emit("live:session-info", session_info.snapshot());

    // 2) 音频捕获：捕获线程 → channel → 会话线程（引擎非 Send）
    // @ai-context: ADR-007：start 不再因设备缺失返回 Err——捕获线程内部自动重连
    //              （指数退避），会话不因设备插拔/切换死亡；恢复事件推送前端。
    let (tx, rx) = mpsc::channel::<AudioChunk>();
    let recovery_app = params.app.clone();
    let audio_pause = pause.clone();
    let audio = match AudioLoopbackCapture::start(
        epoch,
        move |chunk| {
            let _ = tx.send(chunk);
        },
        move |recovering| {
            if recovering {
                // 进入恢复：可观测（前端徽标 + 错误提示），会话继续运行
                let _ = recovery_app.emit("live:error", "系统音频捕获中断，正在自动恢复…");
                let _ = recovery_app.emit("live:recovering", "audio");
            } else {
                let _ = recovery_app.emit("live:recovered", "audio");
            }
        },
        // 2026-08 A1：暂停共享状态（捕获线程执行端点 Stop/Start + 时间戳补偿）
        Some(audio_pause),
    ) {
        Ok(a) => a,
        Err(e) => {
            emit_error(&params.app, &format!("系统音频捕获启动失败: {}", e));
            let _ = db.mark_session_failed(session_id);
            return;
        }
    };

    // 3) 屏幕采样线程（TD-026 修复：OCR 推理移出会话线程，音频消费不再被阻塞；
    //    失败不阻断音频链路——screen worker 内部容错）
    // @ai-context: 采样器（COM 非 Send）在线程内创建；字幕段经共享缓存回传
    //              （停止后由融合线程读取）；B3：语音活跃度共享标志驱动自适应采样。
    // @ai-context: REQ-130（v0.7.0 M3）：P4 无图短路——档案声明 disable_ocr 时
    //              跳过屏幕 worker（屏幕捕获/OCR/字幕采样整体不跑）。引擎池是
    //              全局共享的不能按会话销毁——短路点设在**采样端**：subtitle_segments
    //              保持空，融合线程对空字幕短路（既有路径），内存收益来自不建捕获/OCR 链。
    let ocr_enabled = !params
        .profile
        .map(crate::video_profile::profile_by_kind)
        .map(|p| p.disable_ocr)
        .unwrap_or(false);
    let mut asr_segments: Vec<crate::types::TranscriptSegment> = Vec::new();
    let subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>> = Arc::new(Mutex::new(Vec::new()));
    let speech_active = Arc::new(AtomicBool::new(false));
    // REQ-291（v0.19.7）：媒体级"最后有声时刻"共享戳（音频线程写/屏幕线程读）
    let media_sound: Arc<Mutex<Option<std::time::Instant>>> = Arc::new(Mutex::new(None));
    // M4/REQ-068（S4）：实时链路音频落盘（WAV PCM16；创建失败降级不阻断）
    let mut audio_writer = crate::audio_store::SessionAudioWriter::create(
        &params.data_dir.join("session-audio"),
        session_id,
        &crate::audio_store::AudioStoreConfig::default(),
    );
    let screen_worker: Option<JoinHandle<()>> = if ocr_enabled {
        // worker 需独立持有 Db/AppHandle（主循环仍要使用，先 clone 再 move 进闭包）
        let worker_segments = subtitle_segments.clone();
        let worker_stop = stop.clone();
        let worker_speech = speech_active.clone();
        let worker_db = db.clone();
        let worker_app = params.app.clone();
        // M6/REQ-051：会话图片存储（关键帧归档；创建失败不阻断屏幕链路）
        // REQ-110：预算档位按档案 storage_tier 注入（TextFirst=50 现状零回归）
        let store_tier = params
            .profile
            .map(crate::video_profile::profile_by_kind)
            .map(|p| p.storage_tier)
            .unwrap_or(crate::video_profile::StoreTier::TextFirst);
        let image_store = crate::image_store::SessionImageStore::with_tier(
            params.data_dir.join("session-images").join(session_id.to_string()),
            store_tier,
        )
        .map_err(|e| eprintln!("[LiveSession] 会话图片库初始化失败（图集不可用）: {}", e))
        .ok();
        // M6/REQ-051：最新帧共享缓存（用户截图命令读取）
        let worker_latest = latest_frame.clone();
        // M16/REQ-128：前台时间线监控（worker 内 2s 轮询 observe → 事件落库；
        // 随画面链启停——播客/直播档案画面链短路时前台信号同样不采集，语义一致）
        // 注：无需 mut——变异发生在 worker 内（run_screen_worker 参数自带 mut）
        let foreground_monitor = crate::foreground_timeline::ForegroundMonitor::new(params.hwnd);
        // 2026-08 A1：屏幕 worker 共享暂停状态（暂停跳过采样；恢复后时间戳补偿）
        let worker_pause = pause.clone();
        // REQ-291（v0.19.7）：媒体级声音戳（worker 随播随停检测读取）
        let worker_media_sound = media_sound.clone();
        // v0.7.2（REQ-151）：会话信息聚合（worker 播放器 OCR 写入）
        let worker_session_info = session_info.clone();
        // v0.9.0 M2（REQ-189）：画面档降档确认共享状态（前端确认后写入，
        // worker 消费并 retune 采样器）
        let worker_tier_override = params.tier_override.clone();
        // v0.9.0 M2（REQ-189）：当前生效画面档共享槽（worker 应用档位时写入）
        let worker_applied_tier = params.applied_tier.clone();
        let worker_profile_override = params.profile_override.clone();
        let worker_window_title = params.window_title.clone();
        match std::thread::Builder::new()
            .name("entropy-screen-worker".into())
            .spawn(move || {
                crate::live_session_frame::run_screen_worker(
                    worker_stop,
                    params.hwnd,
                    epoch,
                    worker_speech,
                    worker_db,
                    engines.clone(),
                    worker_app,
                    session_id,
                    worker_segments,
                    params.profile,
                    image_store,
                    worker_latest,
                    // REQ-083：UI 垃圾黑名单（Clone 廉价——Vec 条目）
                    params.ui_junk.clone(),
                    // M16/REQ-128：前台时间线监控（worker 内 2s 轮询 observe）
                    foreground_monitor,
                    // 2026-08 A1：暂停共享状态
                    worker_pause,
                    // REQ-291（v0.19.7）：媒体级声音戳（随播随停检测输入）
                    worker_media_sound,
                    // v0.7.2（REQ-151）：会话信息聚合（播放器 OCR 写入）
                    worker_session_info,
                    // v0.9.0 M2（REQ-189）：画面档降档确认共享状态
                    worker_tier_override,
                    // v0.9.0 M2（REQ-189）：当前生效画面档共享槽
                    worker_applied_tier,
                    // v0.11.5（Task 6）：档案三维覆写 + 窗口标题 + 生效档案快照
                    worker_profile_override,
                    worker_window_title,
                    params.applied_profile.clone(),
                )
            }) {
            Ok(h) => Some(h),
            Err(e) => {
                // 屏幕采样线程启动失败不阻断音频链路，但必须可观测（审查：不得静默失效）
                eprintln!("[LiveSession] 启动屏幕采样线程失败（字幕/画面识别不可用）: {}", e);
                None
            }
        }
    } else {
        // 播客/直播档案：跳过画面链（P4 短路——内存收益 + 零 OCR 干扰）
        eprintln!("[LiveSession] 档案禁用画面链（disable_ocr），跳过屏幕采样（播客/直播类）");
        None
    };

    // 4) 音频主循环（live_session_loop.rs）：消费/预处理/VAD/ASR/事件 + 停止 drain
    let loop_ctx = LiveLoopCtx {
        stop: stop.clone(),
        epoch,
        app: &params.app,
        db: &db,
        session_id,
        asr_segments: &mut asr_segments,
        speech_active,
        asr_engine: &mut asr_engine,
        audio_writer: &mut audio_writer,
        vad_slot: Some(params.vad_slot.as_ref()),
        // 2026-08 A1：暂停共享状态（主循环做边沿断句/事件/落库）
        pause: &pause,
        // REQ-291（v0.19.7）：媒体级声音戳（音频线程每块写"最后有声时刻"）
        media_sound,
    };
    run_audio_loop(rx, audio, loop_ctx, &params.data_dir);

    // 5) 后台融合线程（live_session_fusion.rs）：join 采样线程 → 字幕/ASR 融合
    spawn_fusion(
        &params.app,
        &db,
        session_id,
        screen_worker,
        subtitle_segments,
        asr_segments,
        params.fusion.clone(),
    );
}

/// 推送错误事件（并重置前端录制态——审查 M3 修复：失败不能假"录制中"）。
///
/// @ai-context: Task #14 拆分后 pub(crate)——live_session_lifecycle.rs 的
///              run_session（内联加载失败路径）跨模块复用同一可观测出口。
pub(crate) fn emit_error(app: &tauri::AppHandle, message: &str) {
    let _ = app.emit("live:error", message.to_string());
    let _ = app.emit("live:status", "failed");
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_tests.rs"]
mod tests;
