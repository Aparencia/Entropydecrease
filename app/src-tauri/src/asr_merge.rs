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

/// 合并时间门限（默认，ms）：句间间隔 ≤ 该值视为硬切连续句（正常句间 ≥1.2s 尾静音）。
pub const MERGE_GAP_MS: u64 = 600;

/// 自适应合并阈值下界（ms，v0.7.2 REQ-154 S-1）。
const ADAPTIVE_GAP_MIN: u64 = 300;
/// 自适应合并阈值上界（ms，v0.7.2 REQ-154 S-1）。
const ADAPTIVE_GAP_MAX: u64 = 900;

/// 自适应合并阈值（S-1，REQ-154）：中位数段前停顿 × 0.5，clamp [300, 900]ms。
///
/// @ai-context: 说话人停顿习惯直接决定硬切段 gap 分布：机关枪（停顿 ~300ms）→
///              300ms（收紧：少合并 → 8s 段独立落库，防无句号链式挂起失控——
///              TD-2026-08-19-B 场景）；正常（~1.5s）→ 750ms（略放宽：把
///              600-750ms 的硬切也合并回完整句）；慢速（~2.5s+）→ 900ms（放宽，
///              减少切碎）。纯函数可单测；空历史 → 默认 600ms（零回归）。
pub fn adaptive_merge_gap(pause_history: impl Iterator<Item = u64>) -> u64 {
    let mut sorted: Vec<u64> = pause_history.collect();
    if sorted.is_empty() {
        return MERGE_GAP_MS;
    }
    sorted.sort_unstable();
    let median = sorted[sorted.len() / 2];
    ((median as f64 * 0.5).round() as u64).clamp(ADAPTIVE_GAP_MIN, ADAPTIVE_GAP_MAX)
}

/// 语速骤变判定（S-2，REQ-154）：当前语速较上一段**骤降 ≥40%** 视为强调/变速
/// （讲慢 = 重点；与 volume_surge 音量骤变姊妹信号，重点标注备数据）。
pub fn is_speech_rate_drop(prev: f32, cur: f32) -> bool {
    prev > 0.0 && (prev - cur) / prev >= 0.4
}

/// 参与跳过的最小尾首重叠（字，≥2 防单字巧合）。
const MIN_OVERLAP_CHARS: usize = 2;

/// 句尾/句首标点集合（拼接时去除；逗号也去——硬切后继续的短语不应带前导逗号）。
const BOUNDARY_PUNCT: &str = "。！？，、；：…,.!?;:";

/// 语义级合并：prev（挂起硬切段）与 next（后续段）是否/如何合并为一句。
///
/// @ai-context: 返回合并后的完整文本；gap 超门限或输入为空 → None（不合并）。
///              尾首重叠 ≥2 字先跳过（next 头部与前段尾部重复的词去掉）。
pub fn merge_segments(prev: &str, next: &str, gap_ms: u64) -> Option<String> {
    merge_segments_with_gap(prev, next, gap_ms, MERGE_GAP_MS)
}

/// 语义级合并（参数化阈值版，REQ-154 S-1）：调用方注入动态合并阈值
/// （adaptive_merge_gap 产出）；其余语义与 merge_segments 一致。
pub fn merge_segments_with_gap(
    prev: &str,
    next: &str,
    gap_ms: u64,
    merge_gap_ms: u64,
) -> Option<String> {
    if gap_ms > merge_gap_ms {
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

/// 语言判定（REQ-119 POST-O8：中英混排拼接边界空格）。
///
/// @ai-context: ASCII 字母/数字=拉丁（英文/数字/代码），CJK=中文——
///              相邻段语言不同且都非标点 → 插入空格（"Python中"→"Python 中"）。
fn is_latin(c: char) -> bool {
    c.is_ascii_alphanumeric()
}

fn is_cjk(c: char) -> bool {
    matches!(c, '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}')
}

/// 拼接边界空格（纯函数）：prev 尾字符与 next 首字符语言不同 → 插空格。
///
/// @ai-context: 仅处理**非标点**相邻（标点边界天然分隔）；"Python"+"中" → 空格；
///              "中"+"文"（同语言）→ 不插；"，"+"中文"（标点）→ 不插。
///              返回 None=无需插空格（原样拼接）。
fn spacing_for(prev_tail: char, next_head: char) -> Option<&'static str> {
    let p_latin = is_latin(prev_tail);
    let p_cjk = is_cjk(prev_tail);
    let n_latin = is_latin(next_head);
    let n_cjk = is_cjk(next_head);
    if (p_latin && n_cjk) || (p_cjk && n_latin) {
        Some(" ")
    } else {
        None
    }
}

/// 语义级合并（REQ-119 增强版）：同 merge_segments + 拼接边界空格。
///
/// @ai-context: REQ-119（v0.7.0 M2，POST-O8）：AI merge 拼接按相邻语言插空格——
///              中英混排不粘连（"Python中"→"Python 中"）；纯函数可单测。
///              原 merge_segments 保留（兼容既有调用点），新调用点用本函数。
pub fn merge_segments_with_spacing(prev: &str, next: &str, gap_ms: u64) -> Option<String> {
    let merged = merge_segments(prev, next, gap_ms)?;
    apply_spacing(prev, next, &merged)
}

/// 语义级合并（REQ-119 + REQ-154 S-1 自适应阈值版）：调用方注入动态合并阈值。
pub fn merge_segments_with_spacing_adaptive(
    prev: &str,
    next: &str,
    gap_ms: u64,
    merge_gap_ms: u64,
) -> Option<String> {
    let merged = merge_segments_with_gap(prev, next, gap_ms, merge_gap_ms)?;
    apply_spacing(prev, next, &merged)
}

/// 拼接边界空格（抽出共用逻辑）：prev 尾字符与 next 首字符语言不同 → 插空格。
fn apply_spacing(prev: &str, next: &str, merged: &str) -> Option<String> {
    let prev_tail = prev
        .trim_end_matches(|c: char| c.is_whitespace() || BOUNDARY_PUNCT.contains(c))
        .chars()
        .last();
    let next_head = next
        .chars()
        .find(|c| !(c.is_whitespace() || BOUNDARY_PUNCT.contains(*c)));
    match (prev_tail, next_head) {
        (Some(p), Some(n)) => match spacing_for(p, n) {
            Some(space) => {
                // 重建：prev_trim + 空格 + next_trim（与 merge_segments 相同修剪口径）
                let prev_trim = prev
                    .trim_end_matches(|c: char| c.is_whitespace() || BOUNDARY_PUNCT.contains(c));
                let next_trim = next
                    .trim_start_matches(|c: char| c.is_whitespace() || BOUNDARY_PUNCT.contains(c));
                Some(format!("{}{}{}", prev_trim, space, next_trim))
            }
            None => Some(merged.to_string()),
        },
        _ => Some(merged.to_string()),
    }
}

/// 句末标点集合（切分边界：中文句号/问号/感叹号/省略号 + ASCII 等价物）。
const SENTENCE_END_PUNCT: &str = "。！？…!?.";

/// 合并文本按句末标点切分（纯函数）：完整句列表 + 尾部残余。
///
/// @ai-context: 切分边界 = 合并文本**内部**的句号——段内标点来自 SenseVoice/
///              F4-2 对完整 8s 音频的预测（真实句间停顿，可信）；段边界猜测
///              标点已在 merge_segments 剥除（截断处标点不可信）。因此切出的
///              完整句 ≈ 真实句子，残余（无句号尾部）= 半句，继续挂起合并。
/// @ai-context: 连续句末标点（"结束。。"）归同一句；切分不丢弃任何字符；
///              空/纯标点输入安全（不崩溃，不丢字符原则）。
pub fn split_sentences(text: &str) -> (Vec<String>, String) {
    if text.trim().is_empty() {
        return (Vec::new(), String::new());
    }
    let mut complete = Vec::new();
    let mut buf = String::new();
    let mut prev_end = false;
    for c in text.chars() {
        let is_end = SENTENCE_END_PUNCT.contains(c);
        if prev_end && !is_end {
            // 前一字符是句末标点且当前不是 → 此前累积的是一句
            complete.push(std::mem::take(&mut buf));
        }
        buf.push(c);
        prev_end = is_end;
    }
    if prev_end {
        complete.push(buf);
        (complete, String::new())
    } else {
        (complete, buf)
    }
}

/// 子句时间戳近似分配（纯函数）：按字符占比切分区间 [start, end]。
///
/// @ai-context: 流式链路无词级时间戳（B8 由离线/精修路径产出），合并段切分后
///              各句时间戳按字符比例近似（语速均匀假设）；单调不重叠。
///              char_counts 含残余（残余区间 = 尾部未分配部分——残余起点
///              连续衔接最后完整句终点）。退化输入（总字符 0 / 零区间）
///              全部落回整段区间，不崩溃。
pub fn split_timestamps(start_ms: u64, end_ms: u64, char_counts: &[usize]) -> Vec<(u64, u64)> {
    let total: usize = char_counts.iter().sum();
    if total == 0 || end_ms <= start_ms {
        return char_counts.iter().map(|_| (start_ms, end_ms)).collect();
    }
    let dur = end_ms - start_ms;
    let mut acc = 0usize;
    char_counts
        .iter()
        .map(|&n| {
            let s = start_ms + (acc as u64 * dur) / total as u64;
            acc += n;
            let e = start_ms + (acc as u64 * dur) / total as u64;
            (s, e.max(s))
        })
        .collect()
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

    // ── REQ-154（v0.7.2 S-1）：自适应合并阈值 ──

    #[test]
    fn adaptive_gap_empty_history_uses_default() {
        assert_eq!(adaptive_merge_gap(std::iter::empty()), MERGE_GAP_MS);
    }

    #[test]
    fn adaptive_gap_machine_gun_speaker_tightens() {
        // 机关枪（停顿 ~300ms）→ 300ms（clamp 下界：少合并防挂起失控）
        assert_eq!(adaptive_merge_gap([300, 300, 300, 300].into_iter()), 300);
        assert_eq!(adaptive_merge_gap([200, 250, 300, 400].into_iter()), 300);
    }

    #[test]
    fn adaptive_gap_normal_speaker_relaxes() {
        // 正常（中位数 ~1500ms）→ 750ms（把 600-750ms 硬切也合并回）
        assert_eq!(adaptive_merge_gap([1200, 1500, 1500, 2000].into_iter()), 750);
    }

    #[test]
    fn adaptive_gap_slow_speaker_capped() {
        // 慢速（中位数 ~2500ms）→ 1250 → clamp 上界 900ms
        assert_eq!(adaptive_merge_gap([2000, 2500, 3000, 4000].into_iter()), 900);
    }

    #[test]
    fn adaptive_gap_threshold_injected_merge() {
        // 动态阈值注入：gap 750 在默认 600 下不合并，在自适应 750 下合并
        assert_eq!(merge_segments_with_gap("第一段", "第二段", 700, 600), None);
        assert_eq!(
            merge_segments_with_gap("第一段", "第二段", 700, 750),
            Some("第一段第二段".to_string())
        );
        // 含空格拼接（adaptive 版与 with_spacing 语义一致）
        assert_eq!(
            merge_segments_with_spacing_adaptive("我们讲Python", "中的异常处理", 700, 750),
            Some("我们讲Python 中的异常处理".to_string())
        );
    }

    // ── REQ-154（v0.7.2 S-2）：语速骤变判定 ──

    #[test]
    fn rate_drop_detected_over_40_percent() {
        // 5 → 2.5 字/秒：骤降 50% → 强调/变速
        assert!(is_speech_rate_drop(5.0, 2.5));
        // 5 → 3.1：降 38% < 40% → 不算骤变
        assert!(!is_speech_rate_drop(5.0, 3.1));
    }

    #[test]
    fn rate_drop_edge_cases() {
        // 无前值（0）/增速/持平 → 不判定
        assert!(!is_speech_rate_drop(0.0, 1.0));
        assert!(!is_speech_rate_drop(3.0, 4.0));
        assert!(!is_speech_rate_drop(3.0, 3.0));
    }

    #[test]
    fn whitespace_boundaries_handled() {
        assert_eq!(merge_segments("那今天晚上我。 ", "  会用三个阶段。", 0), Some("那今天晚上我会用三个阶段。".to_string()));
    }

    // ── 合并后句子切分（F4-1 增强：merge-then-split）──

    #[test]
    fn merged_multi_sentence_text_split_into_sentences() {
        // 用户场景回归：连续语音（停顿 <600ms）下多个 rule3 段合并后含多句，
        // 按段内真实句号切分为句子——取代"固定次数一刀切"的整段落库
        let merged = merge_segments(
            "那今天晚上我",
            "会用三个阶段来做分享。一个呢就是关于复盘模型的一个简单的介绍。",
            0,
        )
        .expect("合并成功");
        let (complete, rest) = split_sentences(&merged);
        assert_eq!(
            complete,
            vec![
                "那今天晚上我会用三个阶段来做分享。".to_string(),
                "一个呢就是关于复盘模型的一个简单的介绍。".to_string(),
            ]
        );
        assert_eq!(rest, "", "整段以句号结尾 → 无残余");
    }

    #[test]
    fn trailing_incomplete_part_becomes_rest() {
        // 合并文本尾部无句号（半句）→ 完整句切出，残余继续挂起合并
        let (complete, rest) = split_sentences("第一句。第二句还在讲");
        assert_eq!(complete, vec!["第一句。".to_string()]);
        assert_eq!(rest, "第二句还在讲");
    }

    #[test]
    fn no_sentence_end_punct_all_rest() {
        // 全程无句号（模型未给句号）→ 无完整句，整段为残余
        let (complete, rest) = split_sentences("那今天晚上我会用三个阶段来做分享");
        assert!(complete.is_empty());
        assert_eq!(rest, "那今天晚上我会用三个阶段来做分享");
    }

    #[test]
    fn chained_merge_then_split_reassembles_full_sentence() {
        // 13.wav"同句三刀" + 切分：A+B+C 合并成完整句组后按句号切回两句
        let ab = merge_segments("那今天晚上我", "会用三个阶段来做分享。", 0).expect("A+B");
        // AB 尾部"分享。"是 B 段真实句号（段内标点可信）——切分直接消化为完整句
        let (complete, rest) = split_sentences(&ab);
        assert_eq!(complete, vec!["那今天晚上我会用三个阶段来做分享。".to_string()]);
        assert_eq!(rest, "");
        // 无句号的中间态（A+B 均为半句）→ 整段残余，继续挂起
        let ab2 = merge_segments("那今天晚上我", "会用三个阶段来做分享", 0).expect("A+B 半句");
        let (c2, r2) = split_sentences(&ab2);
        assert!(c2.is_empty());
        assert_eq!(r2, "那今天晚上我会用三个阶段来做分享");
    }

    #[test]
    fn consecutive_end_punct_kept_in_same_sentence() {
        // "结束。。"连续标点归同一句（不把第二个句号留给残余）
        let (complete, rest) = split_sentences("结束。。继续讲");
        assert_eq!(complete, vec!["结束。。".to_string()]);
        assert_eq!(rest, "继续讲");
    }

    #[test]
    fn split_empty_and_punct_only_safe() {
        assert_eq!(split_sentences(""), (Vec::<String>::new(), String::new()));
        assert_eq!(split_sentences("   "), (Vec::<String>::new(), String::new()));
        // 纯标点输入不崩溃、不丢字符（上游 merge 已过滤纯标点，防御性保障）
        let (c, r) = split_sentences("。");
        assert_eq!(c, vec!["。".to_string()]);
        assert!(r.is_empty());
    }

    #[test]
    fn split_timestamps_proportional_and_monotonic() {
        // 三句字符 3:3:4，区间 [0, 1000] → 按占比 300/300/400
        let spans = split_timestamps(0, 1000, &[3, 3, 4]);
        assert_eq!(spans, vec![(0, 300), (300, 600), (600, 1000)]);
        // 单调不重叠（含残余的连续分配）
        let spans2 = split_timestamps(100, 300, &[5, 5]);
        assert_eq!(spans2, vec![(100, 200), (200, 300)]);
    }

    #[test]
    fn split_timestamps_degenerate_safe() {
        // 总字符 0 / 零区间 → 全部落回整段，不崩溃
        assert_eq!(split_timestamps(0, 1000, &[0, 0]), vec![(0, 1000), (0, 1000)]);
        assert_eq!(split_timestamps(500, 500, &[3, 4]), vec![(500, 500), (500, 500)]);
        assert!(split_timestamps(0, 1000, &[]).is_empty());
    }

    // ── REQ-119（v0.7.0 M2，POST-O8）：拼接边界空格 ──

    #[test]
    fn latin_cjk_boundary_gets_space() {
        // "Python"+"中" → "Python 中"（中英混排不粘连）
        assert_eq!(
            merge_segments_with_spacing("我们讲Python", "中的异常处理", 0),
            Some("我们讲Python 中的异常处理".to_string())
        );
    }

    #[test]
    fn cjk_latin_boundary_gets_space() {
        // "中"+"Python" → 空格
        assert_eq!(
            merge_segments_with_spacing("先讲中文", "Python再讲英文", 0),
            Some("先讲中文 Python再讲英文".to_string())
        );
    }

    #[test]
    fn same_language_no_space() {
        // 中+中 → 不插空格（原拼接行为）
        assert_eq!(
            merge_segments_with_spacing("那今天晚上我", "会用三个阶段来做分享。", 0),
            Some("那今天晚上我会用三个阶段来做分享。".to_string())
        );
    }

    #[test]
    fn punctuation_boundary_no_space() {
        // 标点边界：merge 本身剥除边界标点（"。"被剥），语言判定看剥后字符——
        // "完"（CJK）+"P"（拉丁）→ 仍需空格（标点不阻断混排空格规则）
        assert_eq!(
            merge_segments_with_spacing("今天讲完了。", "Python的内容", 0),
            Some("今天讲完了 Python的内容".to_string())
        );
    }

    #[test]
    fn digit_cjk_boundary_gets_space() {
        // 数字+中文 → 空格（"第1"+"章"场景——数字属拉丁类）
        assert_eq!(
            merge_segments_with_spacing("这是第1", "章内容", 0),
            Some("这是第1 章内容".to_string())
        );
    }

    #[test]
    fn spacing_gap_threshold_still_applies() {
        // 空格逻辑不影响 gap 门限（超限仍不合并）
        assert_eq!(merge_segments_with_spacing("Python", "中", 700), None);
    }
}
