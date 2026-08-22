//! 组→闪卡生成纯函数（v0.11.2；本地规则版先行，AI 生成为可选增强）。
//!
//! @ai-context: 两个直供源（v4 路线图 Step 4）：
//!              ① 笔记词汇表块（structure_note.rs ## 词汇表 行）——术语卡；
//!              ② 碎片文本（多句拆分——首句线索，全文验证，提取优先）。
//! @ai-context: 提取优先纪律——front 是回忆线索不是答案展示；back 是验证材料；
//!              单句碎片无回忆结构 → 诚实不出卡（防"假燃料"微观形态）。
//! @ai-context: 内容分型（v0.11.4 REQ-199，N13 续）：碎片含步骤语义信号 →
//!              kind=action（front=动作名首句，back=步骤清单）；无信号维持 fact。
//!              model 留接口不做——kind 白名单由数据层/命令层透传，前端按类渲染。
//! @ai-context: 纯函数无 IO；幂等去重在数据层（同组同 front 查重）。

/// 卡片类型白名单（fact=知识卡 / action=动作卡；model 留接口不做）。
pub const KIND_FACT: &str = "fact";
pub const KIND_ACTION: &str = "action";

/// 步骤语义元词（命中任一即判 action——中文教程/操作高频词）。
const STEP_META_WORDS: [&str; 6] = ["第一步", "步骤", "做法", "流程", "操作步骤", "教程"];

/// 生成的卡片候选（front/back + 内容分型 kind）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardCandidate {
    pub front: String,
    pub back: String,
    /// fact/action（model 留接口；notes 术语卡恒 fact）
    pub kind: String,
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
        // 术语卡恒 fact（词汇表是知识不是操作——内容分型不误伤）
        out.push(CardCandidate { front: term, back, kind: KIND_FACT.to_string() });
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
/// @ai-context: 内容分型（REQ-199）——步骤信号命中 → action 卡：front=动作名
///              （首句线索），back=步骤清单（按句号拆分编号，回忆步骤序列）；
///              无信号维持 fact（back=全文验证）。单句含信号仍不出卡——
///              步骤清单需要多句才有回忆结构，防假燃料优先。
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
    let is_action = has_step_signal(text);
    let back = if is_action {
        // 步骤清单：编号列出全部句子（保留原文顺序，回忆动作序列）
        sentences
            .iter()
            .enumerate()
            .map(|(i, s)| format!("{}. {}", i + 1, s))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        text.trim().to_string()
    };
    Some(CardCandidate {
        front,
        back,
        kind: if is_action { KIND_ACTION } else { KIND_FACT }.to_string(),
    })
}

/// 步骤语义信号判定（REQ-199）：步骤元词命中，或"先…然后"成对出现。
///
/// @ai-context: "先/然后"单现不算信号（普通叙事高频词，误判会把知识卡
///              伪装成动作卡）；成对出现才隐含操作顺序。
fn has_step_signal(text: &str) -> bool {
    STEP_META_WORDS.iter().any(|w| text.contains(w))
        || (text.contains("先") && text.contains("然后"))
}

#[cfg(test)]
#[path = "card_generate_tests.rs"]
mod tests;
