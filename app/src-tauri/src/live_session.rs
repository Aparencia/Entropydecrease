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
use crate::streaming_asr::{StreamingAsrConfig, StreamingAsrEngine, StreamingAsrModels};

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
        }
    }
}

impl LiveSessionManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(None)),
            fusion: FusionTracker::default(),
            latest_frame: Arc::new(Mutex::new(None)),
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

    /// 启动实时会话：建会话 + 起编排线程，返回会话 id。
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
        let thread = std::thread::Builder::new()
            .name("entropy-live-session".into())
            .spawn(move || run_session(flag, params, session_id, latest_frame))
            .map_err(|e| AppError::Io(format!("启动会话线程失败: {}", e)))?;
        *guard = Some(ActiveSession { stop_flag, thread, session_id });
        Ok(session_id)
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

/// 会话线程：装配捕获/引擎/worker → 主循环（live_session_loop）→ 后台融合。
fn run_session(
    stop: Arc<AtomicBool>,
    params: LiveSessionParams,
    session_id: i64,
    // M6/REQ-051：最新帧共享缓存（屏幕 worker 写入，manager 持同一实例）
    latest_frame: Arc<Mutex<Option<crate::live_session_frame::LatestCapturedFrame>>>,
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
    let mut asr_engine = match StreamingAsrEngine::load(
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
    // ADR-007：会话启动成功（引擎就绪）→ 广播录制态（前端全局采集徽标依赖此事件；
    // 音频/屏幕后续故障走自动恢复不再终止会话）
    let _ = params.app.emit("live:status", "recording");

    // 2) 音频捕获：捕获线程 → channel → 会话线程（引擎非 Send）
    // @ai-context: ADR-007：start 不再因设备缺失返回 Err——捕获线程内部自动重连
    //              （指数退避），会话不因设备插拔/切换死亡；恢复事件推送前端。
    let (tx, rx) = mpsc::channel::<AudioChunk>();
    let recovery_app = params.app.clone();
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
