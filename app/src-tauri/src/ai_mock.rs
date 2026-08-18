//! 补缝式 AI mock 适配器（REQ-055 / v0.5.0 M8）。
//!
//! @ai-context: 本地"假 AI"——按请求类型规则生成合法响应，验证渲染链路与
//!              块合并逻辑（协议 schema 校验通过后才合并）。云端实装（V1.0）
//!              只需替换本适配器实现，协议/判定器/护栏零改动。
//! @ai-context: mock 响应对请求类型做**结构化**回复（非文本糊弄），
//!              以便前端渲染链路与产物块合并逻辑得到真实结构测试。

use crate::ai_protocol::{AiEnhanceRequest, AiEnhanceResponse, AiRequestType, AiResponseContent};

/// mock 适配器（无状态；后续云端适配器实现同一 trait）。
pub struct AiMockAdapter;

impl AiMockAdapter {
    /// 处理请求 → 合法响应（mock 规则生成）。
    ///
    /// @ai-context: 响应必须通过 AiEnhanceResponse::validate（schema 校验）——
    ///              mock 的作用就是持续验证这条校验链。
    pub fn enhance(&self, request: &AiEnhanceRequest) -> AiEnhanceResponse {
        match request.request_type {
            AiRequestType::Table => AiEnhanceResponse {
                response_type: AiRequestType::Table,
                content: AiResponseContent {
                    markdown: Some("| 项目 | 数值 |\n|---|---|\n| 示例 | 1 |".to_string()),
                    ..Default::default()
                },
                confidence: 0.95,
            },
            AiRequestType::FormulaLatex => AiEnhanceResponse {
                response_type: AiRequestType::FormulaLatex,
                content: AiResponseContent {
                    latex: Some("x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}".to_string()),
                    ..Default::default()
                },
                confidence: 0.9,
            },
            AiRequestType::Flowchart | AiRequestType::Diagram => AiEnhanceResponse {
                response_type: request.request_type,
                content: AiResponseContent {
                    nodes: Some(vec![
                        crate::ai_protocol::AiNode {
                            id: "n1".to_string(),
                            text: "开始".to_string(),
                            edges: vec!["n2".to_string()],
                        },
                        crate::ai_protocol::AiNode {
                            id: "n2".to_string(),
                            text: "结束".to_string(),
                            edges: vec![],
                        },
                    ]),
                    ..Default::default()
                },
                confidence: 0.85,
            },
            AiRequestType::Handwriting => AiEnhanceResponse {
                response_type: AiRequestType::Handwriting,
                content: AiResponseContent {
                    handwriting: Some("手写内容（mock 转写）".to_string()),
                    ..Default::default()
                },
                confidence: 0.8,
            },
            AiRequestType::ChartData => AiEnhanceResponse {
                response_type: AiRequestType::ChartData,
                content: AiResponseContent {
                    chart_data: Some("类别,数值\nA,10\nB,20".to_string()),
                    ..Default::default()
                },
                confidence: 0.85,
            },
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_mock_tests.rs"]
mod tests;
