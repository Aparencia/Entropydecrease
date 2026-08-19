//! 实时会话定稿落库域（v0.7.0 M0 X-O5 行数拆分：live_session.rs 798 行超限硬拆）。
//!
//! @ai-context: 定稿段推送 + 落库（persist_final）与合并文本消化（digest_merged）
//!              三处一致性落库（事件/session_segments/asr_segments），避免 ADR-012
//!              F4-1 挂起/合并引入的多出口不一致；句尾校正（sentence_end_ms）为
//!              端点判定滞后（1.2-2.4s）的 TD-041 修复。

use tauri::Emitter;

use crate::db::Db;
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
        confidence,
        volume,
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
) -> Option<(String, u64)> {
    let (complete, rest) = crate::asr_merge::split_sentences(text);
    let mut counts: Vec<usize> = complete.iter().map(|s| s.chars().count()).collect();
    counts.push(rest.chars().count());
    let spans = crate::asr_merge::split_timestamps(start_ms, end_ms, &counts);
    for (i, s) in complete.iter().enumerate() {
        let (s_ms, e_ms) = spans[i];
        persist_final(app, db, session_id, asr_segments, s_ms, e_ms, s.clone(), None, volume);
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
    let text = match ctx.last_final_clean.as_ref() {
        Some(prev) => crate::asr_dedupe::dedupe_across_finals(prev, &text),
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
                if let Some(merged) = crate::asr_merge::merge_segments(&p_text, &text, gap) {
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
            );
        }
        // 新挂起段：保留本事件置信度/音量（后续合并/兜底落库时透传）
        *ctx.pending_merge = Some((start_ms, end_ms, text, 0, confidence, volume));
        return;
    }
    // 先消化挂起段：gap 内合并为完整句；否则兜底独立落库
    if let Some((p_start, p_end, p_text, _merges, p_conf, p_vol)) = ctx.pending_merge.take() {
        let gap = start_ms.saturating_sub(p_end);
        if let Some(merged) = crate::asr_merge::merge_segments(&p_text, &text, gap) {
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
            ) {
                // 合并切分后的残余置信度/音量无法归因 → None（诚实）
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
                );
            }
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
        );
    }
    // 正常段：定稿推送 + 落库（TD-043 时间戳载荷；REQ-098 透传事件置信度/音量）
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
    );
}
