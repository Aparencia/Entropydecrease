//! 产物块模型（REQ-052 / v0.5.0 M7，头脑风暴轮 5）。
//!
//! @ai-context: 一种原料，五种模板——ArtifactBlock 为产物体系最小单元：
//!              块**引用**原料不复制（refs 携带 segment/ocr_block 标识 + 时间戳），
//!              原料可回看、可重算（G1 派生视图地基）。
//! @ai-context: 纯数据定义 + JSON 序列化（serde），无副作用；
//!              五档案模板函数在 artifact_templates.rs（独立文件保持 ≤300 行）。
//! @ai-context: source 标记来源：local（本地规则）/ ai_enhanced（V1.0 AI 补缝）/
//!              placeholder（占位：AI 增强待 V1.0 或诚实降级标记）。

use serde::{Deserialize, Serialize};

use crate::formula_reconstruct::FormulaBlock;
use crate::table_reconstruct::TableBlock;

/// 块类型枚举（全栈统一业务术语；渲染器按此分发渲染组件）。
///
/// @ai-context: serde kebab-case 对连续大写（QAPair）会拆出 "q-a-pair"——
///              显式 rename 钉住契约（前端/DB 依赖稳定标识）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactKind {
    /// 段落（B5 书面化后的转写段）
    Paragraph,
    /// 关键图（内嵌产物正文，每章节 ≤3 张）
    KeyImage,
    /// 表格（REQ-049 重建产物）
    Table,
    /// 公式（REQ-050 重建产物）
    Formula,
    /// 术语锚点（C3 术语表交叉候选）
    TermAnchor,
    /// 小结占位（章节边界处自动插入，C1）
    Summary,
    /// 步骤卡（实操档案：帧 + 说明 + 时间范围）
    StepCard,
    /// 观点主张（口播档案）
    Claim,
    /// 金句引用（口播档案）
    Quote,
    /// 问答对（访谈档案）
    #[serde(rename = "qa-pair")]
    QAPair,
    /// 重点（C2 标注候选）
    Highlight,
    /// 决议（会议档案触发词）
    Decision,
    /// 待办（会议档案触发词）
    Todo,
    /// 议程小节（会议档案）
    AgendaSection,
    /// 投屏截图归档（会议档案）
    ScreenShot,
    /// 代码块（code 版面区域）
    CodeBlock,
}

/// 原料引用（块引用而非复制；全字段可选——按块类型取用）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct BlockRefs {
    /// 转写段 id（session_segments.id）
    pub segment_id: Option<i64>,
    /// OCR 块 id（session_ocr_blocks.id）
    pub ocr_block_id: Option<i64>,
    /// 帧时间戳（ms，图片/步骤卡引用；产物 ↔ 时间轴双向定位）
    pub frame_ms: Option<u64>,
}

/// 块载荷（按 kind 取用；无载荷类型用 Unit）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum BlockPayload {
    /// Paragraph / Summary / Claim / Quote / Highlight / Decision / Todo / AgendaSection
    Text(String),
    /// KeyImage / ScreenShot：图片相对路径（session-images 目录内）
    Image(String),
    /// Table（REQ-049 产物）
    Table(TableBlock),
    /// Formula（REQ-050 产物）
    Formula(FormulaBlock),
    /// TermAnchor：术语 + 可选释义
    Term { term: String, definition: Option<String> },
    /// StepCard：帧图 + 说明 + 时间范围
    Step {
        image: String,
        description: String,
        start_ms: u64,
        end_ms: u64,
        /// REQ-123（v0.7.0 M2）：步骤标签（跟练档案步骤边界；None=旧数据）
        label: Option<String>,
        /// REQ-123：步骤边界理由（cue/practice/demo 等信号来源；None=旧数据）
        reason: Option<String>,
    },
    /// QAPair：问 + 答
    QA { question: String, answer: String },
    /// CodeBlock：代码 + 可选语言 + 展示段时间范围（REQ-121）
    Code {
        code: String,
        language: Option<String>,
        /// REQ-121：代码展示段起始时间（ms；None=旧数据）
        time_ms: Option<u64>,
        /// REQ-121：代码展示段结束时间（ms；None=旧数据）
        end_ms: Option<u64>,
    },
}

/// 块来源标记（永远可辨认：AI 增强块必须带此标记）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BlockSource {
    /// 本地规则产物（默认）
    Local,
    /// AI 补缝产物（V1.0 实装；0.5.0 仅协议/mock）
    AiEnhanced,
    /// 占位（AI 增强待 V1.0 / 重建失败诚实降级）
    Placeholder,
}

/// 产物块（存储：artifact_blocks 表，会话 1:1 产物，块有序）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ArtifactBlock {
    /// DB 行 id（构建阶段为 0，落库后回填）
    pub id: i64,
    pub kind: ArtifactKind,
    pub refs: BlockRefs,
    pub payload: BlockPayload,
    /// 块顺序（产物视图渲染序）
    pub order: u32,
    pub source: BlockSource,
}

impl ArtifactBlock {
    /// 构建块辅助（id 由落库回填）。
    pub fn new(kind: ArtifactKind, order: u32, payload: BlockPayload) -> Self {
        Self { id: 0, kind, refs: BlockRefs::default(), payload, order, source: BlockSource::Local }
    }
}

/// 会话产物（1:1 会话；块有序）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionArtifact {
    pub session_id: i64,
    pub profile: String,
    /// 按 order 升序的块
    pub blocks: Vec<ArtifactBlock>,
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "artifact_tests.rs"]
mod tests;
