//! 学习目标层原子类型（v0.18.0 REQ-248；意图层数据契约）。
//!
//! @ai-context: 目标是学习循环的「意图层」对象——把已交付资产（组/闪卡/FSRS/
//!              周契约/组结算/概念库）串成「学会 Python」这样可追踪、可毕业、
//!              可复盘的目标（规格 §一）。本模块只定义 DTO 与 JSON 契约
//!              （success_criteria_json / intent_json 的 serde 结构），
//!              纯逻辑在 goal_interview/goal_rules/goal_progress，DB 在 db_goals。
//! @ai-context: 状态为 TEXT 无 CHECK（项目惯例：命令层白名单校验，见
//!              GROUP_KINDS 先例）；四态 active/paused/graduated/abandoned
//!              （无 draft——访谈中断不落库，优化评审 #2）。
//! @ai-context: 判据配方为「快照」（毕业后冻结）；进度信号一律现算
//!              （一致性契约：禁止双写）。

use serde::{Deserialize, Serialize};

/// 目标状态：进行中（v0.18.0 创建即 active，无 draft 仪式）
pub const GOAL_ACTIVE: &str = "active";
/// 目标状态：已暂停（M2 显式动作）
pub const GOAL_PAUSED: &str = "paused";
/// 目标状态：已毕业（M2 毕业仪式确认后）
pub const GOAL_GRADUATED: &str = "graduated";
/// 目标状态：已放弃（M2 显式动作+可选原因，无惩罚）
pub const GOAL_ABANDONED: &str = "abandoned";

/// 里程碑状态：待办
pub const MILESTONE_PENDING: &str = "pending";
/// 里程碑状态：进行中
pub const MILESTONE_IN_PROGRESS: &str = "in_progress";
/// 里程碑状态：完成（绑组结算型随结算自动通过）
pub const MILESTONE_DONE: &str = "done";
/// 里程碑状态：跳过（废弃计划项显式跳过）
pub const MILESTONE_SKIPPED: &str = "skipped";

/// 里程碑判据类型：手动确认
pub const CRITERIA_MANUAL: &str = "manual";
/// 里程碑判据类型：随组结算自动通过（ref_group_id 非空）
pub const CRITERIA_GROUP_SETTLED: &str = "group_settled";
/// 里程碑判据类型：自测通过（M3 真实化；M1 仅登记占位契约）。
/// 登记豁免 dead_code：自测链路 M3 落地后启用（K 契约占位先例
/// KnowledgeDecision M1 类型机制先行）。
#[allow(dead_code)]
pub const CRITERIA_SELF_TEST: &str = "self_test";

/// 判据档位：能上手（里程碑 + 主组结算 ×1）
pub const TIER_HANDS_ON: &str = "hands_on";
/// 判据档位：能独立完成实例（里程碑 + 项目组结算 + 应用记录 ≥1）
pub const TIER_SOLO_PROJECT: &str = "solo_project";
/// 判据档位：能教别人/证书通过（里程碑 + 组结算 + 自测 ≥80%——M1 占位不判）
pub const TIER_TEACH_CERT: &str = "teach_cert";
/// 判据档位：说不清 → 默认档（里程碑 + ≥1 组结算 + 近 90 天复习活跃度）
pub const TIER_DEFAULT: &str = "default";

/// 目标（goals 表行；success_criteria_json/intent_json 为 JSON 文本存储态）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: i64,
    pub name: String,
    /// 领域标签（复用 DomainKind 15 类 kebab-case；None=未指定）
    pub domain_tag: Option<String>,
    /// 四态状态（active/paused/graduated/abandoned）
    pub status: String,
    /// 中周期锚点（Unix 秒；非截止日 KPI；None=无期限——合法）
    pub horizon_end: Option<i64>,
    /// 判据配方 JSON 文本（SuccessCriteria 序列化；毕业后冻结）
    pub success_criteria_json: String,
    /// 访谈答案 JSON 文本（GoalIntent 序列化；'{}' 合法=快速模式）
    pub intent_json: String,
    /// 创建时刻 = 开始时间（"第 6/12 周"进度由 created_at 推算）
    pub created_at: i64,
    /// 毕业/放弃时刻（None=未终止）
    pub completed_at: Option<i64>,
    pub updated_at: i64,
}

/// 目标里程碑（goal_milestones 表行）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoalMilestone {
    pub id: i64,
    pub goal_id: i64,
    pub title: String,
    /// 预期完成时刻（Unix 秒；None=无期限）
    pub due_at: Option<i64>,
    pub order_idx: i64,
    /// pending/in_progress/done/skipped
    pub status: String,
    /// manual/group_settled/self_test
    pub criteria_type: String,
    /// 绑定时引用组（criteria_type=group_settled 时非空；组删除 SET NULL→降级手动）
    pub ref_group_id: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

/// 新建目标入参（id/时间戳由数据层填充；里程碑与绑定同事务落库）。
#[derive(Debug, Clone)]
pub struct NewGoal {
    pub name: String,
    pub domain_tag: Option<String>,
    pub horizon_end: Option<i64>,
    /// SuccessCriteria 序列化文本（命令层经 goal_interview::derive_criteria 生成）
    pub success_criteria_json: String,
    /// GoalIntent 序列化文本（'{}' 合法=快速模式未访谈）
    pub intent_json: String,
    /// 新建里程碑（标题/due_at 已由命令层按草案换算）
    pub milestones: Vec<NewMilestone>,
    /// 初始绑定组（访谈第 4 步预勾选；可为空）
    pub group_ids: Vec<i64>,
}

/// 新建里程碑入参。
#[derive(Debug, Clone)]
pub struct NewMilestone {
    pub title: String,
    pub due_at: Option<i64>,
    pub order_idx: i64,
    pub criteria_type: String,
    pub ref_group_id: Option<i64>,
}

/// 判据配方（success_criteria_json 的 serde 契约；毕业后冻结的快照）。
///
/// @ai-context: 配方由访谈第 3 步「做到什么程度算会了」推导（规格 §六表），
///              字段为可观测信号的要求值——进度信号全部现算后与之比对
///              （goal_rules::graduation_readiness）。「档位」本身不参与判定，
///              只决定配方内容（档位语义在配方中展开，防档位膨胀）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SuccessCriteria {
    /// 判据档位（hands_on/solo_project/teach_cert/default）
    pub tier: String,
    /// 组结算历史数要求（settlements 历史计数——归档组仍计入，防"结算后组被
    /// 归档导致判据蒸发"）
    pub group_settlements: usize,
    /// 应用记录（knowledge_decisions kind=application 且引用组在目标下）要求数；
    /// None=不要求
    pub applications: Option<usize>,
    /// 自测通过率要求（teach_cert 档 0.8）；None=不要求
    pub self_test_rate: Option<f64>,
    /// 自测是否参与判定（v0.18.0 M1/M2 占位 false——「访谈已记录」，M3 真实化）
    pub self_test_enforced: bool,
    /// 近 90 天复习活跃天数要求（default 档）；None=不要求
    pub review_active_days: Option<usize>,
    /// 判据说明（人类可读文案——声明步骤回显/详情页展示）
    pub statement: String,
}

/// 访谈答案（intent_json 的 serde 契约；全部 Option——跳过/以后想合法）。
///
/// @ai-context: 第 1/3 问必答由命令层强制（scenario 与 criteria_tier 非空）；
///              第 2/4 问折叠可选——快速模式（名称+期限）两个字段均不填，
///              '{}' 即合法（判据走默认档）。答案可后期回溯编辑（重新访谈配方重推）。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoalIntent {
    /// 第 1 问：学会以后想用它做什么（场景）
    pub scenario: Option<String>,
    /// 第 2 问：现在什么程度（零基础/会一点/系统学过一半）
    pub level: Option<String>,
    /// 第 2 问：为什么是现在（工作需要/转行/好奇/其他）
    pub driver: Option<String>,
    /// 第 3 问：做到什么程度算会了（判据档位对应值）
    pub criteria_statement: Option<String>,
    /// 第 3 问：时间怎么算（3 个月/半年/无期限/先试两周）
    pub horizon: Option<String>,
    /// 第 3 问：明确不学什么（防目标沼泽化）
    pub non_scope: Option<String>,
    /// 第 4 问：每周能投多少时间
    pub weekly_commitment: Option<String>,
    /// 第 4 问：已知障碍
    pub obstacles: Option<String>,
}

/// 里程碑草案（suggest_milestones 纯函数产出——宣言页预填，可删改）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneDraft {
    pub title: String,
    /// 距创建时刻的周偏移（命令层换算 due_at = created_at + weeks*7d）
    pub due_weeks: usize,
}

/// 组弱项信号（M1：FSRS 低稳定性卡占比——flashcards.state_json 查询）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupWeakness {
    pub group_id: i64,
    /// 组名（展示层标题）
    pub group_name: String,
    /// 组内卡总数
    pub card_total: usize,
    /// 低稳定性卡数（stability < LOW_STABILITY_DAYS）
    pub weak_cards: usize,
    /// 低稳定性占比（0..1；无卡 → 0）
    pub weak_ratio: f64,
}
