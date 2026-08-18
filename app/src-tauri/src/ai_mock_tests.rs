//! 补缝式 AI mock 适配器单测（REQ-055 / v0.5.0 M8）。
//!
//! @ai-context: AAA 模式；mock 响应全部通过协议 schema 校验（验证渲染链路契约）。

use super::*;
use crate::ai_protocol::{AiContext, AiSourceRef};

fn request(t: AiRequestType) -> AiEnhanceRequest {
    AiEnhanceRequest {
        request_type: t,
        source_ref: AiSourceRef { frame_id: Some(1), crop_image: None, crop: None },
        context: AiContext::default(),
    }
}

#[test]
fn mock_table_response_valid_and_structured() {
    // Arrange
    let adapter = AiMockAdapter;
    // Act
    let resp = adapter.enhance(&request(AiRequestType::Table));
    // Assert：schema 校验通过 + 结构化 Markdown
    assert!(resp.validate().is_ok(), "mock 响应必须通过协议校验");
    assert!(resp.content.markdown.as_deref().unwrap_or("").contains('|'));
}

#[test]
fn mock_formula_response_valid() {
    let adapter = AiMockAdapter;
    let resp = adapter.enhance(&request(AiRequestType::FormulaLatex));
    assert!(resp.validate().is_ok());
    assert!(resp.content.latex.as_deref().unwrap_or("").contains("\\frac"));
}

#[test]
fn mock_flowchart_response_valid_with_edges() {
    let adapter = AiMockAdapter;
    let resp = adapter.enhance(&request(AiRequestType::Flowchart));
    assert!(resp.validate().is_ok(), "图结构响应必须通过节点/边校验");
    let nodes = resp.content.nodes.as_deref().unwrap();
    assert!(!nodes.is_empty());
}

#[test]
fn mock_handwriting_response_valid() {
    let adapter = AiMockAdapter;
    let resp = adapter.enhance(&request(AiRequestType::Handwriting));
    assert!(resp.validate().is_ok());
    assert!(!resp.content.handwriting.as_deref().unwrap_or("").is_empty());
}

#[test]
fn mock_chart_data_response_valid() {
    let adapter = AiMockAdapter;
    let resp = adapter.enhance(&request(AiRequestType::ChartData));
    assert!(resp.validate().is_ok());
    assert!(resp.content.chart_data.as_deref().unwrap_or("").contains(','));
}

#[test]
fn all_mock_responses_pass_validation() {
    // Arrange：全部请求类型
    let adapter = AiMockAdapter;
    for t in [
        AiRequestType::Table,
        AiRequestType::FormulaLatex,
        AiRequestType::Flowchart,
        AiRequestType::Diagram,
        AiRequestType::Handwriting,
        AiRequestType::ChartData,
    ] {
        // Act
        let resp = adapter.enhance(&request(t));
        // Assert：mock 输出永远合法（渲染链路契约）
        assert!(resp.validate().is_ok(), "{:?} mock 响应必须合法", t);
    }
}

#[test]
fn mock_diagram_type_preserved() {
    // Arrange：Diagram 请求
    let adapter = AiMockAdapter;
    // Act
    let resp = adapter.enhance(&request(AiRequestType::Diagram));
    // Assert：响应类型与请求一致（不串类型）
    assert_eq!(resp.response_type, AiRequestType::Diagram);
}
