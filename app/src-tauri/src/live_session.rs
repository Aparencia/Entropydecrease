//! 实时会话编排（v0.2.0 汇总：REQ-007~012 的运行时组合层；v0.3.0 REQ-031/034 增强）。
//!
//! @ai-context: 一次"开始实时捕获"启动一个会话线程，线程内串联：
//!              WASAPI 环回（ADR-001）→ 流式 ASR（ADR-003）→ 字幕区 OCR
//!              （ADR-005）→ 实时落库（ADR-004）；停止时 finish+emit 秒回，
//!              融合移入后台线程（REQ-031，无字幕短路），完成后 session:fused。
//! @ai-context: 时间戳统一（ADR-008 A1）：会话纪元 epoch 在 run_session 起点创建，
//!              注入音频捕获/屏幕 worker/flush 三处——消除 ASR 模型加载秒级延迟
//!              造成的音频时间轴整体偏移（技术审查 A1）。
//! @ai-context: 句起时间戳（ADR-008 A2）：编排层跟踪 Final 后首个非静音块时刻，
//!              替代 end-2000ms 固定句长近似，融合 gap 判断更准。
//! @ai-context: 语音活跃度（B3）：会话线程按 RMS 写共享标志，屏幕 worker 依此
//!              自适应采样（静音期全帧提频捕捉板书/幻灯片）。

use std::collections::HashSet;
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
/// ASR 段 start_ms 兜底近似（句首时刻缺失时：end - 2000ms）。
const SENTENCE_FALLBACK_MS: u64 = 2000;
/// 音频块时长（ms）——与 audio_loopback 的 200ms 定长块对齐（TD-041 句尾校正用）。
const AUDIO_BLOCK_MS: u64 = 200;

/// 句尾时刻（TD-041）：最后语音块起点 + 块时长，逼近真实句尾。
///
/// @ai-context: 端点判定基于尾静音（rule1 2.4s / rule2 1.2s），Final 事件晚于实际
///              句尾 1.2-2.4s——此前 end_ms 系统性拉大融合重叠区（重叠归属字幕，
///              规则 3 消化但 ASR 补缝位置被挤压）；无语音记录时回退当前时刻。
fn sentence_end_ms(last_speech_ms: Option<u64>, fallback_ms: u64) -> u64 {
    last_speech_ms.map(|t| t + AUDIO_BLOCK_MS).unwrap_or(fallback_ms)
}

/// 会话融合状态跟踪（REQ-031：内存标记，ADR-008 决策——不迁移 sessions 表；
/// V1.0 ADR-006 派生表落地时自然取代）。
#[derive(Clone, Default)]
pub struct FusionTracker {
    fusing: Arc<Mutex<HashSet<i64>>>,
}

impl FusionTracker {
    pub fn begin(&self, id: i64) {
        self.fusing.lock().expect("fusion lock poisoned").insert(id);
    }
    pub fn end(&self, id: i64) {
        self.fusing.lock().expect("fusion lock poisoned").remove(&id);
    }
    /// 会话是否正在后台融合（前端据此展示"融合中"；当前由事件驱动，
    /// 查询入口保留供后续轮询/恢复场景，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn is_fusing(&self, id: i64) -> bool {
        self.fusing.lock().expect("fusion lock poisoned").contains(&id)
    }
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
    /// 融合状态跟踪（与 LiveSessionManager 共享同一实例）
    pub fusion: FusionTracker,
    /// 前端事件推送（live:asr-partial / live:subtitle / live:error / live:status / session:*）
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
    fusion: FusionTracker,
}

impl Default for LiveSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for LiveSessionManager {
    fn clone(&self) -> Self {
        Self { active: self.active.clone(), fusion: self.fusion.clone() }
    }
}

impl LiveSessionManager {
    pub fn new() -> Self {
        Self { active: Arc::new(Mutex::new(None)), fusion: FusionTracker::default() }
    }

    /// 融合状态跟踪句柄（command 层组装 LiveSessionParams 时获取）。
    pub fn fusion(&self) -> FusionTracker {
        self.fusion.clone()
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

/// 会话线程主循环。
fn run_session(stop: Arc<AtomicBool>, params: LiveSessionParams, session_id: i64) {
    let db = params.db.clone();
    let engines = params.engines.clone();
    // A1：会话纪元——音频/屏幕/flush 三处时间戳的唯一基准（ADR-008）
    let epoch = Instant::now();
    // 句起时间戳（A2）：Final 后首个非静音块时刻；句尾（TD-041）：最后语音块
    let mut sentence_start_ms: Option<u64> = None;
    let mut last_speech_ms: Option<u64> = None;

    // 1) 流式 ASR（SenseVoice 重打分接离线引擎池）
    let mut asr_engine = match StreamingAsrEngine::load(&params.streaming_models, Some(engines.clone())) {
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
    let mut audio = match AudioLoopbackCapture::start(
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
    let mut asr_segments: Vec<TranscriptSegment> = Vec::new();
    let subtitle_segments: Arc<Mutex<Vec<SubtitleSegment>>> = Arc::new(Mutex::new(Vec::new()));
    let worker_segments = subtitle_segments.clone();
    let worker_stop = stop.clone();
    let speech_active = Arc::new(AtomicBool::new(false));
    let worker_speech = speech_active.clone();
    // worker 需独立持有 Db/AppHandle（主循环仍要使用，先 clone 再 move 进闭包）
    let worker_db = db.clone();
    let worker_app = params.app.clone();
    let screen_worker = match std::thread::Builder::new()
        .name("entropy-screen-worker".into())
        .spawn(move || {
            run_screen_worker(
                worker_stop,
                params.hwnd,
                epoch,
                worker_speech,
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
                // B3：语音活跃度共享（屏幕 worker 自适应采样依据）
                speech_active.store(!silent, Ordering::Relaxed);
                // A2：句起时刻 = Final 后首个非静音块（真实句首，替代 end-2000ms 近似）；
                // TD-041：句尾 = 最后语音块 + 块时长（端点判定滞后 1.2-2.4s 的校正）
                if !silent {
                    if sentence_start_ms.is_none() {
                        sentence_start_ms = Some(chunk.timestamp_ms);
                    }
                    last_speech_ms = Some(chunk.timestamp_ms);
                }
                for event in asr_engine.feed(&chunk.samples, silent) {
                    match event {
                        StreamingAsrEvent::Final { text } => {
                            let end_ms = sentence_end_ms(last_speech_ms, chunk.timestamp_ms);
                            let start_ms = sentence_start_ms
                                .take()
                                .unwrap_or_else(|| end_ms.saturating_sub(SENTENCE_FALLBACK_MS));
                            // 语音定稿事件（前端实时转写流展示/计数，简要单行卡片）
                            let _ = params.app.emit("live:asr-final", text.clone());
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

    // 4) 停止：flush ASR 尾句（时间戳用会话纪元；句尾校正同 TD-041）
    if let Some(StreamingAsrEvent::Final { text }) = asr_engine.flush() {
        let now_ms = epoch.elapsed().as_millis() as u64;
        let end_ms = sentence_end_ms(last_speech_ms, now_ms);
        let start_ms = sentence_start_ms
            .take()
            .unwrap_or_else(|| end_ms.saturating_sub(SENTENCE_FALLBACK_MS));
        // 尾句同样推前端（实时转写流保持完整）
        let _ = params.app.emit("live:asr-final", text.clone());
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

    // 5) REQ-031：finish + emit 秒回（毫秒级），融合移入后台线程——
    //    停止响应不再随段数恶化（大会话融合重算不再阻塞停止按钮）
    let _ = db.finish_session(session_id);
    let _ = params.app.emit("live:status", "stopped");

    // 6) 后台融合线程：join 采样线程（有界）→ 读取字幕段 → 无字幕短路 → 融合 → 事件
    // @ai-context: Db/AppHandle 均为 Arc 可跨线程；字幕/ASR 段所有权随闭包转移；
    //              失败保留原段（replace_segments 单事务回滚保证）。
    let fusion_db = db.clone();
    let fusion_app = params.app.clone();
    let fusion_tracker = params.fusion.clone();
    fusion_tracker.begin(session_id);
    let _ = params.app.emit("session:fusing", session_id);
    // 审查 P1 修复（TD-035）：spawn 失败必须清理 fusing 标记并告知前端，
    // 否则标记永久残留（累积泄漏）且 UI 一直显示"融合中"
    let thread_tracker = fusion_tracker.clone();
    let spawn_result = std::thread::Builder::new()
        .name("entropy-fusion".into())
        .spawn(move || {
            // 等待采样线程退出（有界 5s，超时 detach），再读取字幕段用于融合——
            // worker 退出前的 voter.flush 保证末句字幕已定稿入缓存
            if let Some(worker) = screen_worker {
                let deadline = Instant::now() + Duration::from_secs(5);
                while !worker.is_finished() && Instant::now() < deadline {
                    std::thread::sleep(Duration::from_millis(100));
                }
                if !worker.is_finished() {
                    eprintln!("[LiveSession] 屏幕采样线程 5s 内未退出，已 detach");
                }
            }
            let subtitle_segments =
                subtitle_segments.lock().expect("subtitle segments lock poisoned").clone();
            let result = crate::live_session_frame::rewrite_with_fusion(
                &fusion_db,
                session_id,
                &subtitle_segments,
                &asr_segments,
            );
            thread_tracker.end(session_id);
            match result {
                Ok(()) => {
                    let _ = fusion_app.emit("session:fused", session_id);
                }
                Err(e) => {
                    // 融合失败保留原段，前端提示（详情页仍可读原始轴）
                    let _ = fusion_app.emit("session:fusion-failed", format!("融合失败（原始段已保留）: {}", e));
                }
            }
        });
    if let Err(e) = spawn_result {
        // spawn 失败：清理标记 + 推送失败事件（原始段仍在库中，不丢数据）
        fusion_tracker.end(session_id);
        let _ = params.app.emit("session:fusion-failed", format!("融合线程启动失败（原始段已保留）: {}", e));
    }
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
