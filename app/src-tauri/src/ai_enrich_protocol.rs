//! 知识补充协议（REQ-142，v0.8.0 M3）。
//!
//! @ai-context: 补充=生成新内容（与精修"整理不创作"严格区分——补充是模型
//!              外部知识，幻觉风险高）：九子项（深度 D1-D3 + 广度 B1-B6），
//!              一次批量返回块数组（省请求）；schema 强校验（kind 枚举/内容
//!              非空/深度块锚点必填/B6 无链接——防幻觉约束，规划 §M3 第 2 点）。
//! @ai-context: 混合落位（深度就近插入+锚点溯源、广度聚合扩展区）与渲染
//!              纯函数在 enrich_placement.rs（本模块只定义协议与校验）。

use serde::{Deserialize, Serialize};

/// 补充子项（九项：深度 3 + 广度 6；kebab-case serde 契约）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiEnrichKind {
    /// 深度：概念展开（就近插入引用章节之下）
    D1,
    /// 深度：步骤补全
    D2,
    /// 深度：例子补全
    D3,
    /// 广度：前置知识（聚合笔记尾部扩展区）
    B1,
    /// 广度：进阶方向
    B2,
    /// 广度：横向关联
    B3,
    /// 广度：对比辨析
    B4,
    /// 广度：实践建议
    B5,
    /// 广度：资源推荐（仅标题不输出链接——防幻觉约束）
    B6,
}

impl AiEnrichKind {
    /// 全部九子项（勾选面板顺序）。
    pub fn all() -> [AiEnrichKind; 9] {
        [
            AiEnrichKind::D1, AiEnrichKind::D2, AiEnrichKind::D3,
            AiEnrichKind::B1, AiEnrichKind::B2, AiEnrichKind::B3,
            AiEnrichKind::B4, AiEnrichKind::B5, AiEnrichKind::B6,
        ]
    }

    /// 深度类（就近插入引用章节之下——锚点必填）。
    pub fn is_depth(self) -> bool {
        matches!(self, AiEnrichKind::D1 | AiEnrichKind::D2 | AiEnrichKind::D3)
    }

    /// 广度类（聚合笔记尾部扩展区——锚点应空）。
    pub fn is_breadth(self) -> bool {
        !self.is_depth()
    }

    /// 前端展示名。
    pub fn label(self) -> &'static str {
        match self {
            AiEnrichKind::D1 => "概念展开",
            AiEnrichKind::D2 => "步骤补全",
            AiEnrichKind::D3 => "例子补全",
            AiEnrichKind::B1 => "前置知识",
            AiEnrichKind::B2 => "进阶方向",
            AiEnrichKind::B3 => "横向关联",
            AiEnrichKind::B4 => "对比辨析",
            AiEnrichKind::B5 => "实践建议",
            AiEnrichKind::B6 => "资源推荐",
        }
    }
}

/// 补充请求（一次批量返回全部选定子项）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichRequest {
    pub note_content: String,
    pub selected_kinds: Vec<AiEnrichKind>,
    pub profile: String,
}

/// 补充块（kind/锚点/标题/内容/置信度）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichBlock {
    pub kind: AiEnrichKind,
    /// 锚点（深度块必填：引用真实章节标题；广度块应空）
    pub anchor_ref: Option<String>,
    pub heading: String,
    pub content: String,
    /// 置信度 0.0-1.0（低置信块渲染时标注"需核实"）
    pub confidence: f32,
}

/// 补充响应（块数组；一次批量返回）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichResponse {
    pub blocks: Vec<AiEnrichBlock>,
}

impl AiEnrichResponse {
    /// 单块内容上限（防单块刷屏）。
    const BLOCK_MAX_CHARS: usize = 3000;
    /// 响应总块数上限（九子项 + 防刷屏）。
    const BLOCKS_MAX: usize = 50;

    /// schema 强校验（纯函数；失败 → 丢弃 AI 结果回退——防御性编程铁律）。
    ///
    /// @ai-context: 规则：kind ∈ 选定子项；深度块 anchor_ref 必填（锚点溯源）、
    ///              广度块 anchor_ref 应空（聚合扩展区）；heading/content 非空
    ///              有界；B6 块 content 禁止 URL 模式（仅标题不输出链接——
    ///              防幻觉约束，规划验收）；confidence ∈ [0,1]。
    pub fn validate(&self, selected: &[AiEnrichKind]) -> Result<(), String> {
        if self.blocks.is_empty() {
            return Err("补充响应缺少内容块".to_string());
        }
        if self.blocks.len() > Self::BLOCKS_MAX {
            return Err(format!(
                "补充块数超上限（{} > {}）",
                self.blocks.len(),
                Self::BLOCKS_MAX
            ));
        }
        for b in &self.blocks {
            if !selected.contains(&b.kind) {
                return Err(format!("返回了未请求的子项: {:?}", b.kind));
            }
            if !(0.0..=1.0).contains(&b.confidence) {
                return Err(format!("置信度越界: {}", b.confidence));
            }
            let heading = b.heading.trim();
            let content = b.content.trim();
            if heading.is_empty() || heading.chars().count() > 200 {
                return Err("块标题为空或超长".to_string());
            }
            if content.is_empty() || content.chars().count() > Self::BLOCK_MAX_CHARS {
                return Err("块内容为空或超长".to_string());
            }
            if b.kind.is_depth()
                && b.anchor_ref.as_deref().map(str::trim).unwrap_or("").is_empty()
            {
                return Err(format!(
                    "深度块「{}」缺少锚点引用（必须溯源到章节）",
                    b.kind.label()
                ));
            }
            if b.kind.is_breadth() && b.anchor_ref.is_some() {
                return Err(format!("广度块「{}」不应携带锚点（聚合扩展区）", b.kind.label()));
            }
            if b.kind == AiEnrichKind::B6 && contains_url(content) {
                return Err("B6 资源推荐禁止输出链接（仅标题——防幻觉约束）".to_string());
            }
        }
        Ok(())
    }
}

/// 是否含 URL 模式（B6 防幻觉：http(s)/www 前缀）。
fn contains_url(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.contains("http://") || lower.contains("https://") || lower.contains("www.")
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_enrich_protocol_tests.rs"]
mod tests;
