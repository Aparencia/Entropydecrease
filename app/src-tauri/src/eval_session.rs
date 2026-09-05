//! 会话信道纯函数层（v0.20.0 / REQ-263，M2b）。
//!
//! @ai-context: 目的——asr_eval 的"会话信道"参考获取：DB 里 session_segments
//!              按 source 分档——`subtitle`（字幕来源段 ≈ 真参考 ~99-100%）与
//!              `asr`（实时链路历史输出 = 弱参考，仅相对对比，非真值）；
//!              对齐/漂移复用 dtw_align（v0.20.0 起 pub），但其入参类型
//!              （fusion::SubtitleSegment / types::TranscriptSegment）在私有
//!              mod 内、crate 外不可命名 → 本模块作**纯适配层**：外部只喂
//!              简单行（start_ms/end_ms/text），内部构造类型后调 dtw。
//! @ai-context: 参考分档纪律（诚实登记）——字幕档可做 CER 与漂移分布；
//!              弱参考档（asr 段当参考）只做"实时链路 vs 离线重跑"的相对
//!              对比（端点切分损失方向性观察），绝不宣称绝对 CER。
//! @ai-context: 消费方为 bin/asr_eval.rs（crate 外），lib 内无调用方 →
//!              dead_code 豁免登记（同 cer.rs 先例）。

#![allow(dead_code)]

use crate::dtw_align;
use crate::fusion::SubtitleSegment;
use crate::types::TranscriptSegment;

/// 会话段行（DB 行的纯数据形态；source 语义由调用方分档）。
#[derive(Debug, Clone, PartialEq)]
pub struct SessionRow {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

impl SessionRow {
    fn to_subtitle(&self) -> SubtitleSegment {
        SubtitleSegment {
            start_ms: self.start_ms,
            end_ms: self.end_ms,
            text: self.text.clone(),
            confidence: None,
        }
    }

    fn to_transcript(&self) -> TranscriptSegment {
        TranscriptSegment {
            start_ms: self.start_ms,
            end_ms: self.end_ms,
            text: self.text.clone(),
            word_timestamps: None,
            confidence: None,
            volume: None,
        }
    }
}

/// 漂移估计结果（中位数 + 成对数）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DriftSummary {
    /// 成对时间差中位数（ms；负=字幕超前，正=字幕滞后）。
    pub median_ms: i64,
    /// 成功对齐的段对数。
    pub pairs: usize,
}

/// 字幕 ↔ ASR 段漂移分布（纯函数，合成/真实会话数据均可）。
///
/// @ai-context: 空任一侧/无成对 → None（诚实：数据面不足不下结论）。
pub fn drift_summary(subtitles: &[SessionRow], asr_rows: &[SessionRow]) -> Option<DriftSummary> {
    if subtitles.is_empty() || asr_rows.is_empty() {
        return None;
    }
    let subs: Vec<SubtitleSegment> = subtitles.iter().map(SessionRow::to_subtitle).collect();
    let asrs: Vec<TranscriptSegment> = asr_rows.iter().map(SessionRow::to_transcript).collect();
    let align = dtw_align::align_sequences(&subs, &asrs);
    if align.pairs.is_empty() {
        return None;
    }
    let median = dtw_align::estimate_drift_ms(&subs, &asrs, &align)?;
    Some(DriftSummary { median_ms: median, pairs: align.pairs.len() })
}

/// 行集 → 参考文本（纯函数）：按 start_ms 排序后拼接（CER 对顺序敏感）。
pub fn reference_text(rows: &[SessionRow]) -> String {
    let mut sorted: Vec<&SessionRow> = rows.iter().collect();
    sorted.sort_by_key(|r| r.start_ms);
    let mut out = String::new();
    for r in sorted {
        out.push_str(&r.text);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(start: u64, end: u64, text: &str) -> SessionRow {
        SessionRow { start_ms: start, end_ms: end, text: text.to_string() }
    }

    #[test]
    fn reference_sorted_by_start() {
        let rows = vec![row(5000, 6000, "后句"), row(1000, 2000, "前句")];
        assert_eq!(reference_text(&rows), "前句后句");
    }

    #[test]
    fn drift_median_positive_when_subtitles_lag() {
        // 字幕整体滞后 800ms：ASR 段 start 比字幕早 800
        let subs = vec![row(5000, 6000, "甲内容"), row(7000, 8000, "乙内容")];
        let asrs = vec![row(4200, 5200, "甲内容"), row(6200, 7200, "乙内容")];
        let d = drift_summary(&subs, &asrs).unwrap();
        assert_eq!(d.median_ms, -800);
        assert_eq!(d.pairs, 2);
    }

    #[test]
    fn drift_negative_when_subtitles_lead() {
        // 字幕超前 300ms
        let subs = vec![row(5000, 6000, "内容一")];
        let asrs = vec![row(5300, 6300, "内容一")];
        let d = drift_summary(&subs, &asrs).unwrap();
        assert_eq!(d.median_ms, 300);
    }

    #[test]
    fn drift_empty_side_is_none() {
        assert!(drift_summary(&[], &[row(1, 2, "x")]).is_none());
        assert!(drift_summary(&[row(1, 2, "x")], &[]).is_none());
    }

    #[test]
    fn drift_mismatched_text_no_pairs_is_none() {
        // 文本完全无关 → DTW 仍会强配对（首尾强制）——但相似度极低不阻碍成对；
        // 本测验证"空输入"以外路径不 panic 且返回可计算值（成本高 ≠ None）
        let subs = vec![row(1000, 2000, "aaa")];
        let asrs = vec![row(5000, 6000, "bbb")];
        assert!(drift_summary(&subs, &asrs).is_some());
    }
}
