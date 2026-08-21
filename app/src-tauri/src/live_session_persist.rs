//! 实时会话定稿落库域（v0.7.0 M0 X-O5 行数拆分：live_session.rs 798 行超限硬拆）。
//!
//! @ai-context: 定稿段推送 + 落库（persist_final）与合并文本消化（digest_merged）
//!              三处一致性落库（事件/session_segments/asr_segments），避免 ADR-012
//!              F4-1 挂起/合并引入的多出口不一致；句尾校正（sentence_end_ms）为
//!              端点判定滞后（1.2-2.4s）的 TD-041 修复。

use tauri::Emitter;

use crate::db::Db;
use crate::streaming_asr::{StreamingAsrEngine, StreamingAsrEvent};
use crate::types::{NewSessionSegment, TranscriptSegment};

/// ASR 段 start_ms 兜底近似（句首时刻缺失时：end - 2000ms）。
pub(crate) const SENTENCE_FALLBACK_MS: u64 = 2000;
/// 音频块时长（ms）——与 audio_loopback 的 200ms 定长块对齐（TD-041 句尾校正用）。
const AUDIO_BLOCK_MS: u64 = 200;
/// 链式合并兜底上限（ADR-012 F4-1，merge-then-split 方案）。
///
/// @ai-context: 正常路径由"合并后句子切分"消化（合并文本内完整句即时落库
///              推送，残余继续挂起），上限仅兜底模型长期无句号的极端场景
///              （重打分与标点恢复均未给出句号）——防挂起文本无限增长。
const MAX_MERGE_CHAIN: u32 = 4;

/// 段前停顿历史容量（REQ-154 S-1：说话人停顿习惯统计窗口——最近 16 段
/// ≈ 2-4 分钟讲话，足够反映习惯且对语速变化响应及时）。
const PAUSE_HISTORY_MAX: usize = 16;

/// 句尾时刻（TD-041）：最后语音块起点 + 块时长，逼近真实句尾。
///
/// @ai-context: 端点判定基于尾静音（rule1 2.4s / rule2 1.2s），Final 事件晚于实际
///              句尾 1.2-2.4s——此前 end_ms 系统性拉大融合重叠区（重叠归属字幕，
///              规则 3 消化但 ASR 补缝位置被挤压）；无语音记录时回退当前时刻。
pub(crate) fn sentence_end_ms(last_speech_ms: Option<u64>, fallback_ms: u64) -> u64 {
    last_speech_ms.map(|t| t + AUDIO_BLOCK_MS).unwrap_or(fallback_ms)
}

/// 语音定稿事件载荷（TD-043：携带后端会话纪元时间戳，前端显示与时间轴一致）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AsrFinalEvent {
    pub timestamp_ms: u64,
    pub text: String,
}

/// 定稿段推送 + 落库（正常段/挂起段兜底/合并段共用——ADR-012 F4-1）。
///
/// @ai-context: 事件、session_segments、asr_segments（融合输入）三处一致落库，
///              避免 F4-1 挂起/合并引入的多出口不一致（与 R7 预览落库一致性同构）。
/// @ai-context: REQ-098（v0.7.0 M1）：confidence 为重打分一致性置信度（Option——
///              None=无法产出，诚实表达未知；不再硬编码 0.9/0.8 假数据）。
/// @ai-context: REQ-103（v0.7.0 M1）：volume=段内平均音量（实时链路按段聚合 RMS
///              传入；None=未知/非 ASR 源）。
/// @ai-context: 参数多为编排上下文传递（app/db/session_id/segments/时间戳/文本/
///              置信度），聚合会破坏内聚——登记 clippy 豁免（与 engine.rs 同模式）。
/// @ai-context: REQ-154（v0.7.2 S-2）：last_speech_rate=上一段语速（骤变判定基准，
///              调用方持状态跨段传递；None=尚无基准——首段不判定）。
#[allow(clippy::too_many_arguments)]
pub(crate) fn persist_final(
    app: &tauri::AppHandle,
    db: &Db,
    session_id: i64,
    asr_segments: &mut Vec<TranscriptSegment>,
    start_ms: u64,
    end_ms: u64,
    text: String,
    confidence: Option<f32>,
    volume: Option<f32>,
    pause_ms: Option<u64>,
    last_speech_rate: &mut Option<f32>,
) {
    // REQ-109：段内语速 = 字符数 / 段时长（字/秒；防除零——时长 0 时 None）
    let duration_secs = end_ms.saturating_sub(start_ms) as f32 / 1000.0;
    let speech_rate = if duration_secs > 0.0 {
        Some(text.chars().count() as f32 / duration_secs)
    } else {
        None
    };
    // REQ-154（v0.7.2 S-2）：语速骤变事件——段间语速骤降 ≥40% = 强调/变速
    // （讲慢 = 重点；与 VolumeSurge 音量骤变姊妹信号，重点标注备数据；与
    // is_speech_rate_drop 纯函数同口径，落库仅记录不阻断）
    if let (Some(cur), Some(prev)) = (speech_rate, *last_speech_rate) {
        if crate::asr_merge::is_speech_rate_drop(prev, cur) {
            let ratio = ((prev - cur) / prev * 100.0).round() / 100.0;
            let _ = db.add_event(&crate::session_events::NewSessionEvent {
                session_id,
                kind: crate::session_events::EventKind::SpeechRateDrop,
                timestamp_ms: start_ms,
                payload: serde_json::json!({ "ratio": ratio }),
            });
        }
    }
    if let Some(r) = speech_rate {
        *last_speech_rate = Some(r);
    }
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
        confidence,
        volume,
        speech_rate,
        pause_ms,
        // REQ-109：speaker 影子列（V1.0 讲者接线前恒 None）
        speaker: None,
    });
    asr_segments.push(TranscriptSegment {
        start_ms,
        end_ms,
        text,
        // 流式链路词级时间戳：B8 由离线/精修路径产出（None）
        word_timestamps: None,
        // REQ-062：融合概率加权输入（与落库 confidence 同源）
        confidence,
        // REQ-103：段音量（融合透传；音量骤变信号输入）
        volume,
    });
}

/// 合并文本消化：句子切分 + 比例时间戳落库推送；返回残余（含其起点）。
///
/// @ai-context: F4-1 增强（merge-then-split）：合并文本按段内真实句号切分——
///              完整句逐句落库推送（句子级粒度，边界不切碎句子）；无句号的
///              尾部残余返回给调用方（硬切上下文继续挂起，正常句上下文落库）。
///              时间戳按字符比例近似（流式链路无词级时间戳，语速均匀假设；
///              单调不重叠，融合对齐可接受）。
/// @ai-context: REQ-098（v0.7.0 M1）：切分出的子句置信度 None——合并文本跨
///              多个 Final，单句置信度无法归因（诚实表达未知，不硬编码假值）。
/// @ai-context: 参数 8 个为编排上下文传递（与 persist_final 同模式，登记豁免）。
/// @ai-context: REQ-154（v0.7.2 S-2）：last_speech_rate 透传给 persist_final
///              （切分子句同样参与骤变判定——段粒度语速）。
#[allow(clippy::too_many_arguments)]
pub(crate) fn digest_merged(
    app: &tauri::AppHandle,
    db: &Db,
    session_id: i64,
    asr_segments: &mut Vec<TranscriptSegment>,
    start_ms: u64,
    end_ms: u64,
    text: &str,
    volume: Option<f32>,
    last_speech_rate: &mut Option<f32>,
) -> Option<(String, u64)> {
    let (complete, rest) = crate::asr_merge::split_sentences(text);
    let mut counts: Vec<usize> = complete.iter().map(|s| s.chars().count()).collect();
    counts.push(rest.chars().count());
    let spans = crate::asr_merge::split_timestamps(start_ms, end_ms, &counts);
    for (i, s) in complete.iter().enumerate() {
        let (s_ms, e_ms) = spans[i];
        persist_final(
            app,
            db,
            session_id,
            asr_segments,
            s_ms,
            e_ms,
            s.clone(),
            None,
            volume,
            None,
            last_speech_rate,
        );
    }
    if rest.trim().is_empty() {
        None
    } else {
        // 残余起点 = 完整句之后的占比位置（时间戳连续衔接）
        let rest_start = spans.last().map(|(s, _)| *s).unwrap_or(start_ms);
        Some((rest, rest_start))
    }
}

/// 挂起合并段（ADR-012 F4-1）：起点/终点/文本/已合并次数/置信度/音量。
///
/// @ai-context: 元组过长（6 元）拆 type alias——REQ-098/103 追加置信度/音量后
///              从 4 元增长，clippy type_complexity 提示。
pub(crate) type PendingMerge = (u64, u64, String, u32, Option<f32>, Option<f32>);

/// Final 事件处理上下文（run_audio_loop 拆出——编排状态与落库域解耦）。
pub(crate) struct FinalEventCtx<'a> {
    pub app: &'a tauri::AppHandle,
    pub db: &'a Db,
    pub session_id: i64,
    pub asr_segments: &'a mut Vec<TranscriptSegment>,
    /// 句起时刻（A2：Final 后首个非静音块）
    pub sentence_start_ms: &'a mut Option<u64>,
    /// 句尾时刻（TD-041：最后语音块）
    pub last_speech_ms: &'a mut Option<u64>,
    /// 跨 final 去重（ADR-012 F3-2）
    pub last_final_clean: &'a mut Option<String>,
    /// rule3 硬切段挂起合并（ADR-012 F4-1；末两位=挂起段置信度/音量，REQ-098/103）
    pub pending_merge: &'a mut Option<PendingMerge>,
    /// 上一落库段 end（REQ-109：段前停顿 = start - prev_end）
    pub last_segment_end: &'a mut Option<u64>,
    /// REQ-154（v0.7.2 S-1）：段前停顿历史（说话人停顿习惯统计窗口；
    /// 容量 PAUSE_HISTORY_MAX，FIFO）
    pub pause_history: &'a mut std::collections::VecDeque<u64>,
    /// REQ-154（v0.7.2 S-1）：动态合并阈值（adaptive_merge_gap 产出，
    /// 本次 Final 处理生效；机关枪说话人收紧防挂起失控，慢速说话人放宽防切碎）
    pub merge_gap_ms: u64,
    /// REQ-154（v0.7.2 S-2）：上一段语速（骤变判定基准，跨段状态）
    pub last_speech_rate: &'a mut Option<f32>,
}

/// Final 事件处理：跨 final 去重 → 挂起合并（链式）→ 句子切分落库。
///
/// @ai-context: ADR-012 F3-2 跨 final 重叠去重（rule3 硬切/端点误断句的句尾词
///              重复防护）；F4-1 merge-then-split：硬切段挂起与下一 Final 语义
///              合并（gap ≤600ms），合并后按句号切分即时落库，无句号残余继续
///              挂起（半句不丢、不提前切断）；MAX_MERGE_CHAIN 防整段合一。
/// @ai-context: REQ-098（v0.7.0 M1）：confidence 为重打分一致性置信度——
///              合并切分出的子句无法归因单句置信度 → None（诚实）；未合并
///              段透传事件置信度。
/// @ai-context: now_ms=当前音频块时刻（句尾校正回退基准）。
pub(crate) fn handle_final_event(
    ctx: FinalEventCtx<'_>,
    text: String,
    merge_with_next: bool,
    confidence: Option<f32>,
    volume: Option<f32>,
    now_ms: u64,
) {
    // ADR-012 F3-2：跨 final 重叠去重（rule3 硬切/端点误断句
    // 的句尾词重复防护）；整体重复 → 跳过推送与落库
    // REQ-118（v0.7.0 M2）：归一化+短语级 Jaccard 升级版（标点差异/虚词鲁棒）
    let text = match ctx.last_final_clean.as_ref() {
        Some(prev) => crate::asr_dedupe::dedupe_across_finals_normalized(prev, &text),
        None => text,
    };
    if text.is_empty() {
        return;
    }
    *ctx.last_final_clean = Some(text.clone());
    let end_ms = sentence_end_ms(*ctx.last_speech_ms, now_ms);
    let start_ms = ctx
        .sentence_start_ms
        .take()
        .unwrap_or_else(|| end_ms.saturating_sub(SENTENCE_FALLBACK_MS));
    // REQ-109：段前停顿 = 与上一落库段 end 的 gap（首段 None）
    let pause_ms = ctx.last_segment_end.map(|pe| start_ms.saturating_sub(pe));
    // REQ-154（v0.7.2 S-1）：段前停顿入统计窗口（说话人停顿习惯；
    // FIFO 容量上限——最新习惯优先）
    if let Some(p) = pause_ms {
        ctx.pause_history.push_back(p);
        if ctx.pause_history.len() > PAUSE_HISTORY_MAX {
            ctx.pause_history.pop_front();
        }
    }
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
        if let Some((p_start, p_end, p_text, merges, p_conf, p_vol)) = ctx.pending_merge.take() {
            let gap = start_ms.saturating_sub(p_end);
            if merges < MAX_MERGE_CHAIN {
                // REQ-119（v0.7.0 M2）：拼接边界空格（中英混排不粘连）
                // REQ-154（v0.7.2 S-1）：合并阈值随说话人停顿习惯自适应
                if let Some(merged) = crate::asr_merge::merge_segments_with_spacing_adaptive(
                    &p_text,
                    &text,
                    gap,
                    ctx.merge_gap_ms,
                ) {
                    *ctx.last_final_clean = Some(merged.clone());
                    match digest_merged(
                        ctx.app,
                        ctx.db,
                        ctx.session_id,
                        ctx.asr_segments,
                        p_start,
                        end_ms,
                        &merged,
                        p_vol,
                        ctx.last_speech_rate,
                    ) {
                        Some((rest, rest_start)) => {
                            // 残余半句继续挂起（链式延续；切分后置信度/音量无法归因 → None）
                            *ctx.pending_merge =
                                Some((rest_start, end_ms, rest, merges + 1, None, None));
                        }
                        None => {
                            // 整段以句号结尾全部切出：挂起清空
                        }
                    }
                    return;
                }
            }
            // 合并失败（gap 超限）或已达兜底上限：落库旧挂起段（置信度/音量保留）
            persist_final(
                ctx.app,
                ctx.db,
                ctx.session_id,
                ctx.asr_segments,
                p_start,
                p_end,
                p_text,
                p_conf,
                p_vol,
                None,
                ctx.last_speech_rate,
            );
        }
        // 新挂起段：保留本事件置信度/音量（后续合并/兜底落库时透传）
        *ctx.pending_merge = Some((start_ms, end_ms, text, 0, confidence, volume));
        return;
    }
    // 先消化挂起段：gap 内合并为完整句；否则兜底独立落库
    if let Some((p_start, p_end, p_text, _merges, p_conf, p_vol)) = ctx.pending_merge.take() {
        let gap = start_ms.saturating_sub(p_end);
        // REQ-119：拼接边界空格（中英混排不粘连）
        // REQ-154（v0.7.2 S-1）：合并阈值随说话人停顿习惯自适应
        if let Some(merged) = crate::asr_merge::merge_segments_with_spacing_adaptive(
            &p_text,
            &text,
            gap,
            ctx.merge_gap_ms,
        ) {
            *ctx.last_final_clean = Some(merged.clone());
            // 合并文本同样按句子切分落库（可能含多句）；
            // 残余是当前句尾部（其后为真实停顿，不再挂起
            // 合并）——残余直接落库为最后一段，内容不丢
            if let Some((rest, rest_start)) = digest_merged(
                ctx.app,
                ctx.db,
                ctx.session_id,
                ctx.asr_segments,
                p_start,
                end_ms,
                &merged,
                p_vol,
                ctx.last_speech_rate,
            ) {
                // 合并切分后的残余置信度/音量/停顿无法归因 → None（诚实）
                persist_final(
                    ctx.app,
                    ctx.db,
                    ctx.session_id,
                    ctx.asr_segments,
                    rest_start,
                    end_ms,
                    rest,
                    None,
                    None,
                    None,
                    ctx.last_speech_rate,
                );
            }
            // 合并段整体已落库 → 更新上一段 end（停顿基准）
            *ctx.last_segment_end = Some(end_ms);
            return;
        }
        persist_final(
            ctx.app,
            ctx.db,
            ctx.session_id,
            ctx.asr_segments,
            p_start,
            p_end,
            p_text,
            p_conf,
            p_vol,
            None,
            ctx.last_speech_rate,
        );
        // 挂起段兜底落库 → 更新上一段 end
        *ctx.last_segment_end = Some(p_end);
    }
    // 正常段：定稿推送 + 落库（TD-043 时间戳载荷；REQ-098 透传事件置信度/音量；
    // REQ-109 透传段前停顿）
    persist_final(
        ctx.app,
        ctx.db,
        ctx.session_id,
        ctx.asr_segments,
        start_ms,
        end_ms,
        text,
        confidence,
        volume,
        pause_ms,
        ctx.last_speech_rate,
    );
    // 正常段已落库 → 更新上一段 end（停顿基准）
    *ctx.last_segment_end = Some(end_ms);
}

/// 停止/暂停时的尾句 flush 落库（P2：暂停上升沿与停止路径共用，行为一致）。
///
/// @ai-context: 先兜底落库挂起段（F4-1——中断时无下一段可合并，半句不丢），
///              再 flush 尾句（F1-2 重打分兜底；时间戳用调用方注入的
///              now_ms——暂停/停止时须为补偿后会话时刻，与音频/屏幕同口径；
///              句尾校正同 TD-041；跨 final 去重同主循环；置信度/音量
///              REQ-098/103：挂起段透传、flush 尾句用重打分一致性+段 RMS）。
/// @ai-context: 两处语义一致（句被"中断"）——单一实现防漂移；返回是否
///              落库了内容（当前调用方未消费——保留供诊断/单测断言，
///              不引入 must_use 以免无谓告警）。
/// @ai-context: 参数为编排上下文传递（与 persist_final 同模式，登记豁免）。
#[allow(clippy::too_many_arguments)]
pub(crate) fn flush_tail_and_persist(
    ctx: FinalEventCtx<'_>,
    asr_engine: &mut StreamingAsrEngine,
    now_ms: u64,
    sentence_rms_sum: &mut f32,
    sentence_rms_count: &mut u32,
) -> bool {
    let mut any = false;
    // 先兜底落库挂起段（F4-1：中断时无下一段可合并——半句不丢）
    if let Some((p_start, p_end, p_text, _merges, p_conf, p_vol)) = ctx.pending_merge.take() {
        persist_final(
            ctx.app,
            ctx.db,
            ctx.session_id,
            ctx.asr_segments,
            p_start,
            p_end,
            p_text,
            p_conf,
            p_vol,
            // 中断兜底落库：段前停顿无基准（None——诚实未知）
            None,
            ctx.last_speech_rate,
        );
        any = true;
    }
    // flush 尾句（ADR-012 F1-2 重打分兜底；REQ-118 跨 final 去重）
    if let Some(StreamingAsrEvent::Final { text, confidence, .. }) = asr_engine.flush() {
        let text = match ctx.last_final_clean.as_ref() {
            Some(prev) => crate::asr_dedupe::dedupe_across_finals_normalized(prev, &text),
            None => text,
        };
        if !text.is_empty() {
            let end_ms = sentence_end_ms(*ctx.last_speech_ms, now_ms);
            let start_ms = ctx
                .sentence_start_ms
                .take()
                .unwrap_or_else(|| end_ms.saturating_sub(SENTENCE_FALLBACK_MS));
            let volume = if *sentence_rms_count > 0 {
                Some(*sentence_rms_sum / *sentence_rms_count as f32)
            } else {
                None
            };
            // REQ-109：尾句段前停顿 = 与上一落库段的 gap
            let pause_ms = ctx.last_segment_end.map(|pe| start_ms.saturating_sub(pe));
            persist_final(
                ctx.app,
                ctx.db,
                ctx.session_id,
                ctx.asr_segments,
                start_ms,
                end_ms,
                text,
                confidence,
                volume,
                pause_ms,
                ctx.last_speech_rate,
            );
            // 尾句已落库 → 更新上一段 end（暂停恢复后下一句的停顿基准正确）
            *ctx.last_segment_end = Some(end_ms);
            any = true;
        }
    }
    *sentence_rms_sum = 0.0;
    *sentence_rms_count = 0;
    any
}
