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

use crate::asr_dedupe::dedupe_across_finals;
use crate::asr_merge::merge_segments;
use crate::capture::resample::compute_rms;
use crate::capture::{AudioChunk, AudioLoopbackCapture};
use crate::db::Db;
use crate::engine::EnginePool;
use crate::error::{AppError, Result};
use crate::fusion::SubtitleSegment;
use crate::live_session_frame::run_screen_worker;
use crate::streaming_asr::{
    StreamingAsrConfig, StreamingAsrEngine, StreamingAsrEvent, StreamingAsrModels,
    SILENCE_RMS_THRESHOLD,
};
use crate::types::{NewSessionSegment, TranscriptSegment};

/// 会话线程节拍（音频 channel 超时轮询间隔，ms）。
const TICK_MS: u64 = 500;

/// 音频块时长（秒）——audio_loopback 以 200ms 切块（16000/5），
/// AsrHealthMonitor 的时间步长必须与之对齐（TD-050 修复）。
const AUDIO_BLOCK_SECS: f64 = 0.2;
/// ASR 段 start_ms 兜底近似（句首时刻缺失时：end - 2000ms）。
const SENTENCE_FALLBACK_MS: u64 = 2000;
/// 音频块时长（ms）——与 audio_loopback 的 200ms 定长块对齐（TD-041 句尾校正用）。
const AUDIO_BLOCK_MS: u64 = 200;

/// 停止后 drain 宽限（s，2026-08-19 取优整合）：停止瞬间积压的音频块继续
/// 喂入处理（内容不丢）；宽限到期强制退出（停止响应不被无限积压拖死）。
const DRAIN_GRACE_SECS: u64 = 8;

/// 链式合并兜底上限（ADR-012 F4-1，merge-then-split 方案）。
///
/// @ai-context: 正常路径由"合并后句子切分"消化（合并文本内完整句即时落库
///              推送，残余继续挂起），上限仅兜底模型长期无句号的极端场景
///              （重打分与标点恢复均未给出句号）——防挂起文本无限增长。
const MAX_MERGE_CHAIN: u32 = 4;

/// 句尾时刻（TD-041）：最后语音块起点 + 块时长，逼近真实句尾。
///
/// @ai-context: 端点判定基于尾静音（rule1 2.4s / rule2 1.2s），Final 事件晚于实际
///              句尾 1.2-2.4s——此前 end_ms 系统性拉大融合重叠区（重叠归属字幕，
///              规则 3 消化但 ASR 补缝位置被挤压）；无语音记录时回退当前时刻。
fn sentence_end_ms(last_speech_ms: Option<u64>, fallback_ms: u64) -> u64 {
    last_speech_ms.map(|t| t + AUDIO_BLOCK_MS).unwrap_or(fallback_ms)
}

/// 语音定稿事件载荷（TD-043：携带后端会话纪元时间戳，前端显示与时间轴一致）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrFinalEvent {
    pub timestamp_ms: u64,
    pub text: String,
}

/// 定稿段推送 + 落库（正常段/挂起段兜底/合并段共用——ADR-012 F4-1）。
///
/// @ai-context: 事件、session_segments、asr_segments（融合输入）三处一致落库，
///              避免 F4-1 挂起/合并引入的多出口不一致（与 R7 预览落库一致性同构）。
/// @ai-context: 参数多为编排上下文传递（app/db/session_id/segments/时间戳/文本/
///              置信度），聚合会破坏内聚——登记 clippy 豁免（与 engine.rs 同模式）。
#[allow(clippy::too_many_arguments)]
fn persist_final(
    app: &tauri::AppHandle,
    db: &Db,
    session_id: i64,
    asr_segments: &mut Vec<TranscriptSegment>,
    start_ms: u64,
    end_ms: u64,
    text: String,
    confidence: f32,
) {
    let _ = app.emit(
        "live:asr-final",
        AsrFinalEvent { timestamp_ms: start_ms, text: text.clone() },
    );
    let _ = db.add_segment(&NewSessionSegment {
        session_id,
        start_ms,
        end_ms,
        text: text.clone(),
        source: "asr".to_string(),
        confidence: Some(confidence),
    });
    asr_segments.push(TranscriptSegment {
        start_ms,
        end_ms,
        text,
        // 流式链路词级时间戳：B8 由离线/精修路径产出（None）
        word_timestamps: None,
        // REQ-062：融合概率加权输入（与落库 confidence 同源）
        confidence: Some(confidence),
    });
}

/// 合并文本消化：句子切分 + 比例时间戳落库推送；返回残余（含其起点）。
///
/// @ai-context: F4-1 增强（merge-then-split）：合并文本按段内真实句号切分——
///              完整句逐句落库推送（句子级粒度，边界不切碎句子）；无句号的
///              尾部残余返回给调用方（硬切上下文继续挂起，正常句上下文落库）。
///              时间戳按字符比例近似（流式链路无词级时间戳，语速均匀假设；
///              单调不重叠，融合对齐可接受）。
fn digest_merged(
    app: &tauri::AppHandle,
    db: &Db,
    session_id: i64,
    asr_segments: &mut Vec<TranscriptSegment>,
    start_ms: u64,
    end_ms: u64,
    text: &str,
) -> Option<(String, u64)> {
    let (complete, rest) = crate::asr_merge::split_sentences(text);
    let mut counts: Vec<usize> = complete.iter().map(|s| s.chars().count()).collect();
    counts.push(rest.chars().count());
    let spans = crate::asr_merge::split_timestamps(start_ms, end_ms, &counts);
    for (i, s) in complete.iter().enumerate() {
        let (s_ms, e_ms) = spans[i];
        persist_final(app, db, session_id, asr_segments, s_ms, e_ms, s.clone(), 0.9);
    }
    if rest.trim().is_empty() {
        None
    } else {
        // 残余起点 = 完整句之后的占比位置（时间戳连续衔接）
        let rest_start = spans.last().map(|(s, _)| *s).unwrap_or(start_ms);
        Some((rest, rest_start))
    }
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

/// 会话线程主循环。
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
    // 句起时间戳（A2）：Final 后首个非静音块时刻；句尾（TD-041）：最后语音块
    let mut sentence_start_ms: Option<u64> = None;
    let mut last_speech_ms: Option<u64> = None;
    // M6/REQ-041 A1：音频预处理链（默认关——微基准 CER 对比后定默认；
    // 开启后 AGC + 削波检测 + 动态静音阈值，防轻声讲课被 VAD 截断）
    // ADR-012 F2-3：env ENTROPY_AUDIO_PREPROC=1 先行实测（12.wav 低电平取证）
    let preproc_enabled = std::env::var("ENTROPY_AUDIO_PREPROC").map(|v| v == "1").unwrap_or(false);
    let mut audio_pre = crate::audio_preprocess::AudioPreprocessor::new(
        crate::audio_preprocess::AudioPreprocessConfig {
            enabled: preproc_enabled,
            ..Default::default()
        },
    );
    let mut clipping_logged = false;
    // M7/REQ-042 F5：ASR 健康监测（静默语音 → 降级提示；恢复自动回落）
    let mut asr_health = crate::asr_health::AsrHealthMonitor::new();
    let mut asr_tier_emitted = crate::asr_health::AsrTier::Streaming;
    // ADR-012 F3-2：跨 final 重叠去重状态（上一 Final 净化文本；空=无前句）
    let mut last_final_clean: Option<String> = None;
    // ADR-012 F4-1：rule3 硬切段挂起（start_ms, end_ms, text, 已合并次数）——
    // 等下一 Final 尝试语义合并；合并次数达 MAX_MERGE_CHAIN 强制落库（防整段合一）
    let mut pending_merge: Option<(u64, u64, String, u32)> = None;

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
    // M6/REQ-051：会话图片存储（关键帧归档；创建失败不阻断屏幕链路）
    let image_store = crate::image_store::SessionImageStore::new(
        params.data_dir.join("session-images").join(session_id.to_string()),
    )
    .map_err(|e| eprintln!("[LiveSession] 会话图片库初始化失败（图集不可用）: {}", e))
    .ok();
    // M4/REQ-068（S4）：实时链路音频落盘（WAV PCM16；创建失败降级不阻断）
    let mut audio_writer = crate::audio_store::SessionAudioWriter::create(
        &params.data_dir.join("session-audio"),
        session_id,
        &crate::audio_store::AudioStoreConfig::default(),
    );
    // M4/REQ-069（AL1）：VAD 阈值自适应（VAD_ADAPTIVE=0 可关——"可关"开关）
    let vad_enabled = std::env::var("VAD_ADAPTIVE").map(|v| v != "0").unwrap_or(true);
    let mut adaptive_vad = crate::vad_adaptive::AdaptiveVad::new(crate::vad_adaptive::AdaptiveVadConfig {
        enabled: vad_enabled,
    });
    // M6/REQ-051：最新帧共享缓存（用户截图命令读取）
    let worker_latest = latest_frame.clone();
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
                params.profile,
                image_store,
                worker_latest,
                // REQ-083：UI 垃圾黑名单（Clone 廉价——Vec 条目）
                params.ui_junk.clone(),
            )
        }) {
        Ok(h) => Some(h),
        Err(e) => {
            // 屏幕采样线程启动失败不阻断音频链路，但必须可观测（审查：不得静默失效）
            eprintln!("[LiveSession] 启动屏幕采样线程失败（字幕/画面识别不可用）: {}", e);
            None
        }
    };

    // 2026-08-19 取优整合：停止后 drain——停止瞬间 channel 中已送达未处理的音频块
    // 继续喂入（内容不丢；"停止时积压丢弃"兜底，会话 22 类缺失防御）。drain 有界
    // （宽限 8s，停止响应与内容完整性权衡）；队列空（Timeout）即退出。
    let drain_deadline = Instant::now() + Duration::from_secs(DRAIN_GRACE_SECS);
    let mut draining = false;
    loop {
        if draining && Instant::now() >= drain_deadline {
            eprintln!("[LiveSession] 停止宽限 {}s 到期，剩余积压音频丢弃（可观测）", DRAIN_GRACE_SECS);
            break;
        }
        // ── 音频块 → 流式 ASR ──
        match rx.recv_timeout(Duration::from_millis(TICK_MS)) {
            Ok(chunk) => {
                // M4/REQ-068（S4）：原始样本落盘（预处理前——V4 两遍解码/
                // AL3 漂移实测需原始音频；写盘失败内部降级不阻断）
                if let Some(w) = audio_writer.as_mut() {
                    w.write_chunk(&chunk.samples);
                }
                // M6/REQ-041 A1：预处理（默认直通零开销；开启后 AGC/削波/动态阈值）
                let processed = audio_pre.process(&chunk.samples, SILENCE_RMS_THRESHOLD);
                if processed.clipped && !clipping_logged {
                    clipping_logged = true;
                    eprintln!("[LiveSession] 检测到音频削波（输入电平过高，建议降低系统音量）");
                }
                // TD-047 修复：静音判定用 **AGC 前原始样本** 与动态阈值比较——
                // speech_threshold 基于原始噪声底估计，二者必须同尺度；
                // 否则 AGC 放大后环境噪声被误判为语音（VAD/句切分失效）
                // M4/REQ-069（AL1）：阈值自适应——AGC 开启时用预处理链动态阈值
                // （不重复自适应）；否则会话内能量统计自适应（跟随噪声底）
                let raw_rms = compute_rms(&chunk.samples);
                let vad_threshold = if audio_pre.config.enabled {
                    processed.speech_threshold
                } else {
                    adaptive_vad.next_threshold(raw_rms, SILENCE_RMS_THRESHOLD)
                };
                let silent = raw_rms < vad_threshold;
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
                let mut events = asr_engine.feed(&processed.samples, silent);
                // M7/REQ-042 F5：有语音无产出持续 → 降级链提示（F3 静默失败可见化）
                // TD-050 修复：dt 取音频块时长 0.2s（TICK_MS=500 是轮询超时，非块时长）
                // 2026-08-19 取优整合：语音活跃度用**固定阈值**判定（不随 VAD 自适应
                // 失真）——VAD 阈值误判（会话 12/22 类）时降级提示仍能触发，静默
                // 失败可见性不失效
                let tier = asr_health.observe(
                    raw_rms >= SILENCE_RMS_THRESHOLD,
                    !events.is_empty(),
                    AUDIO_BLOCK_SECS,
                );
                if tier != asr_tier_emitted {
                    let prev = asr_tier_emitted;
                    asr_tier_emitted = tier;
                    if tier == crate::asr_health::AsrTier::Streaming && prev != crate::asr_health::AsrTier::Streaming {
                        // 恢复可见化：降级提示在前端不再残留（审查 low 项修复）
                        eprintln!("[LiveSession] ASR 已恢复主链路");
                        let _ = params.app.emit("live:asr-recovered", ());
                    } else {
                        let reason = crate::asr_health::tier_reason(tier);
                        if !reason.is_empty() {
                            eprintln!("[LiveSession] ASR 降级: {}", reason);
                            let _ = params.app.emit("live:asr-degraded", reason.to_string());
                        }
                    }
                }
                for event in events.drain(..) {
                    match event {
                        StreamingAsrEvent::Final { text, merge_with_next } => {
                            // ADR-012 F3-2：跨 final 重叠去重（rule3 硬切/端点误断句
                            // 的句尾词重复防护）；整体重复 → 跳过推送与落库
                            let text = match &last_final_clean {
                                Some(prev) => dedupe_across_finals(prev, &text),
                                None => text,
                            };
                            if text.is_empty() {
                                continue;
                            }
                            last_final_clean = Some(text.clone());
                            let end_ms = sentence_end_ms(last_speech_ms, chunk.timestamp_ms);
                            let start_ms = sentence_start_ms
                                .take()
                                .unwrap_or_else(|| end_ms.saturating_sub(SENTENCE_FALLBACK_MS));
                            // ADR-012 F4-1：rule3/短停顿硬切段挂起——等下一 Final
                            // 判定语义合并（gap ≤600ms 才合并）；不立即推送/落库
                            // TD-2026-08-19 修复：连续硬切必须**链式合并**——此前
                            // 新挂起段无条件覆盖旧挂起段，连续 rule3 切段（13.wav
                            // 取证模式）时中间段全部丢失（不落库不推送）
                            if merge_with_next {
                                // 已有挂起段：先尝试链式合并（同一句话被切多刀）。
                                // merge-then-split（F4-1 增强）：合并后立即按句号
                                // 切分——完整句即时落库推送（实时流按句子沉淀），
                                // 无句号的残余继续挂起（半句不丢、不提前切断）
                                if let Some((p_start, p_end, p_text, merges)) = pending_merge.take() {
                                    let gap = start_ms.saturating_sub(p_end);
                                    if merges < MAX_MERGE_CHAIN {
                                        if let Some(merged) = merge_segments(&p_text, &text, gap) {
                                            last_final_clean = Some(merged.clone());
                                            match digest_merged(
                                                &params.app,
                                                &db,
                                                session_id,
                                                &mut asr_segments,
                                                p_start,
                                                end_ms,
                                                &merged,
                                            ) {
                                                Some((rest, rest_start)) => {
                                                    // 残余半句继续挂起（链式延续）
                                                    pending_merge =
                                                        Some((rest_start, end_ms, rest, merges + 1));
                                                }
                                                None => {
                                                    // 整段以句号结尾全部切出：挂起清空
                                                }
                                            }
                                            continue;
                                        }
                                    }
                                    // 合并失败（gap 超限）或已达兜底上限：落库旧挂起段
                                    persist_final(
                                        &params.app,
                                        &db,
                                        session_id,
                                        &mut asr_segments,
                                        p_start,
                                        p_end,
                                        p_text,
                                        0.9,
                                    );
                                }
                                pending_merge = Some((start_ms, end_ms, text, 0));
                                continue;
                            }
                            // 先消化挂起段：gap 内合并为完整句；否则兜底独立落库
                            if let Some((p_start, p_end, p_text, _merges)) = pending_merge.take() {
                                let gap = start_ms.saturating_sub(p_end);
                                if let Some(merged) = merge_segments(&p_text, &text, gap) {
                                    last_final_clean = Some(merged.clone());
                                    // 合并文本同样按句子切分落库（可能含多句）；
                                    // 残余是当前句尾部（其后为真实停顿，不再挂起
                                    // 合并）——残余直接落库为最后一段，内容不丢
                                    match digest_merged(
                                        &params.app,
                                        &db,
                                        session_id,
                                        &mut asr_segments,
                                        p_start,
                                        end_ms,
                                        &merged,
                                    ) {
                                        Some((rest, rest_start)) => {
                                            persist_final(
                                                &params.app,
                                                &db,
                                                session_id,
                                                &mut asr_segments,
                                                rest_start,
                                                end_ms,
                                                rest,
                                                0.9,
                                            );
                                        }
                                        None => {}
                                    }
                                    continue;
                                }
                                persist_final(
                                    &params.app,
                                    &db,
                                    session_id,
                                    &mut asr_segments,
                                    p_start,
                                    p_end,
                                    p_text,
                                    0.9,
                                );
                            }
                            // 正常段：定稿推送 + 落库（TD-043 时间戳载荷）
                            persist_final(
                                &params.app,
                                &db,
                                session_id,
                                &mut asr_segments,
                                start_ms,
                                end_ms,
                                text,
                                0.9,
                            );
                        }
                        StreamingAsrEvent::Partial { text } => {
                            let _ = params.app.emit("live:asr-partial", text);
                        }
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                // 停止信号置位：进入 drain（继续处理积压块）；积压清空后退出
                if draining {
                    break;
                }
                if stop.load(Ordering::SeqCst) {
                    draining = true;
                }
            }
            Err(RecvTimeoutError::Disconnected) => break, // 捕获线程退出
        }
    }

    // 4) 停止：先兜底落库挂起段（F4-1——停止时无下一段可合并），再 flush 尾句
    //    （时间戳用会话纪元；句尾校正同 TD-041；跨 final 去重同主循环）
    if let Some((p_start, p_end, p_text, _merges)) = pending_merge.take() {
        persist_final(
            &params.app,
            &db,
            session_id,
            &mut asr_segments,
            p_start,
            p_end,
            p_text,
            0.8,
        );
    }
    if let Some(StreamingAsrEvent::Final { text, .. }) = asr_engine.flush() {
        let text = match &last_final_clean {
            Some(prev) => dedupe_across_finals(prev, &text),
            None => text,
        };
        if !text.is_empty() {
            let now_ms = epoch.elapsed().as_millis() as u64;
            let end_ms = sentence_end_ms(last_speech_ms, now_ms);
            let start_ms = sentence_start_ms
                .take()
                .unwrap_or_else(|| end_ms.saturating_sub(SENTENCE_FALLBACK_MS));
            persist_final(
                &params.app,
                &db,
                session_id,
                &mut asr_segments,
                start_ms,
                end_ms,
                text,
                0.8,
            );
        }
    }
    audio.stop();

    // M4/REQ-068（S4）：结束会话——回填 WAV 长度 + 触发清理
    // （保留期 30 天 + 磁盘预算上限，删最旧；预算清理在会话结束时执行）
    if let Some(w) = audio_writer.as_mut() {
        w.finalize();
        let summary = crate::audio_store::cleanup(
            &params.data_dir.join("session-audio"),
            crate::audio_store::DEFAULT_RETENTION_DAYS,
            crate::audio_store::DEFAULT_DISK_BUDGET_BYTES,
        );
        if summary.deleted > 0 {
            eprintln!(
                "[AudioStore] 会话 {} 结束清理：删除 {} 个文件，释放 {} 字节",
                session_id, summary.deleted, summary.freed_bytes
            );
        }
    }

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
            let result = crate::live_keyframes::rewrite_with_fusion(
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
