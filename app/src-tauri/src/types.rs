//! 共享领域类型。
//!
//! @ai-context: 本模块定义课堂助手提取链路与笔记模块之间的数据契约。
//! @ai-context: 业务术语全栈统一：transcript=转写段、ocr_block=画面识别块、note=笔记。
//! @ai-context: 纯数据定义，无副作用，可被 asr/ocr/concat/db/commands 各层复用。
//! @ai-context: 单文件 ≤300 行约束（AGENTS.md §3）下按域拆至 types_*.rs，本文件只保留
//!              `#[path]` 子模块声明 + `pub use` 再导出 ⇒ crate::types::X 对全仓引用面零改动。

use serde::{Deserialize, Serialize};

#[path = "types_session.rs"]
mod types_session;
#[path = "types_knowledge.rs"]
mod types_knowledge;
#[path = "types_note.rs"]
mod types_note;
#[path = "types_ocr.rs"]
mod types_ocr;
#[path = "types_extract.rs"]
mod types_extract;

pub use types_session::*;
pub use types_knowledge::*;
pub use types_note::*;
pub use types_ocr::*;
pub use types_extract::*;

/// 决策/应用记录（v0.13.3 REQ-208；一表两面，kind 区分）。
///
/// @ai-context: 对应 knowledge_decisions 表——decision=思辨面（决策），application=学习面
///              （记一次使用）；一表两面不双表。used_refs 为 JSON 文本（存储态，原样保存，
///              结构契约由知识纯函数 validate_decision_input 校验；解析辅助见 UsedRefs）。
///              decided_at 为决策/应用时刻（Unix 秒，数据层填充）。
/// @ai-context: M1 类型供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDecision {
    pub id: i64,
    /// decision / application
    pub kind: String,
    /// 所属体系（None=未挂体系，仅体系级应用允许）
    pub system_id: Option<i64>,
    /// 关联问题树节点（None=未挂节点）
    pub question_id: Option<i64>,
    /// 引用 JSON 文本（存储态；引用必填，command 层拒绝空）
    pub used_refs: String,
    /// 决策内容/应用动作（必填）
    pub content: String,
    /// 预期结果（四行法；None=未填）
    pub expectation: Option<String>,
    /// 实际结果（四行法；None=未填）
    pub actual: Option<String>,
    /// 反思（四行法：如果重来改变什么；None=未填）
    pub reflection: Option<String>,
    /// 决策/应用时刻（Unix 秒，数据层填充）
    pub decided_at: i64,
    pub created_at: i64,
}

/// 新建决策/应用记录入参（id/decided_at/created_at 由数据层填充；kind 由调用方传入）。
/// @ai-context: M1 类型供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeDecision {
    /// decision / application（调用方传入；command 层白名单校验）
    pub kind: String,
    #[serde(default)]
    pub system_id: Option<i64>,
    #[serde(default)]
    pub question_id: Option<i64>,
    /// 引用 JSON 文本（必填非空——command 层经 validate_decision_input 校验）
    pub used_refs: String,
    /// 决策内容/应用动作（必填）
    pub content: String,
    #[serde(default)]
    pub expectation: Option<String>,
    #[serde(default)]
    pub actual: Option<String>,
    #[serde(default)]
    pub reflection: Option<String>,
}

/// used_refs JSON 结构的解析辅助（仅作解析；DB 仍存原始 JSON 文本）。
///
/// @ai-context: 一表包全引用——体系实体（node/concept/model）＋四类证据引用
///              （group/card/note/fragment，即四类 LinkTarget）。serde camelCase；
///              结构契约（键白名单/正整数/非空）由 validate_decision_input（知识纯函数）校验，
///              本结构仅供 command 层读取 used_refs 时反序列化。
/// @ai-context: M1 类型供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#[allow(dead_code)]
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsedRefs {
    #[serde(default)]
    pub node_ids: Vec<i64>,
    #[serde(default)]
    pub concept_ids: Vec<i64>,
    #[serde(default)]
    pub model_ids: Vec<i64>,
    #[serde(default)]
    pub group_id: Option<i64>,
    #[serde(default)]
    pub card_id: Option<i64>,
    #[serde(default)]
    pub note_id: Option<i64>,
    #[serde(default)]
    pub fragment_id: Option<i64>,
}

// ────────────────────────────────────────────────────────────
// v0.13.8 画布：节点位置与视口契约
//
// @ai-context: 画布=手动画布非自动图（REQ-029 P3 维持）——节点位置由用户拖拽决定，
//              首次打开时以辐射布局初始化（BFS 算法），算法只在首次生效。
//              坐标口径：React Flow 左上角（node.position 语义），与 DB 存储一致。
// ────────────────────────────────────────────────────────────

/// 画布节点位置（batch_initialize_canvas_positions 入参；x/y 为左上角坐标）。
///
/// @ai-context: 三表 id 空间独立（nodes/concepts/models），但本入参仅服务
///              knowledge_nodes（概念/模型无画布列，属浮动参照——每次打开重排）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNodePosition {
    pub node_id: i64,
    pub x: f64,
    pub y: f64,
}

/// 画布视口（get_canvas_viewport 返回；save_canvas_viewport 存储态）。
///
/// @ai-context: 切回画布时经 setViewport 恢复；zoom 必须 >0（错误缩放直接拒绝，
///              防损坏值放大/缩小到不可见）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasViewport {
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub zoom: f64,
}

/// 画布偏好（v0.14.1：连线样式/箭头/布局算法；按体系持久化）。
///
/// @ai-context: 枚举白名单在命令层校验（EDGE_STYLES/LAYOUT_ALGORITHMS——前后端同
///              口径，未知值拒绝入库）；states 行可能不存在（首开）→ 前端回落默认值
///              （smoothstep + radial，与迁移 DEFAULT 一致）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasPrefs {
    pub edge_style: String,
    pub edge_arrows: bool,
    pub layout_algorithm: String,
}
