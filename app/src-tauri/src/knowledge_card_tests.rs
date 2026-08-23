//! knowledge_card 单测（AAA 模式；golden 边界全覆盖——spec §三）。
//!
//! @ai-context: 卡面契约 compose/parse 互为逆；锚点为整行前缀判定。全部用 assert_eq
//!              直接比对中文文本（字段语义/值精确比较），避免字符级差异引入噪声。

use crate::knowledge_card::{
    back_has_anchor, format_model_card_back, parse_model_card_back,
};

// parse_model_card_back golden：契约语义六 + 半角容错一。

#[test]
fn parse_standard_three_lines_all_fields() {
    // Arrange：标准三行契约（字段值单行）
    let text = "本质：内在规律\n边界：适用范围\n联系：相关概念";
    // Act
    let parsed = parse_model_card_back(text);
    // Assert：三问全取
    assert_eq!(parsed.essence, Some("内在规律".to_string()));
    assert_eq!(parsed.boundary, Some("适用范围".to_string()));
    assert_eq!(parsed.relation, Some("相关概念".to_string()));
}

#[test]
fn parse_missing_boundary_is_none() {
    // Arrange：缺"边界"标签行（两问契约）
    let text = "本质：内在规律\n联系：相关概念";
    // Act
    let parsed = parse_model_card_back(text);
    // Assert：缺标签 → 该问 None（其余正常取）
    assert_eq!(parsed.essence, Some("内在规律".to_string()));
    assert_eq!(parsed.boundary, None);
    assert_eq!(parsed.relation, Some("相关概念".to_string()));
}

#[test]
fn parse_empty_field_is_none() {
    // Arrange："本质："后无内容（空字段），其余两问有值
    let text = "本质：\n边界：适用范围\n联系：相关概念";
    // Act
    let parsed = parse_model_card_back(text);
    // Assert：空字段 → essence=None（缺问而非空串）
    assert_eq!(parsed.essence, None);
    assert_eq!(parsed.boundary, Some("适用范围".to_string()));
    assert_eq!(parsed.relation, Some("相关概念".to_string()));
}

#[test]
fn parse_trims_leading_trailing_whitespace() {
    // Arrange：字段值首尾多余空白（同一行内）
    let text = "本质：  内在规律  \n边界：  适用范围   \n联系： 相关概念";
    // Act
    let parsed = parse_model_card_back(text);
    // Assert：首尾空白折叠
    assert_eq!(parsed.essence, Some("内在规律".to_string()));
    assert_eq!(parsed.boundary, Some("适用范围".to_string()));
    assert_eq!(parsed.relation, Some("相关概念".to_string()));
}

#[test]
fn parse_preserves_internal_newlines() {
    // Arrange：字段值含换行（后续非标签行并入当前字段）
    let text = "本质：第一行\n第二行\n边界：适用范围\n联系：相关概念";
    // Act
    let parsed = parse_model_card_back(text);
    // Assert：保留内部换行（拼接），不折叠
    assert_eq!(parsed.essence, Some("第一行\n第二行".to_string()));
    assert_eq!(parsed.boundary, Some("适用范围".to_string()));
    assert_eq!(parsed.relation, Some("相关概念".to_string()));
}

#[test]
fn parse_no_labels_all_none() {
    // Arrange：无任何标签行的普通文本
    let text = "这是普通文本\n没有标签";
    // Act
    let parsed = parse_model_card_back(text);
    // Assert：三问全 None
    assert_eq!(parsed.essence, None);
    assert_eq!(parsed.boundary, None);
    assert_eq!(parsed.relation, None);
}

#[test]
fn parse_halfwidth_colon_tolerated() {
    // Arrange：半角冒号（`本质:边界:联系:`）容错解析
    let text = "本质:内在规律\n边界:适用范围\n联系:相关概念";
    // Act
    let parsed = parse_model_card_back(text);
    // Assert：半角冒号也正确分字段
    assert_eq!(parsed.essence, Some("内在规律".to_string()));
    assert_eq!(parsed.boundary, Some("适用范围".to_string()));
    assert_eq!(parsed.relation, Some("相关概念".to_string()));
}

// format_model_card_back golden：三行契约（空字段留空行）。

#[test]
fn format_all_fields() {
    // Arrange
    // Act：全填
    let out = format_model_card_back(Some("内在规律"), Some("适用范围"), Some("相关概念"));
    // Assert：三行契约
    assert_eq!(out, "本质：内在规律\n边界：适用范围\n联系：相关概念");
}

#[test]
fn format_empty_field_keeps_empty_line() {
    // Arrange
    // Act：边界为空（None）
    let out = format_model_card_back(Some("内在规律"), None, Some("相关概念"));
    // Assert：空字段留 `边界：` 空行（占位不省略）
    assert_eq!(out, "本质：内在规律\n边界：\n联系：相关概念");
}

// back_has_anchor golden：整行前缀判定（防字段值中部误判/防重复回链）。

#[test]
fn back_has_anchor_three_questions_false() {
    // Arrange：仅三问，无锚点（未升格未回链）
    let text = "本质：内在规律\n边界：适用范围\n联系：相关概念";
    // Act/Assert：无锚点 → false
    assert!(!back_has_anchor(text));
}

#[test]
fn back_has_anchor_trailing_anchor_true() {
    // Arrange：末尾追加独立锚点行（升格已回链）
    let text = "本质：内在规律\n边界：适用范围\n联系：相关概念\n→ 概念「安全边际」";
    // Act/Assert：整行前缀匹配 → true
    assert!(back_has_anchor(text));
}

#[test]
fn back_has_anchor_mid_value_marker_false() {
    // Arrange：标记出现在字段值中部（联系里提"→ 概念「凯利」"），非整行锚点
    let text = "本质：内在规律\n边界：适用范围\n联系：→ 概念「凯利」";
    // Act/Assert：非整行锚点 → false（不误判）
    assert!(!back_has_anchor(text));
}

// compose/parse 互为逆：解析后再格式化幂等（空字段占位稳定往返）。

#[test]
fn format_parse_roundtrip_is_idempotent() {
    // Arrange：先组合
    let out = format_model_card_back(Some("内在规律"), None, Some("相关概念"));
    // Act：再解析再组合
    let reparsed = parse_model_card_back(&out);
    let out2 = format_model_card_back(
        reparsed.essence.as_deref(),
        reparsed.boundary.as_deref(),
        reparsed.relation.as_deref(),
    );
    // Assert：幂等往返（parse 后 format 得到相同卡面）
    assert_eq!(out2, out);
}
