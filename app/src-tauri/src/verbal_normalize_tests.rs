//! 口语书面化单测（REQ-045 / v0.5.0 M2，B5 语料覆盖）。
//!
//! @ai-context: AAA 模式；语料覆盖语气词/重复短语/标点/空白折叠/强度档位/空输入。

use super::*;

fn standard() -> NormalizeConfig {
    NormalizeConfig::default()
}

#[test]
fn filler_words_removed() {
    // Arrange：含多个语气词
    let text = "嗯，那个这个我们先看一下这个定义。";
    // Act
    let out = normalize(text, &standard());
    // Assert：语气词被清除，正文保留
    assert!(!out.contains("嗯"));
    assert!(!out.contains("那个"));
    assert!(!out.contains("这个"));
    assert!(out.contains("先看一下"));
}

#[test]
fn sentence_start_filler_removed() {
    // Arrange：句首填充词
    let text = "就是说，这个公式很重要。";
    // Act
    let out = normalize(text, &standard());
    // Assert：句首"就是说/这个"清除
    assert!(!out.contains("就是说"));
    assert!(out.contains("公式很重要"));
}

#[test]
fn repeat_phrase_compressed() {
    // Arrange：连续重复
    let text = "对对对，这个很重要";
    // Act
    let out = normalize(text, &standard());
    // Assert："对对对"压缩为"对"
    assert!(!out.contains("对对"));
    assert!(out.contains("对"));
}

#[test]
fn punctuation_restored_at_sentence_end() {
    // Arrange：句末无标点
    let text = "这是第一点这是第二点";
    // Act
    let out = normalize(text, &standard());
    // Assert：补句号
    assert!(out.ends_with('。'));
}

#[test]
fn existing_punctuation_preserved() {
    // Arrange：已有句号
    let text = "已经结束了。";
    // Act
    let out = normalize(text, &standard());
    // Assert：不重复补标点
    assert_eq!(out, "已经结束了。");
    // 问号/感叹号同样保留
    assert_eq!(normalize("为什么？", &standard()), "为什么？");
    assert_eq!(normalize("太棒了！", &standard()), "太棒了！");
}

#[test]
fn whitespace_collapsed_after_filler_removal() {
    // Arrange：语气词删除产生多处空白
    let text = "嗯 嗯 嗯  大家好";
    // Act
    let out = normalize(text, &standard());
    // Assert：连续空白折叠为单空格
    assert_eq!(out, "大家好。");
}

#[test]
fn strong_strength_trims_conjunctions() {
    // Arrange：Strong 档
    let cfg = NormalizeConfig { strength: NormalizeStrength::Strong };
    // Act
    let out = normalize("然后我们继续，并且要注意", &cfg);
    // Assert：连词精简
    assert!(!out.contains("并且"));
    assert!(!out.contains("然后"));
}

#[test]
fn light_strength_conservative() {
    // Arrange：Light 档
    let cfg = NormalizeConfig { strength: NormalizeStrength::Light };
    // Act：语气词删除 + 标点恢复，但不动连词（"并且"保留）
    let out = normalize("嗯，并且这个很重要", &cfg);
    // Assert：Light 不精简连词
    assert!(out.contains("并且"));
    assert!(!out.contains("嗯"));
}

#[test]
fn empty_and_whitespace_input() {
    // Act/Assert：空输入安全返回
    assert_eq!(normalize("", &standard()), "");
    assert_eq!(normalize("   ", &standard()), "");
}

#[test]
fn short_text_no_repeat_crash() {
    // Arrange：短文本（<4 字符，重复压缩边界）
    let text = "好的";
    // Act
    let out = normalize(text, &standard());
    // Assert：不崩溃、正常补标点
    assert_eq!(out, "好的。");
}

#[test]
fn compress_repeats_two_char_phrase() {
    // Act：2 字短语重复（"算法算法"→"算法"）
    let out = compress_repeats("算法算法讲解", 2);
    // Assert：压缩为单次
    assert_eq!(out, "算法讲解");
}

#[test]
fn compress_repeats_no_repeat_unchanged() {
    // Act：无重复保持原样
    let out = compress_repeats("机器学习的损失函数", 2);
    // Assert：不变
    assert_eq!(out, "机器学习的损失函数");
}

#[test]
fn compress_repeats_three_char_phrase() {
    // Act：3 字短语重复（"梯度下降梯度下降"→"梯度下降"）
    let out = compress_repeats("梯度下降梯度下降讲解", 2);
    // Assert：压缩
    assert_eq!(out, "梯度下降讲解");
}
