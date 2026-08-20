//! 话语层净化（v0.7.5 扩展：过渡短句 + 修辞问句）。
//!
//! @ai-context: 会话31 实证讨论（用户反馈"讲我们具体的工具了。过程是什么？"
//!              两段无价值）：规则层只抓**形式特征明显**的废话——① 纯过渡
//!              短句（整句 ∈ 精确表才删，零误杀低召回）；② 自问自答句
//!              （问句核心词在紧邻下一段复现 → 修辞自问 → 删问句，信息由
//!              答案段承载）。带话题的过渡句（"讲我们具体的工具了"）与
//!              开放性问题（无答案）**不删**——宁漏勿误（可逆契约：删除
//!              进 filtered 供预览对照复查）。
//! @ai-context: 纯函数无 IO；疑问词/核心词提取为启发式——边界全部钉在
//!              单测与黄金语料里。

use crate::note_filter::{FilteredItem, FilterReason, FilterStats};

/// 纯过渡短句精确表（整句去标点后 ∈ 表且 ≤transition_max_chars 字才删）。
///
/// @ai-context: 只收录"单独成段时必为过渡/开场"的短语；**精确匹配非前缀**
///              ——"接下来我们看第三章"（含章节内容）不在表内不删（零误杀）；
///              "好/行/可以"等单字回应语不进表（语义短句保留，与"对"同口径）。
pub const TRANSITION_PHRASES: &[&str] = &[
    "接下来", "下面", "下面我们来看", "接下来我们", "我们来看", "我们看", "先看", "首先",
    "最后", "总之", "那么", "那好", "行吧", "好吧", "开始吧", "上课了", "我们开始",
    "开始上课", "今天我们来", "今天给大家",
];

/// 疑问词表（修辞问句判定 + 核心词提取）。
const QUESTION_WORDS: &[&str] = &[
    "什么", "为什么", "怎么", "如何", "为何", "多少", "哪里", "是不是", "有没有", "能不能",
    "哪", "几", "吗", "呢",
];

/// 纯过渡短句判定（纯函数）：去首尾标点后 ∈ 精确表 且 ≤max_chars 字。
pub fn is_transition_short(text: &str, max_chars: usize) -> bool {
    let t = trim_punct(text);
    let chars = t.chars().count();
    chars > 0 && chars <= max_chars && TRANSITION_PHRASES.contains(&t.as_str())
}

/// 问句判定（纯函数）：以问号结尾，或以疑问词结尾（ASR 常丢问号）。
pub fn is_question(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    if t.ends_with('？') || t.ends_with('?') {
        return true;
    }
    QUESTION_WORDS.iter().any(|w| t.ends_with(w))
}

/// 问句核心词提取（纯函数）：去疑问词与标点后最长的连续 CJK 段（≥2 字）。
///
/// @ai-context: "过程是什么？" → 去"什么" → "过程是"（话题骨架）；答案段含
///              该子串（"**这个过程是**制定项目章程"）即话题延续证据。
/// @ai-context: 无 2 字以上 CJK 段（"为什么？"/"多少？"）→ None（疑问过泛，
///              无话题可验——保守不删）。
pub fn question_core(text: &str) -> Option<String> {
    let mut t = text.to_string();
    for w in QUESTION_WORDS {
        t = t.replace(w, "");
    }
    let mut best: Option<String> = None;
    let mut cur = String::new();
    let flush = |cur: &mut String, best: &mut Option<String>| {
        if cur.chars().count() >= 2 {
            let longer = best.as_ref().is_none_or(|b: &String| cur.chars().count() > b.chars().count());
            if longer {
                *best = Some(std::mem::take(cur));
                return;
            }
        }
        cur.clear();
    };
    for c in t.chars() {
        if is_cjk(c) {
            cur.push(c);
        } else {
            flush(&mut cur, &mut best);
        }
    }
    flush(&mut cur, &mut best);
    best
}

/// 修辞问句删除（纯函数，跨段上下文）：问句的下一段包含其核心词 → 自问自答
/// → 移出 kept 进 filtered（reason=Rhetorical——前端标签"反问"）。
///
/// @ai-context: 紧邻下一段限定（答案不在紧邻段 = 开放问题/伏笔 → 保留）；
///              问句超长（>rhetorical_max_chars）不删（复杂问句多为真问题）；
///              核心词缺失/过泛不删。实现：先借用 kept 预判（下一段检查），
///              再移动阶段消费（into_iter 后不可再借用）。
pub fn drop_rhetorical_questions(
    kept: Vec<crate::types::SessionSegment>,
    max_chars: usize,
    stats: &mut FilterStats,
    filtered: &mut Vec<FilteredItem>,
) -> Vec<crate::types::SessionSegment> {
    // 预判阶段（借用 kept——下一段检查需要随机访问）
    let flags: Vec<bool> = (0..kept.len())
        .map(|i| {
            let text = kept[i].text.trim();
            if text.chars().count() > max_chars || !is_question(text) {
                return false;
            }
            match question_core(text) {
                Some(core) => kept
                    .get(i + 1)
                    .map(|n| n.text.contains(&core))
                    .unwrap_or(false),
                None => false,
            }
        })
        .collect();
    // 移动阶段
    let mut out: Vec<crate::types::SessionSegment> = Vec::with_capacity(kept.len());
    for (i, seg) in kept.into_iter().enumerate() {
        if flags[i] {
            stats.rhetorical += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Rhetorical,
                text: seg.text.clone(),
                start_ms: seg.start_ms,
            });
        } else {
            out.push(seg);
        }
    }
    out
}

/// 去首尾标点（纯函数）。
fn trim_punct(text: &str) -> String {
    text.trim()
        .trim_matches(|c: char| c.is_ascii_punctuation() || "。！？，、；：…·".contains(c))
        .to_string()
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_filter_discourse_tests.rs"]
mod tests;
