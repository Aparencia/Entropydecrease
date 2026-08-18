//! 实时会话编排（v0.2.0 汇总：REQ-007~012 的运行时组合层）。
//!
//! @ai-context: 一次"开始实时捕获"启动一个会话线程，线程内串联：
//!              WASAPI 环回（ADR-001）→ 流式 ASR（ADR-003）→ 字幕区 OCR
//!              （ADR-005）→ 实时落库（ADR-004）；停止时 flush 尾句、
//!              双源融合（fusion.rs）并重写会话段、标记 finished。
//! @ai-context: 音频捕获线程与会话线程用 channel 桥接（引擎非 Send 不可跨线程）；
//!              屏幕采样在独立线程运行（TD-026 修复，run_screen_worker）——
//!              OCR 推理不阻塞会话线程的音频消费；字幕段经 Arc<Mutex> 共享回传。
//! @ai-context: 时间戳近似统一：音频/屏幕捕获均在会话线程启动后创建各自的墙钟基准，
//!              三者起点误差 <1s（ADR-005 风险缓解的近似统一）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::resample::compute_rms;
use crate::capture::{AudioChunk, AudioLoopbackCapture};
use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::{AppError, Result};
use crate::fusion::SubtitleSegment;
use crate::live_session_frame::run_screen_worker;
use crate::streaming_asr::{StreamingAsrEngine, StreamingAsrEvent, StreamingAsrModels, SILENCE_RMS_THRESHOLD};
use crate::types::{NewSessionSegment, TranscriptSegment};

/// 会话线程节拍（音频 channel 超时轮询间隔，ms）。
const TICK_MS: u64 = 500;

/// 实时会话启动参数（由 command 层组装）。
pub struct LiveSessionParams {
    pub title: String,
    pub source_window: Option<String>,
    /// 目标窗口句柄（i64 传输，None=全屏）
    pub hwnd: Option<i64>,
    pub db: Db,
    pub engines: EnginePool,
    pub streaming_models: StreamingAsrModels,
    /// 前端事件推送（live:asr-partial / live:subtitle / live:error / live:status）
    pub app: tauri::AppHandle,
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
}

impl Default for LiveSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for LiveSessionManager {
    fn clone(&self) -> Self {
        Self { active: self.active.clone() }
    }
}

impl LiveSessionManager {
    pub fn new() -> Self {
        Self { active: Arc::new(Mutex::new(None)) }
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
            })
            .map_err(|e| AppError::Db(e.to_string()))?
            .id;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let flag = stop_flag.clone();
        let thread = std::thread::Builder::new()
            .name("entropy-live-session".into())
            .spawn(move || run_session(flag, params, session_id))
            .map_err(|e| AppError::Io(format!("启动会话线程失败: {}", e)))?;
        *guard = Some(ActiveSession { stop_flag, thread, session_id });
        Ok(session_id)
    }

    /// 停止活动会话（有界等待线程退出，返回其会话 id）。
    ///
    /// @ai-context: 有界等待 5s（审查 M7 修复）：超时后 detach（线程最终自行退出），
    ///              不阻塞 Tauri IPC；调用方（command）用 spawn_blocking 包裹。
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

/// 会话线程主循环。
fn run_session(stop: Arc<AtomicBool>, params: LiveSessionParams, session_id: i64) {
    let db = params.db.clone();
    let engines = params.engines.clone();
    let session_clock = Instant::now();

    // 1) 流式 ASR（SenseVoice 重打分接离线引擎池）
    let mut asr_engine = match StreamingAsrEngine::load(&params.streaming_models, Some(engines.clone())) {
        Ok(e) => e,
        Err(e) => {
            emit_error(&params.app, &format!("流式 ASR 引擎加载失败: {}", e));
            let _ = db.mark_session_failed(session_id);
            return;
        }
    };

    // 2) 音频捕获：捕获线程 → channel → 会话线程（引擎非 Send）
    let (tx, rx) = mpsc::channel::<AudioChunk>();
    let mut audio = match AudioLoopbackCapture::start(move |chunk| {
        let _ = tx.send(chunk);
    }) {
        Ok(a) => a,
        Err(e) => {
            emit_error(&params.app, &format!("系统音频捕获失败（请检查声音设备）: {}", e));
            let _ = db.mark_session_failed(session_id);
            return;
        }
    };

    // 3) 屏幕采样线程（TD-026 修复：OCR 推理移出会话线程，音频消费不再被阻塞；
    //    失败不阻断音频链路——screen worker 内部容错）
    // @ai-context: 采样器（COM 非 Send）在线程内创建；字幕段经共享缓存回传（停止后读取）。
    let mut asr_segments: Vec<TranscriptSegment> = Vec::new();
    let subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>> = Arc::new(Mutex::new(Vec::new()));
    let worker_segments = subtitle_segments.clone();
    let worker_stop = stop.clone();
    // worker 需独立持有 Db/AppHandle（主循环仍要使用，先 clone 再 move 进闭包）
    let worker_db = db.clone();
    let worker_app = params.app.clone();
    let screen_worker = match std::thread::Builder::new()
        .name("entropy-screen-worker".into())
        .spawn(move || {
            run_screen_worker(
                worker_stop,
                params.hwnd,
                worker_db,
                engines.clone(),
                worker_app,
                session_id,
                worker_segments,
            )
        }) {
        Ok(h) => Some(h),
        Err(e) => {
            // 屏幕采样线程启动失败不阻断音频链路，但必须可观测（审查：不得静默失效）
            eprintln!("[LiveSession] 启动屏幕采样线程失败（字幕/画面识别不可用）: {}", e);
            None
        }
    };

    while !stop.load(Ordering::SeqCst) {
        // ── 音频块 → 流式 ASR ──
        match rx.recv_timeout(Duration::from_millis(TICK_MS)) {
            Ok(chunk) => {
                let silent = compute_rms(&chunk.samples) < SILENCE_RMS_THRESHOLD;
                for event in asr_engine.feed(&chunk.samples, silent) {
                    match event {
                        StreamingAsrEvent::Final { text } => {
                            let end_ms = chunk.timestamp_ms;
                            let start_ms = end_ms.saturating_sub(2000); // 句长近似
                            let _ = db.add_segment(&NewSessionSegment {
                                session_id,
                                start_ms,
                                end_ms,
                                text: text.clone(),
                                source: "asr".to_string(),
                                confidence: Some(0.9),
                            });
                            asr_segments.push(TranscriptSegment { start_ms, end_ms, text });
                        }
                        StreamingAsrEvent::Partial { text } => {
                            let _ = params.app.emit("live:asr-partial", text);
                        }
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break, // 捕获线程退出
        }
    }

    // 4) 停止：flush ASR 尾句（时间戳用会话时钟）
    if let Some(StreamingAsrEvent::Final { text }) = asr_engine.flush() {
        let end_ms = session_clock.elapsed().as_millis() as u64;
        let start_ms = end_ms.saturating_sub(2000);
        let _ = db.add_segment(&NewSessionSegment {
            session_id,
            start_ms,
            end_ms,
            text: text.clone(),
            source: "asr".to_string(),
            confidence: Some(0.8),
        });
        asr_segments.push(TranscriptSegment { start_ms, end_ms, text });
    }
    audio.stop();

    // 5) 等待采样线程退出（有界 5s，超时 detach），再读取字幕段用于融合
    if let Some(worker) = screen_worker {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !worker.is_finished() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        if !worker.is_finished() {
            eprintln!("[LiveSession] 屏幕采样线程 5s 内未退出，已 detach");
        }
    }
    let subtitle_segments = subtitle_segments.lock().expect("subtitle segments lock poisoned").clone();

    // 6) 融合并重写会话段（ADR-005 §3：融合结果落库；失败保留原段）
    let _ = crate::live_session_frame::rewrite_with_fusion(&db, session_id, &subtitle_segments, &asr_segments);

    // 7) 结束会话
    let _ = db.finish_session(session_id);
    let _ = params.app.emit("live:status", "stopped");
}

/// 推送错误事件（并重置前端录制态——审查 M3 修复：失败不能假"录制中"）。
fn emit_error(app: &tauri::AppHandle, message: &str) {
    let _ = app.emit("live:error", message.to_string());
    let _ = app.emit("live:status", "failed");
}
