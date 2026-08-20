//! OCR 错字纠错单测（REQ-168 / v0.7.5）。
//!
//! @ai-context: AAA 模式；覆盖共现校验（有证据纠/无证据不猜）、JSON 覆盖合并、
//!              黄金语料样本（会话31：「項灣启动是艺术」）。

use super::*;

#[test]
fn corrects_when_term_co_occurs_in_transcript() {
    // Arrange：会话31 黄金样本——「項灣」在画面、正确词「项目」在讲述
    let table = OcrCorrectionTable::default();
    // Act
    let out = table.correct("清晖项目管理項灣启动是艺术", "……项目不是在结束时失败的……");
    // Assert：共现有证据 → 纠错
    assert_eq!(out, "清晖项目管理项目启动是艺术");
}

#[test]
fn no_correction_without_co_occurrence() {
    // Arrange：转写中无「项目」（无互证证据）
    let table = OcrCorrectionTable::default();
    // Act
    let out = table.correct("項灣启动是艺术", "今天讲的是管理学的历史沿革");
    // Assert：保守——不猜不纠
    assert_eq!(out, "項灣启动是艺术");
}

#[test]
fn no_correction_without_mapping() {
    // Arrange：无映射的错形（任意垃圾字串）
    let table = OcrCorrectionTable::default();
    // Act
    let out = table.correct("随机乱码xxyy", "转写里有各种内容");
    // Assert：原样返回
    assert_eq!(out, "随机乱码xxyy");
}

#[test]
fn multiple_rules_apply_in_order() {
    // Arrange：同句两个错形都有共现证据
    let table = OcrCorrectionTable::default();
    // Act
    let out = table.correct("項灣启动，产晶名称", "项目立项与产品名称……");
    // Assert：两条都纠
    assert_eq!(out, "项目启动，产品名称");
}

#[test]
fn empty_inputs_safe() {
    // Act & Assert：空文本/空转写 → 原样（防御）
    let table = OcrCorrectionTable::default();
    assert_eq!(table.correct("", "项目"), "");
    assert_eq!(table.correct("項灣", ""), "項灣");
}

#[test]
fn json_override_and_merge() {
    // Arrange：JSON 覆盖种子（項灣→项目班）并新增自定义映射
    let json = r#"{"rules":[{"from":"項灣","to":"项目班"},{"from":"错形X","to":"正确词"}]}"#;
    let table = OcrCorrectionTable::from_json(json).expect("parse");
    // Act & Assert：覆盖生效（按 from 去重）；新增并入
    let out = table.correct("項灣", "项目班子");
    assert_eq!(out, "项目班");
    assert_eq!(table.correct("错形X", "正确词"), "正确词");
    // 未被覆盖的种子仍在（质灣→质量）
    assert_eq!(table.correct("质灣", "质量"), "质量");
}

#[test]
fn load_missing_file_falls_back_to_builtin() {
    // Act
    let table = OcrCorrectionTable::load(std::path::Path::new("C:/nonexistent/ocr_correction.json"));
    // Assert：内置种子兜底
    assert!(table.rules.iter().any(|r| r.from == "項灣"));
}
