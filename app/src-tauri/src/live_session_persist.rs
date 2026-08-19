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
pub(crate) fn digest_merged(
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
