//! ASR 输出净化（ADR-012 F2-2）：原项目 asrFilters.ts 的 Rust 移植。
//!
//! @ai-context: Zipformer 流式在静音段存在重复输出最后词/短句的已知行为
//!              （"就是就是"）；纯标点/灌水幻觉（"嗯嗯嗯嗯"）在静音/噪声段
//!              高频出现。原项目（streamingAsr.ts）在 partial/final 推送前
//!              经 cleanAsrResult 清洗，Rust 实时链路移植时丢失——本模块补齐，
//!              输出统一：trim → 相邻重复压缩 → 幻觉过滤（返回空串 = 丢弃）。
//! @ai-context: 保守策略（宁放过不误杀，与原项目一致）：仅压缩完全相邻、
//!              纯中文的重复；两字确认语白名单（"是的，是的"是真实强调）
//!              不压缩；单字灌水留给幻觉过滤整段丢弃。

/// 两字确认语白名单（跨标点重复压缩的误杀保护）。
const CONFIRM_WORDS: &[&str] = &["是的", "对的", "好的", "没错", "可以", "行吧", "哦哦"];

/// 幻觉判定：去标点后 unique 字符 ≤ 2 且长度 ≥ 4（"嗯嗯嗯嗯""是是是是"）。
const HALLUCINATION_MIN_LEN: usize = 4;
const HALLUCINATION_MAX_UNIQUE: usize = 2;

/// 短句脏话模式（静音/噪声段幻觉高频形态；正常教学语音几乎不独立出现）。
const PROFANITY_PATTERNS: &[&str] = &["操你", "草泥马", "傻逼", "妈的", "畜生"];

/// 纯标点/空白判定（纯函数）。
fn is_punct_only(text: &str) -> bool {
    text.chars()
        .all(|c| c.is_whitespace() || "。，、．.,!？?！…~～·-—".contains(c))
}

/// 幻觉过滤（纯函数）：纯标点 / 灌水字符 / 短句脏话 → true。
pub fn is_likely_hallucination(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }
    if is_punct_only(trimmed) {
        return true;
    }
    let compact: Vec<char> = trimmed
        .chars()
        .filter(|c| !c.is_whitespace() && !"，。、．.,!？?！…~～".contains(*c))
        .collect();
    let unique: std::collections::HashSet<char> = compact.iter().copied().collect();
    if compact.len() >= HALLUCINATION_MIN_LEN && unique.len() <= HALLUCINATION_MAX_UNIQUE {
        return true;
    }
    if trimmed.chars().count() <= 20 && PROFANITY_PATTERNS.iter().any(|p| trimmed.contains(p)) {
        return true;
    }
    false
}

/// 纯中文连续字符（重复单元必须是纯词——"对，对"标点分隔不压缩）。
fn is_pure_cjk(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
}

/// 相邻重复压缩（纯函数）：形态 1 整句幂等 / 形态 2 句中相邻 / 形态 3 跨标点。
///
/// @ai-context: 与原项目规则逐条对齐：形态 3 仅压缩 2-10 字且含 ≥2 种字符的
///              纯中文词，确认语白名单不压缩，最多 3 轮（"A，A，A" 逐轮压缩）。
pub fn collapse_adjacent_duplicates(text: &str) -> String {
    let t = text.trim();
    if t.chars().count() < 4 {
        return t.to_string();
    }
    let chars: Vec<char> = t.chars().collect();
    let len = chars.len();

    // 形态 1：整句幂等重复——单位长从 1 递增，命中即返回最短重复单位
    for unit_len in 1..=len / 2 {
        if !len.is_multiple_of(unit_len) {
            continue;
        }
        let unit: String = chars[..unit_len].iter().collect();
        if !is_pure_cjk(&unit) {
            continue;
        }
        if chars.chunks(unit_len).all(|c| c.iter().collect::<String>() == unit) {
            return unit;
        }
    }

    // 形态 2：句中相邻重复——最长窗口优先，压缩后重启扫描
    let mut result: Vec<char> = chars.clone();
    loop {
        let mut changed = false;
        'outer: for half in (2..=result.len() / 2).rev() {
            let mut i = 0;
            while i + half * 2 <= result.len() {
                let a: String = result[i..i + half].iter().collect();
                if is_pure_cjk(&a)
                    && a == result[i + half..i + half * 2].iter().collect::<String>()
                {
                    result.drain(i + half..i + half * 2);
                    changed = true;
                    break 'outer;
                }
                i += 1;
            }
        }
        if !changed {
            break;
        }
    }

    // 形态 3：跨单个中文标点的相邻重复——"就是，就是"→"就是"（最多 3 轮）
    let mut cross: String = result.iter().collect();
    for _ in 0..3 {
        let before = cross.clone();
        let mut out = String::new();
        let chars3: Vec<char> = cross.chars().collect();
        let mut i = 0;
        while i < chars3.len() {
            // 找 2-10 字纯中文词 + 单个中文标点 + 相同词
            let mut matched = false;
            for word_len in (2..=10.min(chars3.len() - i)).rev() {
                let word: String = chars3[i..i + word_len].iter().collect();
                if !is_pure_cjk(&word) || word.chars().collect::<std::collections::HashSet<_>>().len() < 2 {
                    continue;
                }
                let after = i + word_len;
                if after + 1 + word_len <= chars3.len()
                    && "，,、".contains(chars3[after])
                    && chars3[after + 1..after + 1 + word_len].iter().collect::<String>() == word
                    && !CONFIRM_WORDS.contains(&word.as_str())
                {
                    out.push_str(&word);
                    i = after + 1 + word_len;
                    matched = true;
                    break;
                }
            }
            if !matched {
                out.push(chars3[i]);
                i += 1;
            }
        }
        cross = out;
        if cross == before {
            break;
        }
    }
    cross
}

/// ASR 输出统一清洗：trim → 相邻重复压缩 → 幻觉过滤。
///
/// @ai-context: 返回空串表示该段被判幻觉/重复灌水，调用方应丢弃不上屏。
pub fn clean_asr_result(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let deduped = collapse_adjacent_duplicates(trimmed);
    if is_likely_hallucination(&deduped) {
        String::new()
    } else {
        deduped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── 重复压缩 ──

    #[test]
    fn whole_sentence_idempotent_repeat() {
        // 形态 1："就是就是" → "就是"
        assert_eq!(collapse_adjacent_duplicates("就是就是"), "就是");
        assert_eq!(collapse_adjacent_duplicates("就是这样就是这样"), "就是这样");
    }

    #[test]
    fn inline_adjacent_repeat() {
        // 形态 2："我就是就是这样的" → "我就是这样的"
        assert_eq!(collapse_adjacent_duplicates("我就是就是这样的"), "我就是这样的");
    }

    #[test]
    fn cross_punct_repeat_with_whitelist() {
        // 形态 3："就是，就是" → "就是"
        assert_eq!(collapse_adjacent_duplicates("就是，就是"), "就是");
        // 确认语白名单："是的，是的" 是真实确认强调，不压缩
        assert_eq!(collapse_adjacent_duplicates("是的，是的"), "是的，是的");
    }

    #[test]
    fn single_char_repeat_kept() {
        // "人人""天天"是真实语言，不压缩
        assert_eq!(collapse_adjacent_duplicates("人人"), "人人");
    }

    #[test]
    fn short_text_passthrough() {
        assert_eq!(collapse_adjacent_duplicates("对"), "对");
        assert_eq!(collapse_adjacent_duplicates("你好"), "你好");
    }

    // ── 幻觉过滤 ──

    #[test]
    fn punct_only_is_hallucination() {
        assert!(is_likely_hallucination("。"));
        assert!(is_likely_hallucination("   ，。 "));
    }

    #[test]
    fn repeated_filler_is_hallucination() {
        assert!(is_likely_hallucination("嗯嗯嗯嗯"));
        assert!(is_likely_hallucination("是是是是"));
    }

    #[test]
    fn normal_text_not_hallucination() {
        assert!(!is_likely_hallucination("今天讲熵减的概念"));
        assert!(!is_likely_hallucination("嗯")); // 单字语气词不是灌水
    }

    #[test]
    fn profanity_short_text_is_hallucination() {
        assert!(is_likely_hallucination("妈的什么情况"));
    }

    // ── 整体清洗 ──

    #[test]
    fn clean_returns_empty_for_hallucination() {
        // 纯标点 → 丢弃；灌水句压缩后剩单字语气词（<4 字不判幻觉）→ 保留
        // （与原项目 cleanAsrResult 行为一致）
        assert_eq!(clean_asr_result("嗯嗯嗯嗯"), "嗯");
        assert_eq!(clean_asr_result("。"), "");
    }

    #[test]
    fn clean_dedupes_and_keeps_real_text() {
        assert_eq!(clean_asr_result("就是就是"), "就是");
        assert_eq!(clean_asr_result("今天讲熵减"), "今天讲熵减");
        assert_eq!(clean_asr_result(""), "");
    }
}
