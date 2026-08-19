//! 语义级合并（ADR-012 F4-1）：rule3 硬切段的延迟合并决策，纯函数可单测。
//!
//! @ai-context: rule3 强制端点（最长句 8s）会把完整句子切在两段之间——文本不丢
//!              但切碎（"不该断时断了"，取证 13.wav 一半段被 5s 规则硬切）。
//!              引擎已按"端点前连续静音 < 1.2s"标记硬切段（merge_with_next），
//!              编排层在下一 Final 到来时调用本模块决定是否合并。
//! @ai-context: 合并信号 = 句间时间间隔（硬切 gap≈0-0.4s；正常句间因尾静音端点
//!              判定滞后 gap≥1.2s，判别干净）+ 尾首重叠（防句间误并的重复词）。
//!              拼接时 prev 去尾部标点、next 去头部标点（硬切在句中，衔接自然；
//!              误并时丢失的标点由课后精修/标点恢复补回）。

use crate::asr_rescore::strip_punct;

/// 合并时间门限（ms）：句间间隔 ≤ 该值视为硬切连续句（正常句间 ≥1.2s 尾静音）。
const MERGE_GAP_MS: u64 = 600;

/// 参与跳过的最小尾首重叠（字，≥2 防单字巧合）。
const MIN_OVERLAP_CHARS: usize = 2;

/// 句尾/句首标点集合（拼接时去除；逗号也去——硬切后继续的短语不应带前导逗号）。
const BOUNDARY_PUNCT: &str = "。！？，、；：…,.!?;:";

/// 语义级合并：prev（挂起硬切段）与 next（后续段）是否/如何合并为一句。
///
/// @ai-context: 返回合并后的完整文本；gap 超门限或输入为空 → None（不合并）。
///              尾首重叠 ≥2 字先跳过（next 头部与前段尾部重复的词去掉）。
pub fn merge_segments(prev: &str, next: &str, gap_ms: u64) -> Option<String> {
    if gap_ms > MERGE_GAP_MS {
        return None;
    }
    let p: Vec<char> = strip_punct(prev);
    let n: Vec<char> = strip_punct(next);
    if p.is_empty() || n.is_empty() {
        return None;
    }
    // 尾首重叠（strip 后序列，最长优先）：硬切无重叠（k=0），句间误并时去重
    let mut skip = 0usize;
    for cand in (MIN_OVERLAP_CHARS..=p.len().min(n.len())).rev() {
        if p[p.len() - cand..] == n[..cand] {
            skip = cand;
            break;
        }
    }
    // prev 去尾部标点/空白
    let prev_trim = prev.trim_end_matches(|c: char| c.is_whitespace() || BOUNDARY_PUNCT.contains(c));
    // next 跳过前 skip 个非标点字符（重叠部分），再去头部标点/空白
    let mut seen = 0usize;
    let next_rest: String = next
        .chars()
        .skip_while(|c| {
            if c.is_whitespace() || BOUNDARY_PUNCT.contains(*c) {
                true
            } else {
                seen += 1;
                seen <= skip
            }
        })
        .collect();
    let next_trim =
        next_rest.trim_start_matches(|c: char| c.is_whitespace() || BOUNDARY_PUNCT.contains(c));
    let merged = format!("{}{}", prev_trim, next_trim);
    if merged.trim().is_empty() {
        None
    } else {
        Some(merged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rule3_cut_mid_sentence_merged() {
        // 取证场景：rule3 硬切"那今天晚上我。" + "会用三个阶段来做分享。"
        // → 去 prev 尾部句号拼接，成完整句
        assert_eq!(
            merge_segments("那今天晚上我。", "会用三个阶段来做分享。一个呢就是关于复盘模型的一个简单的介绍。", 0),
            Some("那今天晚上我会用三个阶段来做分享。一个呢就是关于复盘模型的一个简单的介绍。".to_string())
        );
    }

    #[test]
    fn gap_beyond_threshold_not_merged() {
        // 句间间隔 > 600ms（正常句间尾静音）→ 不合并
        assert_eq!(merge_segments("第一段。", "第二段。", 700), None);
        // 边界：恰 600ms → 合并（含等号）
        assert_eq!(merge_segments("第一段。", "第二段。", 600), Some("第一段第二段。".to_string()));
    }

    #[test]
    fn tail_head_overlap_skipped() {
        // 句间误并场景：next 头部与前段尾部重叠（"矩阵"）→ 跳过不重复
        assert_eq!(merge_segments("今天讲矩阵。", "矩阵的特征值。", 300), Some("今天讲矩阵的特征值。".to_string()));
    }

    #[test]
    fn next_leading_punct_stripped() {
        // next 以句号开头（重打分残留）→ 去头部标点
        assert_eq!(merge_segments("那今天晚上我", "。会用三个阶段来做分享。", 0), Some("那今天晚上我会用三个阶段来做分享。".to_string()));
    }

    #[test]
    fn empty_inputs_not_merged() {
        assert_eq!(merge_segments("", "内容", 0), None);
        assert_eq!(merge_segments("内容", "", 0), None);
        assert_eq!(merge_segments("", "", 0), None);
    }

    #[test]
    fn punct_only_input_not_merged() {
        // prev/next 全是标点 → strip 后为空 → 不合并
        assert_eq!(merge_segments("。。", "。", 0), None);
    }

    #[test]
    fn short_overlap_kept() {
        // 单字重叠（<2）不跳过（防误删"人人"类真实语言）
        assert_eq!(merge_segments("讲矩阵", "阵的特征值", 0), Some("讲矩阵阵的特征值".to_string()));
    }

    #[test]
    fn chained_merges_join_multi_cut_sentence() {
        // 回归测试（TD-2026-08-19）：连续 rule3 硬切（同一句话被切三刀）——
        // 链式合并 A+B → AB，AB+C → ABC，最终成完整句。
        // @ai-context: 挂起段恒为硬切段——其尾部句号是 SenseVoice 在音频截断处
        //              的模型猜测（不可信），合并时剥离（"分享。"→"分享"）；
        //              句号恢复由课后精修/F4-2 标点路径补回（ADR-012 局限记录）。
        let a = merge_segments("那今天晚上我", "会用三个阶段来做分享。", 0).expect("A+B");
        assert_eq!(a, "那今天晚上我会用三个阶段来做分享。");
        let b = merge_segments(&a, "一个呢就是关于复盘模型的一个简单的介绍。", 0).expect("AB+C");
        assert_eq!(b, "那今天晚上我会用三个阶段来做分享一个呢就是关于复盘模型的一个简单的介绍。");
    }

    #[test]
    fn chained_merge_failure_falls_back_to_independent() {
        // 链式合并失败（gap 超限）→ 挂起段独立落库语义（返回 None）
        // 模拟：挂起段与下一段间隔 1.2s（正常句间）——不合并
        let a = merge_segments("第一段内容", "第二段内容", 1200);
        assert_eq!(a, None);
    }

    #[test]
    fn whitespace_boundaries_handled() {
        assert_eq!(merge_segments("那今天晚上我。 ", "  会用三个阶段。", 0), Some("那今天晚上我会用三个阶段。".to_string()));
    }
}
