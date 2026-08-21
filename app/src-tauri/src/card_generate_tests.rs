//! card_generate 单测（AAA 模式；golden 用例覆盖两类卡源）。

use crate::card_generate::{card_from_fragment, cards_from_note};

/// 真实笔记形态（structure_note 产出口径：章节 + 正文 + 词汇表块）。
const NOTE_WITH_GLOSSARY: &str = "# 微积分精讲\n\n## 第一章 极限 [00:00]\n\n\
极限是微积分的基础概念，描述函数的趋近行为。\n\n\
## 词汇表\n\n\
- [01:23] 极限（画面 ×3 / 语音 ×5）\n\
- [05:10] 导数（画面 ×2 / 语音 ×4）\n\
- 孤立术语（画面 ×1 / 语音 ×1）\n";

#[test]
fn note_glossary_terms_become_cards() {
    // Act
    let cards = cards_from_note(NOTE_WITH_GLOSSARY);
    // Assert：三术语各一卡，front=术语
    assert_eq!(cards.len(), 3);
    assert_eq!(cards[0].front, "极限");
    assert_eq!(cards[1].front, "导数");
    assert_eq!(cards[2].front, "孤立术语");
}

#[test]
fn back_uses_context_sentence_when_present() {
    // Act
    let cards = cards_from_note(NOTE_WITH_GLOSSARY);
    // Assert：back=正文含术语的上下文句（不是词汇表行本身）
    assert!(cards[0].back.contains("趋近行为"), "应取正文上下文: {}", cards[0].back);
    assert!(!cards[0].back.starts_with("- "));
}

#[test]
fn back_falls_back_to_glossary_line_without_context() {
    // Act：孤立术语正文无命中
    let cards = cards_from_note(NOTE_WITH_GLOSSARY);
    // Assert：兜底为词汇表行（诚实简陋但有卡）
    assert!(cards[2].back.starts_with("- 孤立术语"));
}

#[test]
fn note_without_glossary_yields_no_cards() {
    // Arrange：无词汇表块的笔记（口播类）
    let content = "# 闲聊\n\n今天聊点轻松的，没有结构。";
    // Act/Assert：诚实零卡
    assert!(cards_from_note(content).is_empty());
}

#[test]
fn multi_sentence_fragment_becomes_card() {
    // Arrange：两句话的碎片
    let text = "眼影晕染要用松软的刷子。少量多次才不会显脏。";
    // Act
    let card = card_from_fragment(text);
    // Assert：首句线索 + 全文验证
    let card = card.expect("多句碎片应出卡");
    assert_eq!(card.front, "眼影晕染要用松软的刷子");
    assert!(card.back.contains("少量多次"));
}

#[test]
fn single_sentence_fragment_no_card() {
    // Arrange/Act：单句碎片无回忆结构
    let card = card_from_fragment("只有一句话的碎片");
    // Assert：诚实不出卡（防假燃料）
    assert!(card.is_none());
}

#[test]
fn fragment_front_truncated_to_limit() {
    // Arrange：超长首句
    let long = "长".repeat(100);
    let text = format!("{}。第二句验证材料。", long);
    // Act
    let card = card_from_fragment(&text).expect("出卡");
    // Assert：front 上限 60 字符（UI 可读性）
    assert!(card.front.chars().count() <= 60);
}
