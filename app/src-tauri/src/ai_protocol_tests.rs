//! 补缝式 AI 协议 schema 校验单测（REQ-055 / v0.5.0 M8）。
//!
//! @ai-context: AAA 模式；覆盖合法/非法响应校验矩阵（各类型内容缺失/越界/悬空边）。

use super::*;

fn valid_table() -> AiEnhanceResponse {
    AiEnhanceResponse {
        response_type: AiRequestType::Table,
        content: AiResponseContent {
            markdown: Some("|A|B|\n|---|---|\n|1|2|".into()),
            ..Default::default()
        },
        confidence: 0.92,
    }
}

fn valid_formula() -> AiEnhanceResponse {
    AiEnhanceResponse {
        response_type: AiRequestType::FormulaLatex,
        content: AiResponseContent { latex: Some("x = \\frac{-b}{2a}".into()), ..Default::default() },
        confidence: 0.85,
    }
}

#[test]
fn valid_table_response_passes() {
    // Act/Assert：合法表格响应通过校验
    assert!(valid_table().validate().is_ok());
}

#[test]
fn valid_formula_response_passes() {
    assert!(valid_formula().validate().is_ok());
}

#[test]
fn confidence_out_of_range_rejected() {
    // Arrange：置信度越界（>1）
    let mut r = valid_table();
    r.confidence = 1.5;
    // Act/Assert
    assert!(r.validate().is_err());
    let mut r2 = valid_table();
    r2.confidence = -0.1;
    assert!(r2.validate().is_err());
}

#[test]
fn table_missing_markdown_rejected() {
    // Arrange：表格类型缺 markdown
    let mut r = valid_table();
    r.content.markdown = None;
    // Act/Assert
    assert!(r.validate().is_err());
    // 非表格结构（无竖线）也拒绝
    let mut r2 = valid_table();
    r2.content.markdown = Some("不是表格".into());
    assert!(r2.validate().is_err());
}

#[test]
fn formula_missing_latex_rejected() {
    let mut r = valid_formula();
    r.content.latex = None;
    assert!(r.validate().is_err());
}

#[test]
fn flowchart_nodes_and_edges_validated() {
    // Arrange：合法图结构
    let r = AiEnhanceResponse {
        response_type: AiRequestType::Flowchart,
        content: AiResponseContent {
            nodes: Some(vec![
                AiNode { id: "n1".into(), text: "开始".into(), edges: vec!["n2".into()] },
                AiNode { id: "n2".into(), text: "结束".into(), edges: vec![] },
            ]),
            ..Default::default()
        },
        confidence: 0.8,
    };
    // Act/Assert：合法通过
    assert!(r.validate().is_ok());
    // 悬空边 → 拒绝
    let mut bad = r.clone();
    bad.content.nodes.as_mut().unwrap()[0].edges.push("n99".into());
    assert!(bad.validate().is_err());
    // 空节点列表 → 拒绝
    let mut empty = r.clone();
    empty.content.nodes = Some(vec![]);
    assert!(empty.validate().is_err());
    // 空 id → 拒绝
    let mut noid = r.clone();
    noid.content.nodes.as_mut().unwrap()[1].id = "  ".into();
    assert!(noid.validate().is_err());
}

#[test]
fn handwriting_and_chart_data_validation() {
    // Arrange：合法手写响应
    let r = AiEnhanceResponse {
        response_type: AiRequestType::Handwriting,
        content: AiResponseContent { handwriting: Some("手写笔记内容".into()), ..Default::default() },
        confidence: 0.7,
    };
    assert!(r.validate().is_ok());
    // 空手写 → 拒绝
    let mut bad = r.clone();
    bad.content.handwriting = None;
    assert!(bad.validate().is_err());
    // chart_data 同理
    let c = AiEnhanceResponse {
        response_type: AiRequestType::ChartData,
        content: AiResponseContent { chart_data: Some("2024,10\n2025,20".into()), ..Default::default() },
        confidence: 0.75,
    };
    assert!(c.validate().is_ok());
    let mut bad_c = c.clone();
    bad_c.content.chart_data = Some("   ".into());
    assert!(bad_c.validate().is_err());
}

#[test]
fn request_roundtrip_serialization() {
    // Arrange：请求完整字段
    let req = AiEnhanceRequest {
        request_type: AiRequestType::Table,
        source_ref: AiSourceRef {
            frame_id: Some(42),
            crop_image: Some("full/5000.webp".into()),
            crop: Some([0.1, 0.2, 0.5, 0.4]),
        },
        context: AiContext {
            prev_asr: Some("上一句".into()),
            next_asr: Some("下一句".into()),
        },
    };
    // Act：roundtrip
    let raw = serde_json::to_string(&req).unwrap();
    let back: AiEnhanceRequest = serde_json::from_str(&raw).unwrap();
    // Assert：无损
    assert_eq!(back, req);
}

#[test]
fn response_roundtrip_with_nodes() {
    // Arrange：图结构响应 roundtrip
    let r = AiEnhanceResponse {
        response_type: AiRequestType::Diagram,
        content: AiResponseContent {
            nodes: Some(vec![AiNode { id: "a".into(), text: "节点".into(), edges: vec![] }]),
            ..Default::default()
        },
        confidence: 0.9,
    };
    // Act
    let raw = serde_json::to_string(&r).unwrap();
    let back: AiEnhanceResponse = serde_json::from_str(&raw).unwrap();
    // Assert
    assert_eq!(back, r);
}

#[test]
fn malformed_json_deserialization_rejected() {
    // Act/Assert：畸形 JSON 反序列化失败（防御：不 panic）
    let bad = r#"{"response_type":"table","confidence":0.9}"#;
    assert!(serde_json::from_str::<AiEnhanceResponse>(bad).is_err());
    // 未知类型枚举 → 失败
    let unknown = r#"{"response_type":"unknown-type","content":{},"confidence":0.9}"#;
    assert!(serde_json::from_str::<AiEnhanceResponse>(unknown).is_err());
}
