//! 跨 final 重叠去重（ADR-012 F3-2）：原项目 asrFilters.ts dedupeAcrossFinals 移植。
//!
//! @ai-context: 端点误断句/rule3 硬切时，前句尾词会重复出现在后句开头
//!              （"今天讲矩阵" + "矩阵的特征值"→ 后句应去前缀"矩阵"）。
//!              编排层在每次 Final 定稿时用上一 Final 文本调用本模块。
//! @ai-context: 纯函数可单测；最长公共重叠上限 8 字（防长文本 O(n²) 扫描）。

/// 最长公共重叠扫描上限（字）。
const MAX_OVERLAP_CHARS: usize = 8;

/// Jaccard 字符集相似度（纯函数；跨 final 高度相似判定用）。
fn jaccard_similarity(a: &str, b: &str) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let set_a: std::collections::HashSet<char> = a.chars().collect();
    let set_b: std::collections::HashSet<char> = b.chars().collect();
    let intersection = set_a.intersection(&set_b).count();
    let union = set_a.len() + set_b.len() - intersection;
    if union == 0 {
        0.0
    } else {
        intersection as f32 / union as f32
    }
}

/// 跨 final 去重：处理后句（可能返回空串 = 整体重复应丢弃）。
///
/// @ai-context: 规则：① 完全一致 → 空（流式复位残留重复推送）；② 后缀-前缀
///              重叠 ≥2 字 → 截断后句重叠前缀（截断后为空 → 空）；③ 截断后与
///              前句 Jaccard > 0.9 → 整体重复 → 空。
pub fn dedupe_across_finals(prev: &str, next: &str) -> String {
    if prev.is_empty() || next.is_empty() {
        return next.to_string();
    }
    if prev == next {
        return String::new();
    }
    let prev_chars: Vec<char> = prev.chars().collect();
    let next_chars: Vec<char> = next.chars().collect();
    let max_overlap = prev_chars.len().min(next_chars.len()).min(MAX_OVERLAP_CHARS);
    for len in (2..=max_overlap).rev() {
        let prev_tail: String = prev_chars[prev_chars.len() - len..].iter().collect();
        let next_head: String = next_chars[..len].iter().collect();
        if prev_tail == next_head {
            let trimmed: String = next_chars[len..].iter().collect::<String>().trim().to_string();
            if trimmed.is_empty() {
                return String::new();
            }
            // 高度相似兜底：截断后仍与前句几乎相同 → 整体重复
            if jaccard_similarity(prev, &trimmed) > 0.9 {
                return String::new();
            }
            return trimmed;
        }
    }
    next.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_finals_dropped() {
        // 完全一致 → 重复推送（流式复位残留）
        assert_eq!(dedupe_across_finals("今天讲矩阵", "今天讲矩阵"), "");
    }

    #[test]
    fn suffix_prefix_overlap_stripped() {
        // "矩阵" 尾首重叠 → 后句去前缀
        assert_eq!(dedupe_across_finals("今天讲矩阵", "矩阵的特征值"), "的特征值");
    }

    #[test]
    fn full_overlap_means_duplicate() {
        // 后句全部是重叠 → 空
        assert_eq!(dedupe_across_finals("今天讲矩阵", "矩阵"), "");
    }

    #[test]
    fn short_overlap_kept() {
        // 重叠仅 1 字（<2）→ 不处理
        assert_eq!(dedupe_across_finals("讲矩阵", "阵"), "阵");
    }

    #[test]
    fn no_overlap_kept() {
        assert_eq!(dedupe_across_finals("今天讲矩阵", "然后讲特征值"), "然后讲特征值");
    }

    #[test]
    fn overlap_stripped_keeps_short_residue() {
        // 重叠截断后残余 1 字（"的"）保留——与原项目一致（碎片由下游
        // note_filter 碎片段规则过滤，不在本模块丢弃）
        assert_eq!(dedupe_across_finals("矩阵的特征值", "矩阵的特征值的"), "的");
    }

    #[test]
    fn empty_inputs_passthrough() {
        assert_eq!(dedupe_across_finals("", "内容"), "内容");
        assert_eq!(dedupe_across_finals("内容", ""), "");
    }

    #[test]
    fn long_overlap_capped_at_8() {
        // 9 字尾首重叠 → 上限 8 字不命中 → 原样（防 O(n²) 扫描上限）
        let prev = "一二三四五六七八九";
        let next = "一二三四五六七八九十";
        assert_eq!(dedupe_across_finals(prev, next), next);
    }
}
