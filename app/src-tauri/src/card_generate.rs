//! 组→闪卡生成纯函数（v0.11.2；本地规则版先行，AI 生成为可选增强）。
//!
//! @ai-context: 两个直供源（v4 路线图 Step 4）：
//!              ① 笔记词汇表块（structure_note.rs ## 词汇表 行）——术语卡；
//!              ② 碎片文本（多句拆分——首句线索，全文验证，提取优先）。
//! @ai-context: 提取优先纪律——front 是回忆线索不是答案展示；back 是验证材料；
//!              单句碎片无回忆结构 → 诚实不出卡（防"假燃料"微观形态）。
//! @ai-context: 纯函数无 IO；幂等去重在数据层（同组同 front 查重）。

/// 生成的卡片候选（front/back；kind 恒 fact——内容分型预埋 N13）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardCandidate {
    pub front: String,
    pub back: String,
}

/// 从笔记正文提取卡片候选（词汇表块术语 → front；术语上下文句 → back）。
///
/// @ai-context: 词汇表行格式（structure_note.rs 产出）：
///              `- [03:21] 术语（画面 ×3 / 语音 ×2）` 或 `- 术语（...）`；
///              back 取正文中含术语的首个非标题行（上下文即释义）；
///              正文无命中 → 词汇表行自身兜底（有卡总比无卡强，但诚实简陋）。
pub fn cards_from_note(content: &str) -> Vec<CardCandidate> {
    let mut out = Vec::new();
    let mut in_glossary = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("## ") {
            in_glossary = trimmed == "## 词汇表";
            continue;
        }
        if !in_glossary || !trimmed.starts_with("- ") {
            continue;
        }
        let Some(term) = parse_glossary_term(trimmed) else { continue };
        if term.is_empty() {
            continue;
        }
        let back = find_term_context(content, &term).unwrap_or_else(|| trimmed.to_string());
        out.push(CardCandidate { front: term, back });
    }
    out
}

/// 解析词汇表行的术语（剥时间戳锚点与频次统计尾注）。
fn parse_glossary_term(line: &str) -> Option<String> {
    let body = line.strip_prefix("- ")?.trim();
    // 剥时间戳锚点 "[03:21] "
    let body = if body.starts_with('[') {
        body.find(']').map(|i| body[i + 1..].trim()).unwrap_or(body)
    } else {
        body
    };
    // 截断频次尾注 "（画面 ×N / 语音 ×N）"（中文括号口径，structure_note 产出）
    let term = match body.find('（') {
        Some(i) => &body[..i],
        None => body,
    };
    Some(term.trim().to_string())
}

/// 正文中术语的首个上下文行（跳过标题/词汇表块/空行）。
fn find_term_context(content: &str, term: &str) -> Option<String> {
    let mut in_glossary = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("## ") {
            in_glossary = trimmed == "## 词汇表";
            continue;
        }
        if in_glossary || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.contains(term) {
            return Some(trimmed.to_string());
        }
    }
    None
}

/// 从碎片文本提取卡片候选（多句才有回忆结构；单句 → None 诚实不出卡）。
///
/// @ai-context: front=首句（线索），back=全文（验证）——碎片卡质量上限受
///              碎片本身约束（v4 契约一：碎片身份诚实，不冒充课程）。
pub fn card_from_fragment(text: &str) -> Option<CardCandidate> {
    let sentences: Vec<&str> = text
        .split(|c| "。！？；\n".contains(c))
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if sentences.len() < 2 {
        return None;
    }
    let front = sentences[0].chars().take(60).collect::<String>();
    Some(CardCandidate { front, back: text.trim().to_string() })
}

#[cfg(test)]
#[path = "card_generate_tests.rs"]
mod tests;
