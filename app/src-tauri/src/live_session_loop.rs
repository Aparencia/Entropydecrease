//! 实时会话音频编排循环（v0.7.0 M0 X-O5 行数拆分：live_session.rs 798 行超限硬拆）。
//!
//! @ai-context: 会话线程主循环：音频块 → 预处理 → VAD 门控 → 流式 ASR → 事件
//!              分发（Final 去重/挂起合并/句子切分落库）→ drain/停止 flush。
//!              Final 事件处理域在 live_session_persist.rs（handle_final_event），
//!              本文件只保留编排骨架与音频预处理/VAD 门控。
//!              时间戳统一（ADR-008 A1）：会话纪元 epoch 在 run_session 起点
//!              创建，注入音频捕获/屏幕 worker/flush 三处——消除 ASR 模型加载
//!              秒级延迟造成的音频时间轴整体偏移（技术审查 A1）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::capture::resample::compute_rms;
use crate::capture::AudioChunk;
use crate::db::Db;
use crate::live_session_persist::{flush_tail_and_persist, handle_final_event, FinalEventCtx};
use crate::streaming_asr::{StreamingAsrEngine, StreamingAsrEvent, SILENCE_RMS_THRESHOLD};
use crate::types::TranscriptSegment;

/// 会话线程节拍（音频 channel 超时轮询间隔，ms）。
const TICK_MS: u64 = 500;
/// 音频块时长（秒）——audio_loopback 以 200ms 切块（16000/5），
/// AsrHealthMonitor 的时间步长必须与之对齐（TD-050 修复）。
const AUDIO_BLOCK_SECS: f64 = 0.2;
/// 停止后 drain 宽限（s，2026-08-19 取优整合）：停止瞬间积压的音频块继续
/// 喂入处理（内容不丢）；宽限到期强制退出（停止响应不被无限积压拖死）。
const DRAIN_GRACE_SECS: u64 = 8;
/// 长静音事件触发块数（REQ-108：3s ÷ 0.2s/块 = 15 块——与 analysis
/// LONG_SILENCE_GAP_MS=3000 同口径，章节检测真实信号源）。
const LONG_SILENCE_EVENT_BLOCKS: u32 = 15;
/// 音频块时长（ms，REQ-108 长静音事件载荷计算用——与 AUDIO_BLOCK_SECS 同源）。
const AUDIO_BLOCK_MS: u64 = 200;
/// 音量骤变事件阈值（REQ-108：段间 volume 差 ≥ 该值写 VolumeSurge 事件——
/// 与 highlight_detect VOLUME_SURGE_DELTA=0.3 同口径，重点标注冗余备源）。
const VOLUME_SURGE_EVENT_DELTA: f32 = 0.3;

/// 主循环共享上下文（run_session 装配，run_audio_loop 消费）。
///
/// @ai-context: 引擎/预处理/健康监测等可变状态聚合于此——主循环拆至独立文件
///              的传参通道（拆分硬约束：不跨函数复制 stop/epoch 等上下文）。
pub(crate) struct LiveLoopCtx<'a> {
    pub stop: Arc<AtomicBool>,
    pub epoch: Instant,
    pub app: &'a tauri::AppHandle,
    pub db: &'a Db,
    pub session_id: i64,
    pub asr_segments: &'a mut Vec<TranscriptSegment>,
    pub speech_active: Arc<AtomicBool>,
    /// REQ-291（v0.19.7）：媒体级"最后有声时刻"戳（Arc<Mutex<Option<Instant>>>——
    /// 音频线程每块写、屏幕线程拍级读；区别于 speech_active（VAD 语音级）——
    /// 判定"有任何声音"（含音乐/环境声），随播随停双通道之一）
    pub media_sound: Arc<std::sync::Mutex<Option<Instant>>>,
    pub asr_engine: &'a mut StreamingAsrEngine,
    pub audio_writer: &'a mut Option<crate::audio_store::SessionAudioWriter>,
    /// REQ-115：VAD 阈值共享槽（诊断可查；None=无槽注入——测试路径）
    pub vad_slot: Option<&'a crate::vad_threshold_slot::VadThresholdSlot>,
    /// 2026-08 A1：会话暂停共享状态（边沿检测：断句隔离 + 事件 + 落库）
    pub pause: &'a crate::capture::audio_loopback::SessionPause,
}

/// 音频主循环：消费捕获块 → 预处理/VAD → ASR feed → 事件分发；停止时 drain + flush。
///
/// @ai-context: 语音活跃度（B3）：按 RMS 写共享标志，屏幕 worker 依此自适应
///              采样（静音期全帧提频捕捉板书/幻灯片）。
/// @ai-context: 句起时间戳（ADR-008 A2）：跟踪 Final 后首个非静音块时刻，
///              替代 end-2000ms 固定句长近似，融合 gap 判断更准。
#[allow(clippy::too_many_arguments)]
pub(crate) fn run_audio_loop(
    rx: mpsc::Receiver<AudioChunk>,
    mut audio: crate::capture::AudioLoopbackCapture,
    ctx: LiveLoopCtx<'_>,
    data_dir: &std::path::Path,
) {
    let mut asr_health = crate::asr_health::AsrHealthMonitor::new();
    let mut asr_tier_emitted = crate::asr_health::AsrTier::Streaming;
    // M14/REQ-105：音频事件过滤——通知音/系统音固定音模式检测 → VAD 静音门控
    // 联动（M10/REQ-126 分应用音频路由实装后本机制降为兜底，防路由未覆盖提示音）
    let mut event_filter = crate::audio_event_filter::AudioEventFilter::default();
    // M6/REQ-041 A1 + REQ-101（v0.7.0 M1）：音频预处理链开关——配置文件
    // （audio-preproc.json，设置面板 UI 开关）> env ENTROPY_AUDIO_PREPROC
    // （开发期快速实测）> 默认开（2026-08 用户决策：防轻声讲课被 VAD 截断；
    // 12.wav 低电平取证 ADR-012 F2-3）。开启后 AGC + 削波检测 + 动态静音阈值
    let preproc_cfg = crate::audio_preproc_config::AudioPreprocConfig::load(&data_dir.join("audio-preproc.json"));
    let mut audio_pre = crate::audio_preprocess::AudioPreprocessor::new(
        crate::audio_preprocess::AudioPreprocessConfig {
            enabled: preproc_cfg.effective(),
            ..Default::default()
        },
    );
    let mut adaptive_vad = crate::vad_adaptive::AdaptiveVad::new(crate::vad_adaptive::AdaptiveVadConfig {
        enabled: std::env::var("VAD_ADAPTIVE").map(|v| v != "0").unwrap_or(true),
    });
    // 句起/句尾/跨 final 去重/挂起合并状态（A2/TD-041/ADR-012 F3-2/F4-1）
    let mut sentence_start_ms: Option<u64> = None;
    let mut last_speech_ms: Option<u64> = None;
    let mut last_final_clean: Option<String> = None;
    // 末两位=挂起段置信度/音量（REQ-098/103：合并兜底落库时透传）
    let mut pending_merge: Option<crate::live_session_persist::PendingMerge> = None;
    // REQ-109：上一落库段 end（段前停顿计算基准）
    let mut last_segment_end: Option<u64> = None;
    // REQ-154（v0.7.2 S-1/S-2）：说话人停顿习惯统计（段前停顿历史 → 动态合并
    // 阈值）与上一段语速（骤变判定基准）
    let mut pause_history: std::collections::VecDeque<u64> =
        std::collections::VecDeque::with_capacity(16);
    let mut last_speech_rate: Option<f32> = None;
    let mut clipping_logged = false;
    // REQ-103：段内 RMS 聚合（语音块累计，Final 落库时取均值 → volume 列）
    let mut sentence_rms_sum: f32 = 0.0;
    let mut sentence_rms_count: u32 = 0;
    // REQ-108：上一段 volume（VolumeSurge 骤变事件判定基准）
    let mut last_segment_volume: Option<f32> = None;
    // REQ-108：连续静音块计数（长静音事件触发判定）
    let mut silent_blocks: u32 = 0;

    // 2026-08-19 取优整合：停止后 drain——停止瞬间 channel 中已送达未处理的音频块
    // 继续喂入（内容不丢；"停止时积压丢弃"兜底，会话 22 类缺失防御）。drain 有界
    // （宽限 8s，停止响应与内容完整性权衡）；队列空（Timeout）即退出。
    // H1 修复：deadline 不能在循环启动前计算——长会话（运行 >8s）停止时
    // deadline 早已过期，宽限从未生效；改为 draining 置位时才起算（Option<Instant>）
    let mut drain_deadline: Option<Instant> = None;
    let mut draining = false;
    // 2026-08 A1：暂停边沿跟踪（false→true 断句隔离；暂停期捕获线程停采，
    // channel 空 → recv_timeout 空转，无需显式消费处理）
    let mut loop_paused = ctx.pause.paused.load(Ordering::SeqCst);
    loop {
        // ── 暂停边沿（2026-08 A1）──
        // @ai-context: 时间戳 = 会话时间（epoch - 已补偿暂停时长）——暂停开始
        //              时补偿尚未累计（正确，时间轴冻结点）；恢复时补偿已更新
        //              （时间戳回到冻结点附近，时间轴无缝衔接）。
        let paused_now = ctx.pause.paused.load(Ordering::SeqCst);
        if paused_now != loop_paused {
            let now_ms = ctx.epoch.elapsed().as_millis() as u64
                - ctx.pause.total_paused_ms.load(Ordering::SeqCst);
            if paused_now {
                // 进入暂停（P2 增强：替代"喂 100ms 静音"方案——静音块不足以触发
                // sherpa 端点规则（rule1 需 2.4s 尾静音），句无法断开；flush 尾句
                // 落库 + reset 重建流才能保证暂停前后的语音不连句，恢复后干净开始）
                // REQ-154（v0.7.2 S-1）：动态合并阈值先算（借用释放后再构造 ctx）
                let merge_gap_ms = crate::asr_merge::adaptive_merge_gap(
                    pause_history.iter().copied(),
                );
                flush_tail_and_persist(
                    FinalEventCtx {
                        app: ctx.app,
                        db: ctx.db,
                        session_id: ctx.session_id,
                        asr_segments: ctx.asr_segments,
                        sentence_start_ms: &mut sentence_start_ms,
                        last_speech_ms: &mut last_speech_ms,
                        last_final_clean: &mut last_final_clean,
                        pending_merge: &mut pending_merge,
                        last_segment_end: &mut last_segment_end,
                        // REQ-154（v0.7.2 S-1/S-2）：停顿历史/动态阈值/语速基准
                        pause_history: &mut pause_history,
                        merge_gap_ms,
                        last_speech_rate: &mut last_speech_rate,
                    },
                    ctx.asr_engine,
                    now_ms,
                    &mut sentence_rms_sum,
                    &mut sentence_rms_count,
                );
                // 重建流（reset 预留给复用场景：清句音频/状态，热词重读）
                ctx.asr_engine.reset();
                // REQ-154（v0.7.2 S-2）：暂停边沿重置语速基准——恢复后首段与
                // 暂停前比较会跨暂停区间误判语速骤变（暂停时长不计入段间）
                last_speech_rate = None;
                let _ = ctx.db.add_event(&crate::session_events::NewSessionEvent::simple(
                    ctx.session_id,
                    crate::session_events::EventKind::Pause,
                    now_ms,
                ));
                let _ = ctx.app.emit("live:paused", ());
                eprintln!("[LiveSession] 会话 {} 暂停 @{}ms", ctx.session_id, now_ms);
            } else {
                let _ = ctx.db.add_event(&crate::session_events::NewSessionEvent::simple(
                    ctx.session_id,
                    crate::session_events::EventKind::Resume,
                    now_ms,
                ));
                let _ = ctx.app.emit("live:resumed", ());
                eprintln!("[LiveSession] 会话 {} 恢复 @{}ms", ctx.session_id, now_ms);
            }
            loop_paused = paused_now;
        }
        // H1 修复：deadline 在 draining 置位时才起算（见声明处注释），此处
        // 仅在已置位的情况下判定到期；None 表示尚未进入 drain 阶段
        if draining
            && drain_deadline.is_some_and(|d| Instant::now() >= d)
        {
            eprintln!("[LiveSession] 停止宽限 {}s 到期，剩余积压音频丢弃（可观测）", DRAIN_GRACE_SECS);
            break;
        }
        // ── 音频块 → 流式 ASR ──
        match rx.recv_timeout(Duration::from_millis(TICK_MS)) {
            Ok(chunk) => {
                // M4/REQ-068（S4）：原始样本落盘（预处理前——V4 两遍解码/
                // AL3 漂移实测需原始音频；写盘失败内部降级不阻断）
                if let Some(w) = ctx.audio_writer.as_mut() {
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
                // 2026-08 A2：实时电平事件（VU 表）——每音频块（200ms）推送一次，
                // 采集中"听到课程声音吗"当场可见（试听自检实时化，C2 收敛设计）
                let _ = ctx.app.emit(
                    "live:audio-level",
                    crate::live_session::AudioLevelEvent {
                        rms: raw_rms,
                        clipping: processed.clipped,
                    },
                );
                let vad_threshold = if audio_pre.config.enabled {
                    processed.speech_threshold
                } else {
                    adaptive_vad.next_threshold(raw_rms, SILENCE_RMS_THRESHOLD)
                };
                // REQ-115（v0.7.0 M2，PRE-O4）：当前阈值发布到共享槽——
                // 诊断面板可查（降级提示与切段判定口径对照；MEDIUM-8 修复：
                // 附来源会话 id 供诊断区分实时/残留）
                if let Some(slot) = ctx.vad_slot {
                    slot.publish(ctx.session_id, vad_threshold);
                }
                let silent = raw_rms < vad_threshold;
                // B3：语音活跃度共享（屏幕 worker 自适应采样依据）
                ctx.speech_active.store(!silent, Ordering::Relaxed);
                // REQ-291（v0.19.7）：媒体级"任何声音"戳（阈值低于 VAD 语音级——
                // 音乐/环境声也算；屏幕 worker 随播随停检测读取，见 media_state.rs）
                if raw_rms >= crate::media_state::MEDIA_AUDIO_ACTIVE_RMS {
                    if let Ok(mut g) = ctx.media_sound.lock() {
                        *g = Some(Instant::now());
                    }
                }
                // REQ-108（v0.7.0 M1.5）：长静音事件——连续静音 ≥3s 落库
                // （章节检测真实信号；与 analysis LONG_SILENCE_GAP_MS 同口径）
                if silent {
                    silent_blocks += 1;
                    if silent_blocks == LONG_SILENCE_EVENT_BLOCKS {
                        let _ = ctx.db.add_event(&crate::session_events::NewSessionEvent {
                            session_id: ctx.session_id,
                            kind: crate::session_events::EventKind::LongSilence,
                            timestamp_ms: chunk.timestamp_ms,
                            // 持续时长（块数 × 200ms）供消费端过滤
                            payload: serde_json::json!({
                                "duration_ms": silent_blocks as u64 * AUDIO_BLOCK_MS,
                            }),
                        });
                    }
                } else {
                    silent_blocks = 0;
                }
                // A2：句起时刻 = Final 后首个非静音块（真实句首，替代 end-2000ms 近似）；
                // TD-041：句尾 = 最后语音块 + 块时长（端点判定滞后 1.2-2.4s 的校正）
                // REQ-103：语音块 RMS 计入段聚合（音量骤变信号输入）
                if !silent {
                    if sentence_start_ms.is_none() {
                        sentence_start_ms = Some(chunk.timestamp_ms);
                    }
                    last_speech_ms = Some(chunk.timestamp_ms);
                    sentence_rms_sum += raw_rms;
                    sentence_rms_count += 1;
                }
                // M14/REQ-105：固定音命中且前置静音 → 本块按静音喂入（不进 ASR）。
                // feed(is_silent=true) 时静音块被引擎隔块喂入——不产生语音、
                // 不影响句音频累积（静音不参与端点判定），语义正确
                let decision = event_filter.observe(&processed.samples, 16000, silent);
                let feed_silent = silent || decision.should_suppress;
                let mut events = ctx.asr_engine.feed(&processed.samples, feed_silent);
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
                    if tier == crate::asr_health::AsrTier::Streaming
                        && prev != crate::asr_health::AsrTier::Streaming
                    {
                        // 恢复可见化：降级提示在前端不再残留（审查 low 项修复）
                        eprintln!("[LiveSession] ASR 已恢复主链路");
                        let _ = ctx.app.emit("live:asr-recovered", ());
                    } else {
                        let reason = crate::asr_health::tier_reason(tier);
                        if !reason.is_empty() {
                            eprintln!("[LiveSession] ASR 降级: {}", reason);
                            let _ = ctx.app.emit("live:asr-degraded", reason.to_string());
                        }
                    }
                }
                for event in events.drain(..) {
                    match event {
                        StreamingAsrEvent::Final { text, merge_with_next, confidence } => {
                            // REQ-154（v0.7.2 S-1）：动态合并阈值先算（借用释放后再构造 ctx）
                            let merge_gap_ms = crate::asr_merge::adaptive_merge_gap(
                                pause_history.iter().copied(),
                            );
                            // REQ-103：段内平均音量（语音块 RMS 均值；无语音块 → None）
                            let volume = if sentence_rms_count > 0 {
                                Some(sentence_rms_sum / sentence_rms_count as f32)
                            } else {
                                None
                            };
                            // REQ-108 补接线（审查发现：VolumeSurge/VadSegment 事件
                            // 设计文档承诺写入但未实现——现补齐）：
                            // VAD 段事件（段落级，供讲者/语速统计备数据）
                            let _ = ctx.db.add_event(&crate::session_events::NewSessionEvent {
                                session_id: ctx.session_id,
                                kind: crate::session_events::EventKind::VadSegment,
                                timestamp_ms: chunk.timestamp_ms,
                                payload: serde_json::json!({}),
                            });
                            // 音量骤变事件（与本段 volume 关联；骤变阈值 0.3 与
                            // highlight_detect VOLUME_SURGE_DELTA 同口径）
                            if let (Some(v), Some(pv)) = (volume, last_segment_volume) {
                                if (v - pv).abs() >= VOLUME_SURGE_EVENT_DELTA {
                                    let _ = ctx.db.add_event(
                                        &crate::session_events::NewSessionEvent {
                                            session_id: ctx.session_id,
                                            kind: crate::session_events::EventKind::VolumeSurge,
                                            timestamp_ms: chunk.timestamp_ms,
                                            payload: serde_json::json!({ "delta": (v - pv).abs() }),
                                        },
                                    );
                                }
                            }
                            last_segment_volume = volume;
                            sentence_rms_sum = 0.0;
                            sentence_rms_count = 0;
                            // 定稿落库/挂起合并/句子切分（live_session_persist.rs）
                            handle_final_event(
                                FinalEventCtx {
                                    app: ctx.app,
                                    db: ctx.db,
                                    session_id: ctx.session_id,
                                    asr_segments: ctx.asr_segments,
                                    sentence_start_ms: &mut sentence_start_ms,
                                    last_speech_ms: &mut last_speech_ms,
                                    last_final_clean: &mut last_final_clean,
                                    pending_merge: &mut pending_merge,
                                    last_segment_end: &mut last_segment_end,
                                    // REQ-154（v0.7.2 S-1/S-2）：停顿历史/动态阈值/语速基准
                                    pause_history: &mut pause_history,
                                    merge_gap_ms,
                                    last_speech_rate: &mut last_speech_rate,
                                },
                                text,
                                merge_with_next,
                                confidence,
                                volume,
                                chunk.timestamp_ms,
                            );
                        }
                        StreamingAsrEvent::Partial { text } => {
                            let _ = ctx.app.emit("live:asr-partial", text);
                        }
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                // 停止信号置位：先立即停捕获线程（channel 断开），再 drain 残留块
                // （P1 修复：原实现捕获线程要等循环结束才停，drain 期持续喂块使
                // 队列永不空 → 停止被拖满 8s 宽限，stop_active 5s 等待必然超时
                // detach；先断源后 drain 通常 <1s 即退出，宽限仅作理论兜底）
                if draining {
                    break;
                }
                if ctx.stop.load(Ordering::SeqCst) {
                    draining = true;
                    // H1 修复：宽限从停止瞬间起算，而非循环启动时
                    drain_deadline = Some(Instant::now() + Duration::from_secs(DRAIN_GRACE_SECS));
                    audio.stop();
                }
            }
            Err(RecvTimeoutError::Disconnected) => break, // 捕获线程退出
        }
    }

    // 停止：兜底落库挂起段 + flush 尾句——与暂停边沿共用 flush_tail_and_persist
    // （句被中断语义一致）；时间戳补偿累计暂停时长（暂停中停止也正确：
    // 暂停边沿已 flush 过，此处通常无新内容）
    let stop_now_ms = ctx.epoch.elapsed().as_millis() as u64
        - ctx.pause.total_paused_ms.load(Ordering::SeqCst);
    // REQ-154（v0.7.2 S-1）：动态合并阈值先算（借用释放后再构造 ctx）
    let merge_gap_ms = crate::asr_merge::adaptive_merge_gap(pause_history.iter().copied());
    flush_tail_and_persist(
        FinalEventCtx {
            app: ctx.app,
            db: ctx.db,
            session_id: ctx.session_id,
            asr_segments: ctx.asr_segments,
            sentence_start_ms: &mut sentence_start_ms,
            last_speech_ms: &mut last_speech_ms,
            last_final_clean: &mut last_final_clean,
            pending_merge: &mut pending_merge,
            last_segment_end: &mut last_segment_end,
            // REQ-154（v0.7.2 S-1/S-2）：停顿历史/动态阈值/语速基准
            pause_history: &mut pause_history,
            merge_gap_ms,
            last_speech_rate: &mut last_speech_rate,
        },
        ctx.asr_engine,
        stop_now_ms,
        &mut sentence_rms_sum,
        &mut sentence_rms_count,
    );
    audio.stop();

    // M4/REQ-068（S4）：结束会话——回填 WAV 长度 + 触发清理
    // （保留期 30 天 + 磁盘预算上限，删最旧；预算清理在会话结束时执行）
    if let Some(w) = ctx.audio_writer.as_mut() {
        w.finalize();
        let summary = crate::audio_store::cleanup(
            &data_dir.join("session-audio"),
            crate::audio_store::DEFAULT_RETENTION_DAYS,
            crate::audio_store::DEFAULT_DISK_BUDGET_BYTES,
        );
        if summary.deleted > 0 {
            eprintln!(
                "[AudioStore] 会话 {} 结束清理：删除 {} 个文件，释放 {} 字节",
                ctx.session_id, summary.deleted, summary.freed_bytes
            );
        }
    }

    // 5) REQ-031：finish + emit 秒回（毫秒级），融合移入后台线程——
    //    停止响应不再随段数恶化（大会话融合重算不再阻塞停止按钮）
    let _ = ctx.db.finish_session(ctx.session_id);
    let _ = ctx.app.emit("live:status", "stopped");
}
