//! 补缝式 AI 返回协议 schema（REQ-055 / v0.5.0 M8，依据 ADR-010）。
//!
//! @ai-context: 与云端（V1.0 Qwen-VL）的契约先行定义——本地失败块（低置信/
//!              unknown/重建失败）→ ai_candidate → 云端返回结构化内容 →
//!              本地校验后合并进产物块。**schema 强校验**：非法响应直接丢弃
//!              （保留本地结果），来源标记 ai-enhanced 永远可辨认。
//! @ai-context: 纯数据定义 + serde 校验函数；云端未实装（V1.0），
//!              mock 适配器（ai_mock.rs）产出合法响应验证渲染链路。

use serde::{Deserialize, Serialize};

/// AI 补缝请求（单块裁剪图 + 最小上下文）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiEnhanceRequest {
    /// 请求类型（与本地失败类型对应）
    pub request_type: AiRequestType,
    /// 源引用（裁剪图 + 最小上下文）
    pub source_ref: AiSourceRef,
    /// 最小上下文（前后 ASR 文本，可关）
    pub context: AiContext,
}

/// 请求类型（本地判定器产出的失败类型）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiRequestType {
    /// 表格重建失败
    Table,
    /// 公式重建失败（含手写）
    FormulaLatex,
    /// 流程图语义重建
    Flowchart,
    /// 图表/示意图
    Diagram,
    /// 手写内容
    Handwriting,
    /// 图表数据提取
    ChartData,
}

/// 源引用：frame_id + 裁剪图（相对路径或归一化坐标）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiSourceRef {
    pub frame_id: Option<i64>,
    /// 裁剪图相对路径（会话图片目录内；"此块将上传"预览用）
    pub crop_image: Option<String>,
    /// 归一化裁剪坐标 [x, y, w, h]（0-1）
    pub crop: Option<[f32; 4]>,
}

/// 最小上下文（前后 ASR 文本）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AiContext {
    pub prev_asr: Option<String>,
    pub next_asr: Option<String>,
}

/// AI 补缝响应（结构化内容；与本地块同构，渲染器统一处理）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiEnhanceResponse {
    /// 内容类型（与请求类型对应）
    pub response_type: AiRequestType,
    /// 结构化内容（各类型字段；按类型取用）
    pub content: AiResponseContent,
    /// 置信度 0.0-1.0
    pub confidence: f32,
}

/// 响应结构化内容（按 response_type 取用；serde 校验保证合法结构）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AiResponseContent {
    /// table：Markdown 表格
    pub markdown: Option<String>,
    /// formula_latex：LaTeX 片段
    pub latex: Option<String>,
    /// flowchart/diagram：节点边结构
    pub nodes: Option<Vec<AiNode>>,
    /// handwriting：手写转写文本
    pub handwriting: Option<String>,
    /// chart_data：表格化数据
    pub chart_data: Option<String>,
}

/// 图结构节点（flowchart/diagram）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiNode {
    pub id: String,
    pub text: String,
    /// 出边（目标节点 id）
    pub edges: Vec<String>,
}

impl AiEnhanceResponse {
    /// schema 强校验（纯函数）：字段合法性。
    ///
    /// @ai-context: 校验失败 → 丢弃 AI 结果保留本地结果（防御性编程铁律）。
    /// @ai-context: 规则：confidence ∈ [0,1]；各类型必须有对应内容字段非空；
    ///              节点 id 非空且 edges 引用存在的 id。
    pub fn validate(&self) -> Result<(), String> {
        if !(0.0..=1.0).contains(&self.confidence) {
            return Err(format!("置信度越界: {}", self.confidence));
        }
        match self.response_type {
            AiRequestType::Table => {
                let md = self.content.markdown.as_deref().unwrap_or("");
                if md.trim().is_empty() || !md.contains('|') {
                    return Err("table 响应缺少合法 Markdown 表格".to_string());
                }
            }
            AiRequestType::FormulaLatex => {
                if self.content.latex.as_deref().unwrap_or("").trim().is_empty() {
                    return Err("formula_latex 响应缺少 LaTeX".to_string());
                }
            }
            AiRequestType::Flowchart | AiRequestType::Diagram => {
                let nodes = self.content.nodes.as_deref().unwrap_or(&[]);
                if nodes.is_empty() {
                    return Err("图结构响应缺少节点".to_string());
                }
                let ids: std::collections::HashSet<&str> =
                    nodes.iter().map(|n| n.id.as_str()).collect();
                for n in nodes {
                    if n.id.trim().is_empty() {
                        return Err("节点 id 为空".to_string());
                    }
                    for e in &n.edges {
                        if !ids.contains(e.as_str()) {
                            return Err(format!("边引用不存在节点: {}", e));
                        }
                    }
                }
            }
            AiRequestType::Handwriting => {
                if self.content.handwriting.as_deref().unwrap_or("").trim().is_empty() {
                    return Err("handwriting 响应缺少转写文本".to_string());
                }
            }
            AiRequestType::ChartData => {
                if self.content.chart_data.as_deref().unwrap_or("").trim().is_empty() {
                    return Err("chart_data 响应缺少数据".to_string());
                }
            }
        }
        Ok(())
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_protocol_tests.rs"]
mod tests;
