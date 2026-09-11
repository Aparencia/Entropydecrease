//! @ai-context: 笔记过滤域的**净化纯函数族 + 口头禅词表 + CJK 判定**（批 0-C3 Task 8
//!              S2 从 note_filter.rs 平铺拆出，AGENTS.md §3 单文件 ≤300 行）——被过滤链
//!              （note_filter_chain::filter_note_transcript）与 note_filter_ai 消费。
//! @ai-context: 副作用：**全部是纯函数**（无 IO / 无 DB / 无锁 / 无全局态）；唯一可变
//!              写入是 `purify_segment` 经 `&mut FilterStats` 累加计数（统计口径 = 语义，
//!              `stats.verbal`/`stutter`/`term_replace` 三处计数位置不可合并）。
//! @ai-context: 边界（**顺序契约，逐字搬运不改**）：`purify_segment` 内部四步
//!              **折叠必须先于书面化**——verbal_normalize::compress_repeats 会把"甲甲甲"
//!              先压成"甲甲"，折叠规则（≥3 连同字）随后不再命中，结巴残留（会话31 实证）。
//! @ai-context: 边界（既有缺陷，只搬不改）：`is_purified_empty`/`is_fragment` 里
//!              `!c.is_alphanumeric() && !is_cjk(c)` 的 `is_cjk` 在语义上被
//!              `is_alphanumeric` 覆盖（CJK 属 Unicode Alphabetic）⇒ 冗余但无害；
//!              改成 `is_ascii_alphanumeric` 或删 `is_cjk` 会改变全角数字/字母/假名判定。
//!              `concat_transcript` 每段后**无条件**追加半角空格（含末段）。
//!              `is_filler_only` 的手写全角标点集 `"。！？，、；：…·"` 一个字不能动。
//! @ai-context: 可见性：5 个函数放宽为 `pub(crate)`（B→C 方向调用，9 个私有 fn 零直测
//!              ⇒ 放宽不改变任何测试）；`is_cjk` 保持私有（唯一消费者同在本模块）。

use crate::purify_config::PurifyConfig;
use crate::symbol_normalize::SymbolNormalizeConfig;
use crate::types::SessionSegment;
use crate::verbal_normalize::{NormalizeConfig, NormalizeStrength};

use super::FilterStats;

/// 口头禅词集（REQ-163 删除判定 + REQ-085 AI Filler 候选共用）。
///
/// @ai-context: v0.7.5 扩展（与 verbal_normalize 词表对齐——「大家知道吗/
///              咱们/我们看」等口语高频词此前只在实时路径被清，笔记路径漏网）；
///              短段全由这些词组成 → 规则级删除；"对"单字不删（回应语义，
///              且碎片规则已按 ≤2 字处理——验收口径）。
pub(crate) const FILLER_WORDS: &[&str] = &[
    "嗯", "啊", "呃", "哦", "诶", "哎", "哈", "嗯嗯", "哈哈", "好的", "对", "那个", "这个",
    "就是", "然后", "对吧", "是吧", "对不对", "对不对啊", "好不好", "就是说", "然后呢",
    "你们知道吗", "大家知道吗", "大家注意", "大家看", "咱们", "我们看", "我们来看", "接下来呢",
];

/// 单段口语净化（纯函数）：结巴折叠 → 书面化（保守档 Light）→ 符号规范化 →
/// 术语替换；返回净化后文本（统计计数由调用方入参累加）。
///
/// @ai-context: 顺序契约（会话31 实证驱动）：**折叠必须先于书面化**——verbal
///              compress_repeats 会把"甲甲甲"先压成"甲甲"（2 连短语重复），
///              折叠规则（≥3 连同字）随后不再命中，结巴残留（「甲甲甲」→「甲」
///              验收不达标）；折叠在前则 3 连先收拢、书面化不再误动。
pub(crate) fn purify_segment(
    text: &str,
    config: &PurifyConfig,
    symbol_cfg: &SymbolNormalizeConfig,
    stats: &mut FilterStats,
) -> String {
    let mut out = text.to_string();
    let changed = |before: &str, after: &str| before != after;
    let before = out.clone();
    let mut fold_hit = false;
    if config.stutter_fold {
        let folded = crate::stutter_fold::fold_stutter(&out);
        fold_hit = folded != out;
        out = folded;
    }
    if config.verbal_normalize {
        let vcfg = NormalizeConfig { strength: NormalizeStrength::Light };
        out = crate::verbal_normalize::normalize(&out, &vcfg);
    }
    if config.symbol_normalize {
        out = crate::symbol_normalize::normalize(&out, symbol_cfg);
    }
    let mut term_hit = false;
    if config.term_replace {
        let replaced = crate::stutter_fold::apply_term_replacements(&out);
        term_hit = replaced != out;
        out = replaced;
    }
    if changed(&before, &out) {
        stats.verbal += 1;
    }
    if fold_hit {
        stats.stutter += 1;
    }
    if term_hit {
        stats.term_replace += 1;
    }
    out
}

/// 净化残留判定（纯函数）：空串 / 纯符号（无字母数字汉字）→ 无信息内容。
pub(crate) fn is_purified_empty(text: &str) -> bool {
    let t = text.trim();
    t.is_empty() || t.chars().all(|c| !c.is_alphanumeric() && !is_cjk(c))
}

/// 口头禅短段判定（纯函数，REQ-163）：去首尾标点后 ≤filler_max_chars 字且
/// 全部空白分隔 token ∈ 口头禅词表 → 删除候选。
///
/// @ai-context: "对不对？"→去"？"→"对不对" ✓；"对"单字 <2 不删（回应语义）；
///              "3.14"数字不删（非口头禅词）；"你说得对"含"你说得"不删。
pub(crate) fn is_filler_only(text: &str, config: &PurifyConfig) -> bool {
    let stripped: String = text
        .trim()
        .trim_matches(|c: char| c.is_ascii_punctuation() || "。！？，、；：…·".contains(c))
        .to_string();
    let chars = stripped.chars().count();
    if chars < 2 || chars > config.filler_max_chars {
        return false;
    }
    let tokens: Vec<&str> = stripped.split_whitespace().collect();
    !tokens.is_empty() && tokens.iter().all(|t| FILLER_WORDS.contains(t))
}

/// 保留段转写文本拼接（供 OCR 共现校验/纠错——画面词与讲述词互证）。
pub(crate) fn concat_transcript(kept: &[SessionSegment]) -> String {
    let mut out = String::new();
    for s in kept {
        out.push_str(&s.text);
        out.push(' ');
    }
    out
}

/// 碎片段判定（纯函数）：≤2 字 / 时长 <500ms / 纯符号（阈值可配置 REQ-173）。
///
/// @ai-context: 纯符号 = 无字母数字汉字（"----/···"）；"3.14/2024" 含数字
///              不算纯符号——误杀保护（数字内容不误删）。
pub(crate) fn is_fragment(seg: &SessionSegment, config: &PurifyConfig) -> bool {
    let text = seg.text.trim();
    text.chars().count() <= config.fragment_max_chars
        || seg.end_ms.saturating_sub(seg.start_ms) < config.fragment_min_duration_ms
        || text.chars().all(|c| !c.is_alphanumeric() && !is_cjk(c))
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}
