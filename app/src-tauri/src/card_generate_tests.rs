//! card_generate 单测（AAA 模式；golden 用例覆盖两类卡源 + 内容分型 REQ-199）。

use crate::card_generate::{card_from_fragment, cards_from_note, KIND_ACTION, KIND_FACT};

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
    // Assert：三术语各一卡，front=术语，kind 恒 fact（词汇表是知识不是操作）
    assert_eq!(cards.len(), 3);
    assert_eq!(cards[0].front, "极限");
    assert_eq!(cards[1].front, "导数");
    assert_eq!(cards[2].front, "孤立术语");
    assert!(cards.iter().all(|c| c.kind == KIND_FACT));
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
    // Arrange：两句话的碎片（无步骤信号）
    let text = "眼影晕染要用松软的刷子。少量多次才不会显脏。";
    // Act
    let card = card_from_fragment(text);
    // Assert：首句线索 + 全文验证 + kind 恒 fact
    let card = card.expect("多句碎片应出卡");
    assert_eq!(card.front, "眼影晕染要用松软的刷子");
    assert!(card.back.contains("少量多次"));
    assert_eq!(card.kind, KIND_FACT);
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

// ── 内容分型（REQ-199）：步骤信号 → action 卡 ──

#[test]
fn step_signal_fragment_becomes_action_card() {
    // Arrange：含"第一步/第二步"步骤元词的碎片
    let text = "修眉的做法。第一步用眉梳梳顺。第二步按眉骨定三点。第三步连点成线。";
    // Act
    let card = card_from_fragment(text).expect("出卡");
    // Assert：kind=action；front=首句（动作名）；back=编号步骤清单（全句入列）
    assert_eq!(card.kind, KIND_ACTION);
    assert_eq!(card.front, "修眉的做法");
    assert!(card.back.starts_with("1. 修眉的做法"));
    assert!(card.back.contains("2. 第一步用眉梳梳顺"));
    assert!(card.back.contains("3. 第二步按眉骨定三点"));
}

#[test]
fn pair_signal_xi_ranhou_counts_as_action() {
    // Arrange："先…然后"成对出现（隐含操作顺序，无元词）
    let text = "补妆先吸走浮粉。然后用粉饼按压。最后定妆喷雾收尾。";
    // Act
    let card = card_from_fragment(text).expect("出卡");
    // Assert：成对信号 → action
    assert_eq!(card.kind, KIND_ACTION);
    assert!(card.back.contains("3. 最后定妆喷雾收尾"));
}

#[test]
fn lone_ranhou_is_not_action_signal() {
    // Arrange：单"然后"无"先"——普通叙事不是操作流程
    let text = "昨天学了新技巧。然后去吃了午饭。今天继续练习。";
    // Act
    let card = card_from_fragment(text).expect("出卡");
    // Assert：维持 fact（防叙事误判伪装动作卡）
    assert_eq!(card.kind, KIND_FACT);
    // back 维持全文验证（非编号清单）
    assert!(!card.back.starts_with("1. "));
}

#[test]
fn xiu_ke_narrative_not_action() {
    // Arrange："先修课…然后…"——"先"是课程名一部分，守卫词命中且非步骤
    let text = "先修课是线性代数。然后学微积分。最后是概率论。";
    // Act
    let card = card_from_fragment(text).expect("出卡");
    // Assert：维持 fact（守卫词拦截——防"先修/先后/优先/先生"误判）
    assert_eq!(card.kind, KIND_FACT);
    assert!(!card.back.starts_with("1. "));
}

#[test]
fn two_sentence_xian_ranhou_not_action() {
    // Arrange："先…然后"同现但仅 2 句——步骤序列的最小形态是 3 句
    let text = "先复习错题。然后做新题。";
    // Act
    let card = card_from_fragment(text).expect("出卡");
    // Assert：2 句不成序列（不足 3 句），维持 fact 诚实
    assert_eq!(card.kind, KIND_FACT);
}

#[test]
fn shou_xian_meta_word_counts_as_action() {
    // Arrange："首先"入元词表——列表/步骤描述高频，词义明确不受句数限制
    let text = "首先打开软件。接着导入素材。最后点击导出。";
    // Act
    let card = card_from_fragment(text).expect("出卡");
    // Assert：元词命中 → action（跨句信号不需要，词义已定）
    assert_eq!(card.kind, KIND_ACTION);
    assert!(card.back.starts_with("1. 首先打开软件"));
}

#[test]
fn single_sentence_with_signal_still_no_card() {
    // Arrange：单句含步骤信号——无多句结构，步骤清单无从谈起
    let card = card_from_fragment("第一步先打开软件");
    // Assert：诚实不出卡（防假燃料优先于分型）
    assert!(card.is_none());
}
