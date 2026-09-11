//! @ai-context: 知识体系类型（v0.13.1 REQ-202~205 / v0.14）：体系、问题树节点、概念、模型、引用、图谱与审计。
//! @ai-context: 纯数据定义（0 impl / 0 IO / 0 副作用）；disciplines/items_json/stats_json 为存储态 JSON 文本，解析归调用方。
//! @ai-context: 由 types.rs 门面 `#[path]` 声明 + `pub use` 再导出 ⇒ crate::types::X 引用路径逐字不变。

use serde::{Deserialize, Serialize};

// ────────────────────────────────────────────────────────────
// 知识体系类型（v0.13.1 REQ-202~205；体系/节点/概念/模型/引用/审计）
// ────────────────────────────────────────────────────────────

/// 知识体系（体系是问题的容器——引用/节点/概念/模型都挂在体系上）。
///
/// @ai-context: 对应 knowledge_systems 表；kind 取 global/domain（command 层白名单校验），
///              global 全库唯一（唯一索引兜底）；node/concept/model 三计数由 list 查询
///              子查询填充（单查为 0——计数非本行数据，避免读写耦合）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSystem {
    pub id: i64,
    /// 父体系（体系可嵌套；None=顶层）
    pub parent_system_id: Option<i64>,
    pub name: String,
    /// global | domain
    pub kind: String,
    /// 核心问题（global 必填；command 层校验非空）
    pub core_question: Option<String>,
    /// active | watching | archived
    pub status: String,
    /// 体系内节点数（list 查询填充；单查为 0）
    #[serde(default)]
    pub node_count: i64,
    /// 体系内概念数（list 查询填充；单查为 0）
    #[serde(default)]
    pub concept_count: i64,
    /// 体系内模型数（list 查询填充；单查为 0）
    #[serde(default)]
    pub model_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 新建体系入参（id/时间戳/status 由数据层填充）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeSystem {
    pub name: String,
    /// global | domain（command 层白名单校验）
    pub kind: String,
    #[serde(default)]
    pub parent_system_id: Option<i64>,
    /// global 必填（command 层校验非空）
    #[serde(default)]
    pub core_question: Option<String>,
}

/// 知识问题树节点（扁平化存储，前端组树）。
///
/// @ai-context: 对应 knowledge_nodes 表；type 取 question/scenario/domain_entry；
///              parent_id 自引用（同级树），order_idx 为同级排序（前端拖拽序）。
/// @ai-context: v0.13.8 画布——canvas_x/y 为节点在画布上的 React Flow 位置
///              （左上角坐标；None=未布局，首次打开画布触发辐射布局批量初始化）。
///              serde(default) 保证旧前端/旧测试构造的 JSON 缺省字段不炸反序列化。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNode {
    pub id: i64,
    pub system_id: i64,
    /// 父节点（None=根；同级树根可多个）
    pub parent_id: Option<i64>,
    /// question | scenario | domain_entry
    #[serde(rename = "type")]
    pub r#type: String,
    pub text: String,
    pub order_idx: i64,
    /// active | watching | archived
    pub status: String,
    pub created_at: i64,
    /// 画布 X 坐标（v0.13.8；None=未布局——首次打开画布由前端辐射布局初始化）
    #[serde(default)]
    pub canvas_x: Option<f64>,
    /// 画布 Y 坐标（v0.13.8；与 canvas_x 成对）
    #[serde(default)]
    pub canvas_y: Option<f64>,
}

/// 新建节点入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeNode {
    pub system_id: i64,
    #[serde(default)]
    pub parent_id: Option<i64>,
    /// question | scenario | domain_entry
    #[serde(rename = "type")]
    pub r#type: String,
    pub text: String,
    #[serde(default)]
    pub order_idx: i64,
}

/// 知识概念（三问本质/边界/联系；name 全库唯一）。
///
/// @ai-context: 对应 knowledge_concepts 表；name UNIQUE 全局——交叉点判定前提
///              （概念跨体系复用靠同名命中）；status 取 core/watching/archived；
///              last_applied_at 为最近应用时刻（v0.13.3 应用记录接线，v0.13.1 置 None）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeConcept {
    pub id: i64,
    pub system_id: i64,
    /// 名称（全局唯一；command 层归一化后落库）
    pub name: String,
    /// 本质（三问：它是什么）
    pub essence: Option<String>,
    /// 边界（三问：它不是什么）
    pub boundary: Option<String>,
    /// 联系（三问：它与谁相关）
    pub relation: Option<String>,
    /// core | watching | archived
    pub status: String,
    /// 最近应用时刻（Unix 秒；None=从未应用）
    pub last_applied_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 新建概念入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeConcept {
    pub system_id: i64,
    pub name: String,
    #[serde(default)]
    pub essence: Option<String>,
    #[serde(default)]
    pub boundary: Option<String>,
    #[serde(default)]
    pub relation: Option<String>,
}

/// 知识模型（跨学科命题陈述，含生效/失效条件）。
///
/// @ai-context: 对应 knowledge_models 表；disciplines 为 JSON 数组文本（≥1 学科，
///              解析由调用方），claim/valid_when/invalid_when 为命题三要素；
///              cross_checks 为交叉校验 JSON（v0.13.1 预埋，可空）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeModel {
    pub id: i64,
    pub system_id: i64,
    pub name: String,
    /// JSON 数组文本（≥1 学科；存储态，非解析态）
    pub disciplines: String,
    /// 命题主张
    pub claim: Option<String>,
    /// 生效条件
    pub valid_when: Option<String>,
    /// 失效条件
    pub invalid_when: Option<String>,
    /// 交叉校验 JSON（v0.13.1 预埋，可空）
    pub cross_checks: Option<String>,
    /// active | watching | archived
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 新建模型入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeModel {
    pub system_id: i64,
    pub name: String,
    /// JSON 数组文本（≥1 学科；调用方序列化）
    pub disciplines: String,
    #[serde(default)]
    pub claim: Option<String>,
    #[serde(default)]
    pub valid_when: Option<String>,
    #[serde(default)]
    pub invalid_when: Option<String>,
    #[serde(default)]
    pub cross_checks: Option<String>,
}

/// 知识引用（体系↔外部内容的唯一引用通道）。
///
/// @ai-context: 对应 knowledge_links 表；node/concept/model 三向可空（至少一，
///              command 层校验）；target_type 白名单（note_group/note/flashcard/fragment）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLink {
    pub id: i64,
    pub system_id: i64,
    pub node_id: Option<i64>,
    pub concept_id: Option<i64>,
    pub model_id: Option<i64>,
    /// note_group | note | flashcard | fragment
    pub target_type: String,
    pub target_id: i64,
    pub created_at: i64,
}

/// 图谱节点（v0.14 C2 graph_snapshot；id 带类型前缀 `note:`/`concept:`/`model:`/`group:`——
/// 四表 id 空间独立，前端 parseGraphNodeKey 解析）。
///
/// @ai-context: color 为 B 子项目色板 id（None → 前端按 kind 类型色）；
///              system_id 仅供 concept/model 跳转体系页（note/group 恒 None）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    /// note | concept | model | group
    pub kind: String,
    pub label: String,
    pub color: Option<String>,
    /// 实体原始 id（跳转笔记页/过滤组用——不依赖解析 id 前缀）
    pub entity_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_id: Option<i64>,
}

/// 图谱边（v0.14 C2；type 三选一——link 引用 / trace 溯源 / belong 归属，前端图层开关过滤）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    /// link | trace | belong
    #[serde(rename = "type")]
    pub edge_type: String,
}

/// 图谱快照（v0.14 C2 graph_snapshot 单次拉取完整图谱——避免 N 次全量拉取）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphSnapshot {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// 新建引用入参。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeLink {
    pub system_id: i64,
    #[serde(default)]
    pub node_id: Option<i64>,
    #[serde(default)]
    pub concept_id: Option<i64>,
    #[serde(default)]
    pub model_id: Option<i64>,
    /// note_group | note | flashcard | fragment
    pub target_type: String,
    pub target_id: i64,
}

/// 知识审计记录（v0.13.1 仅留表；items/stats 自 v0.13.4 使用）。
///
/// @ai-context: 对应 knowledge_audits 表；created_at 为 Unix 秒。latest_audit_at_ms
///              为审计探测的毫秒口径读取（data 层换算），本结构体保存原始秒。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAudit {
    pub id: i64,
    pub system_id: i64,
    /// 审计条目 JSON（v0.13.4 起使用）
    pub items_json: String,
    /// 审计统计 JSON（默认 `{}`）
    pub stats_json: String,
    pub created_at: i64,
}
