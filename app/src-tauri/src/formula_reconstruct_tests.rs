//! 公式重建单测（REQ-050 / v0.5.0 M5：规则版 golden）。
//!
//! @ai-context: AAA 模式；合成字符级输入覆盖上下标/正常/边界/分数/空输入。

use super::*;

fn normal(ch: char) -> FormulaChar {
    FormulaChar { ch, y_offset: 0.0, size_ratio: 1.0 }
}

fn super_(ch: char) -> FormulaChar {
    FormulaChar { ch, y_offset: 6.0, size_ratio: 0.7 }
}

fn sub(ch: char) -> FormulaChar {
    FormulaChar { ch, y_offset: -6.0, size_ratio: 0.7 }
}

#[test]
fn superscript_detected_x_squared() {
    // Arrange：x² → x, 2(上标)
    let chars = vec![normal('x'), super_('2')];
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：x^2 + 高置信
    assert_eq!(block.latex, "x^2");
    assert_eq!(block.source_text, "x2");
    assert!(block.confidence > 0.8);
}

#[test]
fn subscript_detected_h2o() {
    // Arrange：H₂O → H, 2(下标), O
    let chars = vec![normal('H'), sub('2'), normal('O')];
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：H_2O
    assert_eq!(block.latex, "H_2O");
}

#[test]
fn both_super_and_subscript() {
    // Arrange：a_b^c（下标 b、上标 c）
    let chars = vec![normal('a'), sub('b'), super_('c')];
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：a_b^c
    assert_eq!(block.latex, "a_b^c");
}

#[test]
fn normal_text_unchanged() {
    // Arrange：普通公式字符（无上下标特征）
    let chars: Vec<FormulaChar> = "x+1=2".chars().map(normal).collect();
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：原文直出
    assert_eq!(block.latex, "x+1=2");
}

#[test]
fn large_size_normal_not_marked() {
    // Arrange：字号大但偏移大（如行内倾斜字符）→ 不误判上下标
    let chars = vec![normal('x'), FormulaChar { ch: '2', y_offset: 6.0, size_ratio: 1.0 }];
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：size_ratio 大 → Normal（保守）
    assert_eq!(block.latex, "x2");
}

#[test]
fn small_offset_within_threshold_normal() {
    // Arrange：偏移 2px（< 4px 阈值）→ Normal
    let chars = vec![
        normal('x'),
        FormulaChar { ch: '2', y_offset: 2.0, size_ratio: 0.7 },
    ];
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：阈值内不标上下标
    assert_eq!(block.latex, "x2");
}

#[test]
fn fraction_reconstruction() {
    // Act：分子分母 → \frac
    let frac = build_fraction("x+1", "2").expect("frac");
    // Assert
    assert_eq!(frac, "\\frac{x+1}{2}");
    // 空分子/分母 → None
    assert!(build_fraction("", "2").is_none());
    assert!(build_fraction("x", "  ").is_none());
}

#[test]
fn empty_input_low_confidence() {
    // Act：空输入
    let block = reconstruct_formula(&[]);
    // Assert：空 latex + confidence 0
    assert_eq!(block.latex, "");
    assert_eq!(block.confidence, 0.0);
}

#[test]
fn text_only_low_confidence() {
    // Arrange：无元数据（size_ratio 全 1.0——编排层无字符特征时的兜底输入）
    let chars: Vec<FormulaChar> = "x2".chars().map(normal).collect();
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：原文直出 + 中置信（无上下标特征数据）
    assert_eq!(block.latex, "x2");
    assert!(block.confidence < 0.8);
}

#[test]
fn consecutive_superscripts_merge_readable() {
    // Arrange：x^ab（两个连续上标字符）
    let chars = vec![normal('x'), super_('a'), super_('b')];
    // Act
    let block = reconstruct_formula(&chars);
    // Assert：x^a^b（受限但可读；产物层低置信人工修订）
    assert_eq!(block.latex, "x^a^b");
}
