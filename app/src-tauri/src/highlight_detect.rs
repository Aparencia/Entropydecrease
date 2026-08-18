//! 重点候选标注（REQ-045 / v0.5.0 M2，头脑风暴 C2）。
//!
//! @ai-context: 口播/网课/实操档案支撑——三信号产出重点候选：
//!              ① 重复短语 ≥2 次（讲者强调）；② 音量骤变（DSP 特征，情绪/强调）；
//!              ③ OCR 文本持续停留 N 帧（画面要点，讲者认为重要）。
//! @ai-context: 纯函数可单测；输入为时间有序的段/块序列，输出重点候选列表
//!              （含命中信号计数与原因，供产物层 M7 排序渲染）。

/// 单条转写段输入（由 SessionDetail.segments 聚合）。
#[derive(Debug, Clone, PartialEq)]
pub struct SegmentInput {
    pub start_ms: u64,
    pub text: String,
    /// 段内平均音量（0.0-1.0；None=未知，不参与音量骤变信号）
    pub volume: Option<f32>,
}

/// 单个 OCR 块输入（由 SessionDetail.ocr_blocks 聚合；region=full 的画面要点）。
#[derive(Debug, Clone, PartialEq)]
pub struct OcrBlockInput {
    pub timestamp_ms: u64,
    pub text: String,
}

/// 重点候选。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct HighlightCandidate {
    /// 重点时刻（ms；重复短语/音量取段起点，OCR 停留取块时刻）
    pub time_ms: u64,
    /// 候选文本
    pub text: String,
    /// 命中信号数（1=单信号，2=双信号）
    pub signals: u32,
    /// 原因描述（产物层展示："重复强调/音量骤变/画面停留"）
    pub reasons: Vec<String>,
}

/// 重复短语判定：跨段出现 ≥ 该次数视为强调（含自身，即 ≥2 次出现）。
const REPEAT_MIN_OCCURRENCES: usize = 2;
/// OCR 停留判定：同一文本块持续 ≥ 该毫秒数（约 10s，讲者停留讲解）。
const OCR_HOLD_MS: u64 = 10_000;
/// 音量骤变判定：相邻段音量差 ≥ 该阈值（0.3 ≈ 6dB 级变化）。
const VOLUME_SURGE_DELTA: f32 = 0.3;

/// 重点候选检测（纯函数）：三信号独立检测后合并（按时间排序）。
///
/// @ai-context: 重复短语：对全部段文本做短语频率统计（2-4 字滑窗，同 vocab 思路），
///              出现 ≥REPEAT_MIN_OCCURRENCES 的短语所在段 → 重点（双信号可叠加）。
/// @ai-context: 音量骤变：相邻段 volume 差 ≥ 阈值（None 跳过；首段无前驱不判定）。
/// @ai-context: OCR 停留：同文本块首尾时间差 ≥ OCR_HOLD_MS → 重点（画面要点停留）。
pub fn detect_highlights(
    segments: &[SegmentInput],
    ocr_blocks: &[OcrBlockInput],
) -> Vec<HighlightCandidate> {
    let mut candidates: Vec<HighlightCandidate> = Vec::new();

    // ① 重复短语 → 段级重点
    let repeated = repeated_phrases(segments);
    for seg in segments {
        let mut reasons = Vec::new();
        if repeated.iter().any(|p| seg.text.contains(p.as_str())) {
            reasons.push("重复强调".to_string());
        }
        if !reasons.is_empty() {
            candidates.push(HighlightCandidate {
                time_ms: seg.start_ms,
                text: seg.text.clone(),
                signals: 1,
                reasons,
            });
        }
    }

    // ② 音量骤变 → 段级重点（与重复信号合并同一段）
    for (i, seg) in segments.iter().enumerate() {
        let Some(v) = seg.volume else { continue };
        if i == 0 {
            continue;
        }
        let Some(prev_v) = segments[i - 1].volume else { continue };
        if (v - prev_v).abs() >= VOLUME_SURGE_DELTA {
            merge_or_push(
                &mut candidates,
                seg.start_ms,
                seg.text.clone(),
                "音量骤变".to_string(),
            );
        }
    }

    // ③ OCR 停留 → 块级重点（首尾时间差 ≥ 阈值）
    let mut ocr_ranges: Vec<(&str, u64, u64)> = Vec::new();
    for block in ocr_blocks {
        let text = block.text.trim();
        if text.is_empty() {
            continue;
        }
        if let Some(entry) = ocr_ranges.iter_mut().find(|(t, _, _)| *t == text) {
            entry.2 = block.timestamp_ms;
        } else {
            ocr_ranges.push((text, block.timestamp_ms, block.timestamp_ms));
        }
    }
    for (text, first_ms, last_ms) in ocr_ranges {
        if last_ms.saturating_sub(first_ms) >= OCR_HOLD_MS {
            merge_or_push(&mut candidates, first_ms, text.to_string(), "画面停留".to_string());
        }
    }

    candidates.sort_by_key(|c| c.time_ms);
    candidates
}

/// 统计重复短语（2-4 字滑窗，跨段出现 ≥2 次）。
fn repeated_phrases(segments: &[SegmentInput]) -> Vec<String> {
    let mut freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for seg in segments {
        let chars: Vec<char> = seg.text.chars().collect();
        for len in 2..=4 {
            if chars.len() < len {
                break;
            }
            for start in 0..=(chars.len() - len) {
                let p: String = chars[start..start + len].iter().collect();
                *freq.entry(p).or_insert(0) += 1;
            }
        }
    }
    let mut out: Vec<String> = freq
        .into_iter()
        .filter(|(_, n)| *n >= REPEAT_MIN_OCCURRENCES)
        .map(|(p, _)| p)
        .collect();
    // 确定性排序（HashMap 迭代序随机）：先长后短再字典序
    out.sort_by_key(|p| (std::cmp::Reverse(p.chars().count()), p.clone()));
    out
}

/// 合并候选：同时间戳已存在 → 追加信号与原因（多信号叠加）；否则新建。
fn merge_or_push(
    candidates: &mut Vec<HighlightCandidate>,
    time_ms: u64,
    text: String,
    reason: String,
) {
    if let Some(c) = candidates.iter_mut().find(|c| c.time_ms == time_ms) {
        if !c.reasons.contains(&reason) {
            c.reasons.push(reason);
            c.signals = c.reasons.len() as u32;
        }
        return;
    }
    candidates.push(HighlightCandidate {
        time_ms,
        text,
        signals: 1,
        reasons: vec![reason],
    });
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "highlight_detect_tests.rs"]
mod tests;
