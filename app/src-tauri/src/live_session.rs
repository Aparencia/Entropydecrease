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

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

use tauri::Emitter;

use crate::capture::{AudioChunk, AudioLoopbackCapture};
use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::{AppError, Result};
use crate::fusion::SubtitleSegment;
use crate::live_session_fusion::{spawn_fusion, FusionTracker};
use crate::live_session_loop::{run_audio_loop, LiveLoopCtx};
use crate::live_session_prepare::{PreparedSession, PrepareEnv, PrepareMsg, PrepareStatus, StartHandoff};
use crate::streaming_asr::{StreamingAsrConfig, StreamingAsrEngine, StreamingAsrModels};

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
}

/// 活动会话记录。
struct ActiveSession {
    stop_flag: Arc<AtomicBool>,
    thread: JoinHandle<()>,
    session_id: i64,
}

/// 实时会话管理器（AppState 持有，同一时刻最多一个活动会话）。
pub struct LiveSessionManager {
    active: Arc<Mutex<Option<ActiveSession>>>,
    fusion: FusionTracker,
    /// M6/REQ-051：最新帧共享缓存（用户截图命令读取；会话进行中由屏幕 worker 写入）
    latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
    /// 2026-08 A1：会话暂停共享状态（硬暂停——命令层置位，捕获/屏幕/主循环消费）
    pause: crate::capture::audio_loopback::SessionPause,
    /// P3：预备会话（引擎预热——选窗口阶段后台加载；start 交接复用）
    prepared: Arc<Mutex<Option<PreparedSession>>>,
    /// v0.7.2（REQ-151）：会话信息聚合（面板数据源——屏幕 worker 写入，事件/命令读取）
    session_info: crate::session_info::SessionInfoCollector,
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
        }
    }

    /// 融合状态跟踪句柄（command 层组装 LiveSessionParams 时获取）。
    pub fn fusion(&self) -> FusionTracker {
        self.fusion.clone()
    }

    /// 最新捕获帧快照（用户截图命令读取；无活动会话/未捕获到帧为 None）。
    pub fn latest_frame(&self) -> Option<crate::live_session_frame::LatestCapturedFrame> {
        self.latest_frame.lock().ok().and_then(|g| g.clone())
    }

    /// 暂停活动会话（2026-08 A1 硬暂停：完全停采）。
    ///
    /// @ai-context: 只置共享标志——实际暂停由捕获线程边沿检测执行
    ///              （WASAPI 端点 Stop）并累计补偿时长；事件/落库由会话
    ///              线程边沿检测发出（保证与真实暂停时序一致）。
    /// @ai-context: 无活动会话/已暂停 → 明确报错（幂等拒绝）。
    pub fn pause(&self) -> Result<()> {
        let guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_none() {
            return Err(AppError::Io("无活动实时会话".to_string()));
        }
        if self.pause.paused.swap(true, Ordering::SeqCst) {
            return Err(AppError::Io("会话已处于暂停".to_string()));
        }
        Ok(())
    }

    /// 恢复暂停的会话（2026-08 A1；未暂停 → 明确报错）。
    pub fn resume(&self) -> Result<()> {
        let guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_none() {
            return Err(AppError::Io("无活动实时会话".to_string()));
        }
        if !self.pause.paused.swap(false, Ordering::SeqCst) {
            return Err(AppError::Io("会话未处于暂停".to_string()));
        }
        Ok(())
    }

    /// 启动实时会话：建会话 + 起编排线程，返回会话 id。
    ///
    /// @ai-context: P3：优先交接预热线程（引擎已加载——开始毫秒级）；无预备/
    ///              未就绪/交接失败回退内联加载（现状路径），start 永不因
    ///              预热缺席而失败；预热加载中走有界等待 ≤5s（不双开引擎，
    ///              防内存翻倍）。
    pub fn start(&self, params: LiveSessionParams) -> Result<i64> {
        let mut guard = self.active.lock().expect("live session lock poisoned");
        if guard.is_some() {
            return Err(AppError::Io("已有进行中的实时会话，请先停止".to_string()));
        }
        let session_id = params
            .db
            .create_session(&crate::types::NewSession {
                title: params.title.clone(),
                source_window: params.source_window.clone(),
                // REQ-043：档案标识落库（None=默认档案）
                profile: params.profile.map(|k| k.as_str().to_string()),
            })
            .map_err(|e| AppError::Db(e.to_string()))?
            .id;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let flag = stop_flag.clone();
        // M6/REQ-051：最新帧共享缓存由 manager 持有（截图命令读取）
        let latest_frame = self.latest_frame.clone();
        // 2026-08 A1：会话暂停共享状态——按会话复位（P2 补漏：标志/补偿时长
        // 跨会话残留会让新会话起始即暂停、时间戳偏移）
        self.pause.reset();
        let pause = self.pause.clone();
        // v0.7.2（REQ-151）：从窗口标题初始化会话信息（平台/系列/集号——
        // 标题信号零成本；时长/分P 由屏幕 worker 播放器 OCR 增量补充）
        self.session_info
            .init_from_title(params.source_window.as_deref().unwrap_or(&params.title));

        // P3：尝试交接预备线程
        if let Some(p) = self.prepared.lock().expect("prepared lock poisoned").take() {
            match wait_prepared_ready(&p, std::time::Duration::from_secs(5)) {
                Ok(()) => {
                    let handoff = StartHandoff {
                        params,
                        session_id,
                        stop: flag.clone(),
                        latest_frame: latest_frame.clone(),
                        pause: pause.clone(),
                        session_info: self.session_info.clone(),
                    };
                    match p.tx.send(PrepareMsg::Start(Box::new(handoff))) {
                        Ok(()) => {
                            // 交接成功：预备线程就地转为会话线程（引擎不跨线程）
                            *guard =
                                Some(ActiveSession { stop_flag, thread: p.thread, session_id });
                            return Ok(session_id);
                        }
                        Err(mpsc::SendError(PrepareMsg::Start(h))) => {
                            // 极小竞态（预备线程恰好退出）：取回参数回退内联加载
                            eprintln!("[LiveSession] 预备线程已退出，回退内联加载");
                            let thread = std::thread::Builder::new()
                                .name("entropy-live-session".into())
                                .spawn(move || {
                                    run_session(h.stop, h.params, h.session_id, h.latest_frame, h.pause, h.session_info)
                                })
                                .map_err(|e| AppError::Io(format!("启动会话线程失败: {}", e)))?;
                            *guard = Some(ActiveSession { stop_flag, thread, session_id });
                            return Ok(session_id);
                        }
                        Err(_) => {
                            // 理论不可达（本路径只发 Start；防御：不得静默吞错）。
                            // 注：create_session 已执行——此路径会留一条空会话记录
                            // （与内联 spawn 失败同级别的既有边界，概率极低）
                            return Err(AppError::Io(
                                "预热交接失败（预备线程异常退出），请重试".to_string(),
                            ));
                        }
                    }
                }
                Err(reason) => {
                    // 加载失败/等待超时：取消预备线程（防双引擎内存翻倍），回退内联
                    let _ = p.tx.send(PrepareMsg::Cancel);
                    let cancel_deadline =
                        std::time::Instant::now() + std::time::Duration::from_millis(1000);
                    while !p.thread.is_finished() && std::time::Instant::now() < cancel_deadline {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                    if !p.thread.is_finished() {
                        eprintln!("[LiveSession] 预备线程取消超时，已 detach");
                    }
                    eprintln!("[LiveSession] 预热{}，回退内联加载", reason);
                }
            }
        }

        // 回退：内联加载（现状路径——模型加载在会话线程内完成）
        // 会话信息聚合器先 clone（move 闭包不得借用 &self）
        let inline_session_info = self.session_info.clone();
        let thread = std::thread::Builder::new()
            .name("entropy-live-session".into())
            .spawn(move || {
                run_session(flag, params, session_id, latest_frame, pause, inline_session_info)
            })
            .map_err(|e| AppError::Io(format!("启动会话线程失败: {}", e)))?;
        *guard = Some(ActiveSession { stop_flag, thread, session_id });
        Ok(session_id)
    }

    /// 预热流式 ASR 引擎（P3）：起预备线程加载引擎后 park 等待 Start/Cancel。
    ///
    /// @ai-context: 幂等（已有预备返回当前状态）；活动会话中返回 Idle 不预热
    ///              （避免白占内存）；模型文件缺失由命令层预检拦截，本层不重复。
    pub fn prepare(&self, env: PrepareEnv) -> PrepareStatus {
        // 活动会话中不预热（内存价值为零）
        if self.active.lock().expect("live session lock poisoned").is_some() {
            return PrepareStatus::Idle;
        }
        let mut prep = self.prepared.lock().expect("prepared lock poisoned");
        // 清理线程已退出的残留条目（取消/加载失败后）并上报终态；
        // 线程已退出 = 无可用预备——仅 Failed 值得上报（原因），
        // Ready 是 stale（release 超时 detach 后线程收到 Cancel 退出）
        if let Some(p) = prep.as_ref() {
            if p.thread.is_finished() {
                let st = p.status();
                *prep = None;
                return match st {
                    PrepareStatus::Failed(_) => st,
                    _ => PrepareStatus::Idle,
                };
            }
            return p.status();
        }
        let (tx, rx) = mpsc::channel();
        let status: Arc<Mutex<PrepareStatus>> = Arc::new(Mutex::new(PrepareStatus::Loading));
        let worker_status = status.clone();
        match std::thread::Builder::new()
            .name("entropy-live-prepare".into())
            .spawn(move || {
                crate::live_session_prepare::run_prepared(rx, env, worker_status)
            }) {
            Ok(thread) => {
                *prep = Some(PreparedSession { tx, thread, status: status.clone() });
                PrepareStatus::Loading
            }
            Err(e) => {
                // spawn 失败必须可观测（审查：不得静默失效）
                eprintln!("[LiveSession] 预热线程启动失败: {}", e);
                PrepareStatus::Failed(format!("预热线程启动失败: {}", e))
            }
        }
    }

    /// 释放预热引擎（P3：离开课堂助手页时调用；有界 join ≤1s）。
    pub fn release_prepare(&self) -> Result<()> {
        let p = self.prepared.lock().expect("prepared lock poisoned").take();
        let Some(p) = p else { return Ok(()) };
        let _ = p.tx.send(PrepareMsg::Cancel);
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1000);
        while !p.thread.is_finished() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        if !p.thread.is_finished() {
            // 卡在引擎加载中（不可中断）：detach——加载完即退出释放，可观测
            eprintln!("[LiveSession] 预热线程 1s 内未退出，已 detach");
        }
        Ok(())
    }

    /// 当前预热状态（live_session_status 的 prepared 字段数据源）。
    pub fn prepare_status(&self) -> PrepareStatus {
        let mut prep = self.prepared.lock().expect("prepared lock poisoned");
        match prep.as_ref() {
            Some(p) if p.thread.is_finished() => {
                // 线程已退出（取消/加载失败残留）：清理并上报终态；
                // 与 prepare() 同口径——Ready 为 stale（线程已死=无预备）
                let st = p.status();
                *prep = None;
                match st {
                    PrepareStatus::Failed(_) => st,
                    _ => PrepareStatus::Idle,
                }
            }
            Some(p) => p.status(),
            None => PrepareStatus::Idle,
        }
    }

    /// 停止活动会话（有界等待线程退出，返回其会话 id）。
    ///
    /// @ai-context: 有界等待 5s（审查 M7 修复）：超时后 detach（线程最终自行退出），
    ///              不阻塞 Tauri IPC；调用方（command）用 spawn_blocking 包裹。
    /// @ai-context: REQ-031：融合已移入后台线程，会话线程在 finish+emit 后即退出——
    ///              停止响应不随段数恶化（融合重算不再阻塞停止）。
    pub fn stop_active(&self) -> Result<Option<i64>> {
        let mut guard = self.active.lock().expect("live session lock poisoned");
        let Some(active) = guard.take() else { return Ok(None) };
        active.stop_flag.store(true, Ordering::SeqCst);
        let session_id = active.session_id;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !active.thread.is_finished() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        if !active.thread.is_finished() {
            eprintln!("[LiveSession] 会话线程 5s 内未退出，已 detach（资源由系统回收）");
        }
        Ok(Some(session_id))
    }

    /// 当前活动会话 id（无则 None；线程已退出的残留会话自动清理——审查 M6 修复）。
    pub fn active_session_id(&self) -> Option<i64> {
        let mut guard = self.active.lock().expect("live session lock poisoned");
        match guard.as_ref() {
            Some(a) if a.thread.is_finished() => {
                // 线程内启动失败（模型加载/音频设备不可用）退出后清理残留
                let id = a.session_id;
                *guard = None;
                Some(id)
            }
            Some(a) => Some(a.session_id),
            None => None,
        }
    }
}

/// 有界等待预备线程就绪（P3）：Ready→Ok；Failed/超时→Err（原因）。
/// 注：调用方（start）持有 active 锁期间最长阻塞 5s——pause/resume/status
/// 等命令短暂排队（同刻通常只有单个用户操作，可接受；观察项记录）。
/// 返回类型用 std::result::Result——模块内 Result 别名是 AppError。
fn wait_prepared_ready(p: &PreparedSession, timeout: std::time::Duration) -> std::result::Result<(), String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match p.status() {
            PrepareStatus::Ready => return Ok(()),
            PrepareStatus::Failed(e) => return Err(format!("引擎加载失败: {}", e)),
            PrepareStatus::Idle => return Err("预备线程已退出".to_string()),
            PrepareStatus::Loading => {
                if std::time::Instant::now() >= deadline {
                    return Err("等待超时".to_string());
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }
}

/// 会话线程：装配捕获/引擎/worker → 主循环（live_session_loop）→ 后台融合。
fn run_session(
    stop: Arc<AtomicBool>,
    params: LiveSessionParams,
    session_id: i64,
    // M6/REQ-051：最新帧共享缓存（屏幕 worker 写入，manager 持同一实例）
    latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
    // 2026-08 A1：会话暂停共享状态（manager 持同一实例；捕获线程维护补偿时长）
    pause: crate::capture::audio_loopback::SessionPause,
    // v0.7.2（REQ-151）：会话信息聚合（屏幕 worker 播放器 OCR 写入）
    session_info: crate::session_info::SessionInfoCollector,
) {
    let db = params.db.clone();
    let engines = params.engines.clone();
    // A1：会话纪元——音频/屏幕/flush 三处时间戳的唯一基准（ADR-008）
    let epoch = Instant::now();

    // 1) 流式 ASR（SenseVoice 重打分接离线引擎池；M5 热词经共享词表注入）
    // ADR-012 F3-1：rule3 最长句 env 可覆盖（默认 8s——5s 过短致句中硬切）
    let rule3_secs = std::env::var("ENTROPY_ASR_RULE3_SECS")
        .ok()
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(8.0);
    let asr_config = StreamingAsrConfig { rule3_min_utterance_secs: rule3_secs };
    let asr_engine = match StreamingAsrEngine::load(
        &params.streaming_models,
        &asr_config,
        Some(engines.clone()),
        Some(params.vocab.clone()),
        params.punctuation_model.clone(),
    ) {
        Ok(e) => e,
        Err(e) => {
            emit_error(&params.app, &format!("流式 ASR 引擎加载失败: {}", e));
            let _ = db.mark_session_failed(session_id);
            return;
        }
    };
    run_session_after_engine(
        asr_engine,
        stop,
        params,
        session_id,
        latest_frame,
        pause,
        epoch,
        session_info,
    );
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
        // v0.7.2（REQ-151）：会话信息聚合（worker 播放器 OCR 写入）
        let worker_session_info = session_info.clone();
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
                    // v0.7.2（REQ-151）：会话信息聚合（播放器 OCR 写入）
                    worker_session_info,
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
fn emit_error(app: &tauri::AppHandle, message: &str) {
    let _ = app.emit("live:error", message.to_string());
    let _ = app.emit("live:status", "failed");
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "live_session_tests.rs"]
mod tests;
