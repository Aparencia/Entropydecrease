//! 补缝式 AI mock 适配器（REQ-055 / v0.5.0 M8；v0.6.0 M1 REQ-085 文本复核）。
//!
//! @ai-context: 本地"假 AI"——按请求类型规则生成合法响应，验证渲染链路与
//!              块合并逻辑（协议 schema 校验通过后才合并）。云端实装（V1.0）
//!              只需替换本适配器实现，协议/判定器/护栏零改动。
//! @ai-context: mock 响应对请求类型做**结构化**回复（非文本糊弄），
//!              以便前端渲染链路与产物块合并逻辑得到真实结构测试。
//! @ai-context: review_text 为 REQ-085 文本复核的 mock 三态判定（规则化）——
//!              合法响应持续验证 TextFilterResponse::validate 校验链。

use crate::ai_protocol::{
    AiEnhanceRequest, AiEnhanceResponse, AiRequestType, AiResponseContent, TextFilterAction,
    TextFilterDecision, TextFilterRequest, TextFilterResponse,
};
use crate::ai_refine_protocol::{
    AiRefineBlock, AiRefineBlockType, AiRefineRequest, AiRefineResponse, AiRefineSection,
};
use crate::ai_enrich_protocol::{AiEnrichBlock, AiEnrichKind, AiEnrichRequest, AiEnrichResponse};

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
            // 文本复核走 review_text 独立通道；此处仅保证 match 穷尽——
            // 该响应会被 AiEnhanceResponse::validate 拒绝（防御兜底）
            AiRequestType::TextFilter => AiEnhanceResponse {
                response_type: AiRequestType::TextFilter,
                content: AiResponseContent::default(),
                confidence: 0.0,
            },
        }
    }

    /// 文本复核 mock（REQ-085）：规则化三态判定。
    ///
    /// @ai-context: 规则：口头禅/寒暄（短 + 含填充词或问候前缀）→ delete；
    ///              连词开头且有 prev → merge(prev)；技术词/数字 → keep；
    ///              其余 keep。全部通过 TextFilterResponse::validate。
    pub fn review_text(&self, request: &TextFilterRequest) -> TextFilterResponse {
        let decisions: Vec<TextFilterDecision> = request
            .segments
            .iter()
            .map(|seg| {
                let text = seg.text.trim();
                let (action, merge_with, reason, confidence) = if looks_filler_or_greeting(text) {
                    (TextFilterAction::Delete, None, "口头禅/寒暄（mock）".to_string(), 0.9)
                } else if seg.prev.is_some() && (text.starts_with("所以") || text.starts_with("然后")) {
                    (TextFilterAction::Merge, Some("prev".to_string()), "截断句衔接上一段（mock）".to_string(), 0.8)
                } else {
                    (TextFilterAction::Keep, None, "技术内容保留（mock）".to_string(), 0.7)
                };
                TextFilterDecision {
                    segment_id: seg.segment_id,
                    action,
                    confidence,
                    reason,
                    merge_with,
                }
            })
            .collect();
        TextFilterResponse { decisions }
    }

    /// 精修 mock（REQ-141）：规则化整理——按输入章节组织 + 高亮标注；
    /// 响应通过 AiRefineResponse::validate（持续验证精修协议校验链）。
    ///
    /// @ai-context: 精修=整理不创作语义在 mock 中体现：只重组不新增事实
    ///              （content 原样作为 paragraph，标 mock 高亮）；M5 契约
    ///              测试/mock 全链路消费本方法。
    pub fn refine(&self, request: &AiRefineRequest) -> AiRefineResponse {
        let headings: Vec<String> = if request.chapters.is_empty() {
            vec!["笔记".to_string()]
        } else {
            request.chapters.clone()
        };
        let sections: Vec<AiRefineSection> = headings
            .iter()
            .map(|heading| AiRefineSection {
                heading: heading.clone(),
                blocks: vec![
                    AiRefineBlock {
                        block_type: AiRefineBlockType::Paragraph,
                        content: request.content.clone(),
                        anchor_ref: Some(heading.clone()),
                    },
                    AiRefineBlock {
                        block_type: AiRefineBlockType::Highlight,
                        content: "（mock 精修）已整理，未增补课程外内容".to_string(),
                        anchor_ref: None,
                    },
                ],
            })
            .collect();
        AiRefineResponse { sections }
    }

    /// 知识补充 mock（REQ-142）：按勾选子项规则化产出合法块数组；
    /// 响应通过 AiEnrichResponse::validate（深度块带锚点/广度块无锚点/
    /// B6 无链接——持续验证补充协议校验链）。
    pub fn enrich(&self, _request: &AiEnrichRequest, selected: &[AiEnrichKind]) -> AiEnrichResponse {
        let blocks: Vec<AiEnrichBlock> = selected
            .iter()
            .map(|kind| AiEnrichBlock {
                kind: *kind,
                anchor_ref: if kind.is_depth() {
                    Some("笔记".to_string())
                } else {
                    None
                },
                heading: format!("{}（mock）", kind.label()),
                content: format!("{} 的 mock 补充内容", kind.label()),
                confidence: 0.9,
            })
            .collect();
        AiEnrichResponse { blocks }
    }
}

/// 口头禅/寒暄特征（mock 判定用）：短句且含填充词或问候前缀。
fn looks_filler_or_greeting(text: &str) -> bool {
    text.chars().count() <= 8
        && (["嗯", "那个", "就是", "对吧", "哈哈"].iter().any(|w| text.contains(w))
            || text.starts_with("大家好"))
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_mock_tests.rs"]
mod tests;
