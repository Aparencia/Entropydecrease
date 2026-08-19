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
use crate::live_session_persist::{handle_final_event, persist_final, sentence_end_ms, FinalEventCtx};
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
    pub asr_engine: &'a mut StreamingAsrEngine,
    pub audio_writer: &'a mut Option<crate::audio_store::SessionAudioWriter>,
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
    let mut adaptive_vad = crate::vad_adaptive::AdaptiveVad::new(crate::vad_adaptive::AdaptiveVadConfig {
        enabled: std::env::var("VAD_ADAPTIVE").map(|v| v != "0").unwrap_or(true),
    });
    // 句起/句尾/跨 final 去重/挂起合并状态（A2/TD-041/ADR-012 F3-2/F4-1）
    let mut sentence_start_ms: Option<u64> = None;
    let mut last_speech_ms: Option<u64> = None;
    let mut last_final_clean: Option<String> = None;
    // 末位=挂起段置信度（REQ-098：合并兜底落库时透传）
    let mut pending_merge: Option<(u64, u64, String, u32, Option<f32>)> = None;
    let mut clipping_logged = false;

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
                let vad_threshold = if audio_pre.config.enabled {
                    processed.speech_threshold
                } else {
                    adaptive_vad.next_threshold(raw_rms, SILENCE_RMS_THRESHOLD)
                };
                let silent = raw_rms < vad_threshold;
                // B3：语音活跃度共享（屏幕 worker 自适应采样依据）
                ctx.speech_active.store(!silent, Ordering::Relaxed);
                // A2：句起时刻 = Final 后首个非静音块（真实句首，替代 end-2000ms 近似）；
                // TD-041：句尾 = 最后语音块 + 块时长（端点判定滞后 1.2-2.4s 的校正）
                if !silent {
                    if sentence_start_ms.is_none() {
                        sentence_start_ms = Some(chunk.timestamp_ms);
                    }
                    last_speech_ms = Some(chunk.timestamp_ms);
                }
                let mut events = ctx.asr_engine.feed(&processed.samples, silent);
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
                                },
                                text,
                                merge_with_next,
                                confidence,
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
                // 停止信号置位：进入 drain（继续处理积压块）；积压清空后退出
                if draining {
                    break;
                }
                if ctx.stop.load(Ordering::SeqCst) {
                    draining = true;
                }
            }
            Err(RecvTimeoutError::Disconnected) => break, // 捕获线程退出
        }
    }

    // 停止：先兜底落库挂起段（F4-1——停止时无下一段可合并），再 flush 尾句
    //    （时间戳用会话纪元；句尾校正同 TD-041；跨 final 去重同主循环；
    //     置信度 REQ-098：挂起段透传、flush 尾句用重打分一致性）
    if let Some((p_start, p_end, p_text, _merges, p_conf)) = pending_merge.take() {
        persist_final(
            ctx.app,
            ctx.db,
            ctx.session_id,
            ctx.asr_segments,
            p_start,
            p_end,
            p_text,
            p_conf,
        );
    }
    if let Some(StreamingAsrEvent::Final { text, confidence, .. }) = ctx.asr_engine.flush() {
        let text = match &last_final_clean {
            Some(prev) => crate::asr_dedupe::dedupe_across_finals(prev, &text),
            None => text,
        };
        if !text.is_empty() {
            let now_ms = ctx.epoch.elapsed().as_millis() as u64;
            let end_ms = sentence_end_ms(last_speech_ms, now_ms);
            let start_ms = sentence_start_ms
                .take()
                .unwrap_or_else(|| end_ms.saturating_sub(crate::live_session_persist::SENTENCE_FALLBACK_MS));
            persist_final(
                ctx.app,
                ctx.db,
                ctx.session_id,
                ctx.asr_segments,
                start_ms,
                end_ms,
                text,
                confidence,
            );
        }
    }
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
