//! 字符错误率（CER）计算（REQ-101 PRE-O1 / v0.7.0 M1）。
//!
//! @ai-context: 音频预处理链（AGC/动态阈值）的默认值定标依据——S4 落盘音频
//!              分别以"预处理开/关"转写，与参考文本比对 CER：CER 更低者胜。
//!              CER = 编辑距离 / 参考文本字符数（去标点空白——与 asr_rescore
//!              strip_punct 同口径：标点差异不计入错误，聚焦内容准确性）。
//! @ai-context: 纯函数无 IO（可单测）；编辑距离复用 asr_rescore::levenshtein
//!              （DP 按字符，已有单测覆盖）。
//! @ai-context: 消费方为 bin/cer_bench.rs（crate 外）——lib 内无调用方，
//!              dead_code 豁免登记（基准工具是 REQ-101 验收的一部分）。

// 消费方在 bin（cer_bench.rs），lib 内无调用方
#![allow(dead_code)]

use crate::asr_rescore::strip_punct;

/// CER 计算（纯函数）：编辑距离 / 参考字符数。
///
/// @ai-context: 返回 0.0~1.0+（插入错误可使 CER >1，如实反映退化）；参考文本
///              为空 → None（无法计算——诚实表达，不返回假 0）。
pub fn cer(reference: &str, hypothesis: &str) -> Option<f32> {
    let ref_chars: Vec<char> = strip_punct(reference);
    let hyp_chars: Vec<char> = strip_punct(hypothesis);
    if ref_chars.is_empty() {
        return None;
    }
    let dist = crate::asr_rescore::levenshtein(
        &ref_chars.iter().collect::<String>(),
        &hyp_chars.iter().collect::<String>(),
    );
    Some(dist as f32 / ref_chars.len() as f32)
}

/// 两组 CER 对比（基准主入口）：返回 (开预处理 CER, 关预处理 CER)。
///
/// @ai-context: 基准脚本/测试共用；None=该组无法计算（参考文本空），
///              对比时视为"不可比"（调用方决定跳过或告警）。
pub fn cer_comparison(
    reference: &str,
    preproc_on: &str,
    preproc_off: &str,
) -> (Option<f32>, Option<f32>) {
    (cer(reference, preproc_on), cer(reference, preproc_off))
}

/// 判定预处理是否值得开启（纯函数）：开 < 关 - 容差则推荐开。
///
/// @ai-context: CER_DELTA_TOLERANCE 容差防"1 字符差异"噪声翻转默认值；
///              任一侧 None（不可比）→ 不推荐变更（保持现状，诚实）。
pub fn recommend_preproc(preproc_on: Option<f32>, preproc_off: Option<f32>) -> bool {
    const CER_DELTA_TOLERANCE: f32 = 0.01;
    match (preproc_on, preproc_off) {
        (Some(on), Some(off)) => on < off - CER_DELTA_TOLERANCE,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── CER 基础 ──

    #[test]
    fn cer_identical_is_zero() {
        assert_eq!(cer("今天讲熵减的概念", "今天讲熵减的概念"), Some(0.0));
    }

    #[test]
    fn cer_single_substitution() {
        // 1 字替换 / 8 字参考 ≈ 0.125
        let c = cer("今天讲熵减的概念", "今天讲熵增的概念").unwrap();
        assert!((c - 1.0 / 8.0).abs() < 0.01, "got {}", c);
    }

    #[test]
    fn cer_empty_reference_is_none() {
        // 参考文本空 → 无法计算（诚实 None，不返回假 0）
        assert_eq!(cer("", "有内容"), None);
        assert_eq!(cer("  ", "有内容"), None);
    }

    #[test]
    fn cer_punctuation_ignored() {
        // 标点差异不计入错误（与 strip_punct 同口径）
        assert_eq!(cer("熵减的概念。", "熵减的概念"), Some(0.0));
    }

    #[test]
    fn cer_worse_than_one_possible() {
        // 插入错误使 CER > 1（参考 2 字、假设 6 字 → 距离 4 → CER 2.0）
        let c = cer("结果", "结果一二三四").unwrap();
        assert!(c > 1.0, "got {}", c);
    }

    // ── 对比与推荐 ──

    #[test]
    fn comparison_on_better_recommends_enable() {
        let (on, off) = cer_comparison("参考文本内容", "参考文本内容", "参考文本内容错");
        assert!(recommend_preproc(on, off), "开预处理 CER 更低应推荐开");
    }

    #[test]
    fn comparison_off_better_keeps_disabled() {
        let (on, off) = cer_comparison("参考文本内容", "参考文本内容错", "参考文本内容");
        assert!(!recommend_preproc(on, off), "关预处理更好应保持关");
    }

    #[test]
    fn comparison_tiny_delta_no_flip() {
        // 1 字符差异在容差内 → 不翻转默认（防噪声决策）
        let (on, off) = cer_comparison("参考文本内容", "参考文本内空", "参考文本内容");
        assert!(!recommend_preproc(on, off));
    }

    #[test]
    fn comparison_unknown_side_keeps_status_quo() {
        // 任一侧 None（参考空/不可比）→ 不推荐变更
        assert!(!recommend_preproc(Some(0.1), None));
        assert!(!recommend_preproc(None, Some(0.1)));
        assert!(!recommend_preproc(None, None));
    }
}
