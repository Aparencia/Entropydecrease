//! 帧新颖度采样（REQ-066 / v0.6.0 M3）。
//!
//! @ai-context: 预算花在新内容上——全帧 OCR 已产出文本后，与最近已见文本
//!              重叠率高 → 冗余帧（画面微变但内容未变）：不落 OCR 块/
//!              不归档存图/不收集关键帧样本。与变化检测两级串联：
//!              变化检测 = 过滤无变化帧（布尔），新颖度 = 冗余判定（连续值
//!              → 阈值门控），预算让给新内容。
//! @ai-context: 纯函数可单测；token 口径与 glossary 同思路（ASCII 词 +
//!              CJK 2-gram 集合）；冗余帧不更新"最近文本"基准（保持最后
//!              有意义内容——防冗余帧污染基准导致后续全被误判冗余）。

use std::collections::HashSet;

/// 冗余判定阈值：重叠率 ≥ 该值视为冗余帧（预算让给新内容）。
pub const REDUNDANT_THRESHOLD: f32 = 0.85;

/// 画面档 → 冗余阈值（v0.11.5 Task 2）。
///
/// 契约（单一来源）：字符串值必须与 `VisualTier::as_str()` 同口径——
/// "rich" → 0.90, "low" → 0.80；未知档回退默认 0.85。
/// 若 `VisualTier::as_str()` 新增变体，此处必须同步更新。
///
/// @ai-context: rich 档 0.90 更宽松——画面信息价值高时少判冗余（板书/代码
///              翻页细变也保留）；low 档 0.80 更严格——低价值画面（口播）
///              轻微变化直接跳过省预算；未知档回退默认 0.85（零回归）。
/// @ai-context: "rich"/"low" 字符串值必须与 `VisualTier::as_str()` 同口径（单一来源契约）。
pub fn tier_threshold(tier: &str) -> f32 {
    match tier {
        "rich" => 0.90,
        "low" => 0.80,
        _ => REDUNDANT_THRESHOLD,
    }
}

/// 新颖度得分（纯函数）：新文本 token 集与最近文本 token 集的 Jaccard 重叠率。
///
/// @ai-context: 0 = 全新内容（优先采样）；1 = 完全冗余；最近文本为空 →
///              0（首帧视为全新，不误判冗余）。
pub fn novelty_score(new_texts: &[String], recent_texts: &[String]) -> f32 {
    let new_tokens = union_tokens(new_texts);
    let recent_tokens = union_tokens(recent_texts);
    if new_tokens.is_empty() || recent_tokens.is_empty() {
        return 0.0;
    }
    let inter = new_tokens.intersection(&recent_tokens).count();
    let union = new_tokens.union(&recent_tokens).count();
    inter as f32 / union as f32
}

/// 冗余判定（纯函数）：得分 ≥ 阈值 → 冗余（跳过采样处理）。
pub fn is_redundant(score: f32, threshold: f32) -> bool {
    score >= threshold
}

/// token 集合并（ASCII 词 ≥3 字符 + CJK 2-gram 滑窗；与 glossary 同口径）。
fn union_tokens(texts: &[String]) -> HashSet<String> {
    let mut tokens = HashSet::new();
    for text in texts {
        let chars: Vec<char> = text.chars().collect();
        // CJK 2-gram 滑窗
        for i in 0..chars.len().saturating_sub(1) {
            if is_cjk(chars[i]) && is_cjk(chars[i + 1]) {
                tokens.insert(format!("{}{}", chars[i], chars[i + 1]));
            }
        }
        // ASCII 词（≥3 字符）
        for word in text.split(|c: char| !c.is_ascii_alphanumeric()) {
            if word.chars().count() >= 3 {
                tokens.insert(word.to_string());
            }
        }
    }
    tokens
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "novelty_tests.rs"]
mod tests;
