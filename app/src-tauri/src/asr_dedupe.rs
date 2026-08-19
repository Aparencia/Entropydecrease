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

/// 去标点/空白（REQ-118：归一化比较口径——复用 asr_rescore::strip_punct 语义）。
fn normalized(s: &str) -> String {
    crate::asr_rescore::strip_punct(s).iter().collect()
}

/// 2-gram 提取（纯函数；长度 <2 返回空）。
fn bigrams(s: &str) -> Vec<(char, char)> {
    let chars: Vec<char> = s.chars().collect();
    chars.windows(2).map(|w| (w[0], w[1])).collect()
}

/// 短语级 Jaccard（REQ-118 POST-O7）：2-gram 短语集合交集/并集。
///
/// @ai-context: 字符级 Jaccard 被高频虚词拉高（"的/了/是"交集大）；
///              2-gram 短语反映真实语序重复——整体重复判定更精准。
fn phrase_jaccard(a: &str, b: &str) -> f32 {
    let grams_a: std::collections::HashSet<(char, char)> = bigrams(a).into_iter().collect();
    let grams_b: std::collections::HashSet<(char, char)> = bigrams(b).into_iter().collect();
    if grams_a.is_empty() || grams_b.is_empty() {
        return 0.0;
    }
    let intersection = grams_a.intersection(&grams_b).count();
    let union = grams_a.len() + grams_b.len() - intersection;
    if union == 0 {
        0.0
    } else {
        intersection as f32 / union as f32
    }
}

/// 跨 final 去重（REQ-118 升级版）：归一化比较 + 短语级 Jaccard。
///
/// @ai-context: ① 归一化（去标点/空白）后完全一致 → 空（带标点差异的重复：
///              "矩阵。" vs "矩阵"）；② 归一化后缀-前缀重叠 ≥2 字 → 截断
///              （标点不阻断重叠识别）；③ 归一化后短语级 Jaccard > 阈值 →
///              整体重复（虚词不拉高——字符级 Jaccard 的误判下降）。
/// @ai-context: 保持原 dedupe_across_finals 不变（既有调用点零回归）；
///              实时链路调用点切到升级版（v0.7.0 同批提交）。
pub fn dedupe_across_finals_normalized(prev: &str, next: &str) -> String {
    if prev.is_empty() || next.is_empty() {
        return next.to_string();
    }
    let np = normalized(prev);
    let nn = normalized(next);
    if np.is_empty() || nn.is_empty() {
        return next.to_string();
    }
    // ① 归一化完全一致 → 重复
    if np == nn {
        return String::new();
    }
    // ② 归一化后缀-前缀重叠（标点鲁棒版）
    let prev_chars: Vec<char> = np.chars().collect();
    let next_chars: Vec<char> = nn.chars().collect();
    let max_overlap = prev_chars.len().min(next_chars.len()).min(MAX_OVERLAP_CHARS);
    let mut trimmed = next.to_string();
    for len in (2..=max_overlap).rev() {
        let prev_tail: String = prev_chars[prev_chars.len() - len..].iter().collect();
        let next_head: String = next_chars[..len].iter().collect();
        if prev_tail == next_head {
            // 原文按归一化重叠长度截断（标点已归一化，近似可接受）
            let orig_chars: Vec<char> = next.chars().collect();
            trimmed = orig_chars[len..].iter().collect::<String>().trim().to_string();
            break;
        }
    }
    if trimmed.is_empty() {
        return String::new();
    }
    // ③ 短语级 Jaccard 整体重复判定（虚词鲁棒）
    if phrase_jaccard(prev, &trimmed) > 0.8 {
        return String::new();
    }
    trimmed
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

    // ── REQ-118（v0.7.0 M2，POST-O7）：归一化 + 短语级 Jaccard ──

    #[test]
    fn normalized_identical_with_punctuation_dropped() {
        // 带标点差异的重复（"矩阵。" vs "矩阵"）——原版不识别，升级版识别
        assert_eq!(dedupe_across_finals_normalized("今天讲矩阵。", "今天讲矩阵"), "");
    }

    #[test]
    fn normalized_overlap_stripped_across_punctuation() {
        // 标点不阻断重叠识别："特征值。"尾 vs "特征值"头
        assert_eq!(dedupe_across_finals_normalized("今天讲矩阵的特征值。", "特征值的应用"), "的应用");
    }

    #[test]
    fn phrase_jaccard_ignores_stop_words() {
        // 虚词不拉高重叠：两段共享"的/了"但内容不同 → 短语级 Jaccard 低 → 保留
        let out = dedupe_across_finals_normalized("今天讲的概念和原理", "明天考试的内容了");
        assert!(!out.is_empty(), "虚词共享不应误判整体重复");
    }

    #[test]
    fn phrase_jaccard_detects_true_duplicate() {
        // 真实重复（同内容不同标点）→ 短语级 Jaccard 高 → 空
        assert_eq!(dedupe_across_finals_normalized("复习一下这个知识点。", "复习一下这个知识点"), "");
    }

    #[test]
    fn normalized_empty_inputs_passthrough() {
        assert_eq!(dedupe_across_finals_normalized("", "内容"), "内容");
        assert_eq!(dedupe_across_finals_normalized("内容", ""), "");
    }

    #[test]
    fn normalized_no_overlap_kept() {
        // 不同内容 → 保留（归一化不改变非重复行为）
        assert_eq!(dedupe_across_finals_normalized("今天讲矩阵", "然后讲特征值"), "然后讲特征值");
    }
}
