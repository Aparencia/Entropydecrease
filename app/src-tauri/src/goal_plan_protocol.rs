//! AI 目标规划协议（v0.18.2 REQ-251；GoalPlanProposal 契约与强校验）。
//!
//! @ai-context: 建议制——AI 产出草案蓝图，人类确认后落库（ADR-028 §1）；
//!              validate 强校验：枚举白名单/长度上限/id 正整数/dueWeeks 有界/
//!              体系骨架门槛（name+coreQuestion+≥1 domainEntry 缺一即整条丢弃，
//!              附诚实提示）——校验失败整条丢弃而非整次失败（局部可用原则）。
//! @ai-context: 与 goal_schema 的准线：milestones.criteriaType 白名单
//!              [manual, group_settled]（self_test M3 前不可写——与 M1 同口径）。

use serde::{Deserialize, Serialize};

/// 里程碑标题上限（字符）。
pub const MILESTONE_TITLE_MAX: usize = 80;
/// 说明/理由上限（字符）。
pub const NOTE_MAX: usize = 200;
/// 体系名称/核心问题上限（字符）。
pub const SYSTEM_NAME_MAX: usize = 60;
/// 领域入口文本上限（字符）。
pub const DOMAIN_ENTRY_MAX: usize = 60;
/// 概念名上限（字符）。
pub const CONCEPT_NAME_MAX: usize = 40;
/// dueWeeks 上限（52 周 ≈ 1 年——规划节律有界）。
pub const DUE_WEEKS_MAX: usize = 52;
/// 条款数上限（里程碑 ≤12 / 概念 ≤8 / 领域入口 ≤6——防超长规划）。
pub const MILESTONES_MAX: usize = 12;
pub const CONCEPTS_MAX: usize = 8;
pub const DOMAIN_ENTRIES_MAX: usize = 6;

/// 里程碑判据类型白名单（M3 占位契约不可写）。
pub const CRITERIA_MANUAL: &str = "manual";
pub const CRITERIA_GROUP_SETTLED: &str = "group_settled";

/// 体系动作：link 挂接现有体系 / create 建议新建骨架。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalSystem {
    #[serde(default)]
    pub action: String, // link|create
    #[serde(default)]
    pub system_id: Option<i64>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub core_question: Option<String>,
    #[serde(default)]
    pub domain_entries: Vec<String>,
    #[serde(default)]
    pub concepts: Vec<ProposalConcept>,
    #[serde(default)]
    pub reason: String,
}

/// 初始概念建议（三问 essence 必填，其余可空）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalConcept {
    pub name: String,
    #[serde(default)]
    pub essence: String,
    #[serde(default)]
    pub boundary: String,
    #[serde(default)]
    pub relation: String,
}

/// 里程碑建议。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalMilestone {
    pub title: String,
    #[serde(default)]
    pub due_weeks: usize,
    #[serde(default)]
    pub criteria_type: String,
    #[serde(default)]
    pub ref_group_id: Option<i64>,
    #[serde(default)]
    pub note: String,
}

/// 组绑定建议。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalGroup {
    pub group_id: i64,
    #[serde(default)]
    pub reason: String,
}

/// 周契约建议（建议制——仍由用户确认后 upsert）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalContract {
    #[serde(default = "default_days")]
    pub target_days: i64,
    #[serde(default = "default_cards")]
    pub target_cards: i64,
}

fn default_days() -> i64 {
    3
}
fn default_cards() -> i64 {
    20
}

/// 目标规划提案（AI 输出蓝图——确认前不落库）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalPlanProposal {
    #[serde(default)]
    pub milestones: Vec<ProposalMilestone>,
    #[serde(default)]
    pub groups: Vec<ProposalGroup>,
    #[serde(default)]
    pub systems: Vec<ProposalSystem>,
    #[serde(default)]
    pub weekly_contract: Option<ProposalContract>,
    #[serde(default)]
    pub summary: String,
}

/// 校验结果（丢弃项清单——诚实提示，不是静默过滤）。
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanValidation {
    pub dropped_milestones: Vec<String>,
    pub dropped_groups: Vec<String>,
    pub dropped_systems: Vec<String>,
}

/// 整次校验：逐条清洗（非法删除并登记原因）；摘要/说明截断归一。
pub fn validate_proposal(proposal: GoalPlanProposal) -> (GoalPlanProposal, PlanValidation) {
    let mut v = PlanValidation::default();
    let mut milestones = Vec::new();
    for m in proposal.milestones {
        if m.title.trim().is_empty() {
            v.dropped_milestones.push("空标题".to_string());
            continue;
        }
        if m.due_weeks > DUE_WEEKS_MAX {
            v.dropped_milestones.push(format!("期限超界（{} 周）", m.due_weeks));
            continue;
        }
        if !matches!(m.criteria_type.as_str(), CRITERIA_MANUAL | CRITERIA_GROUP_SETTLED) {
            v.dropped_milestones.push(format!("非法判据类型: {}", m.criteria_type));
            continue;
        }
        if m.criteria_type == CRITERIA_GROUP_SETTLED && m.ref_group_id.is_none() {
            v.dropped_milestones.push("group_settled 未绑组".to_string());
            continue;
        }
        if milestones.len() >= MILESTONES_MAX {
            break;
        }
        milestones.push(ProposalMilestone {
            title: trunc(m.title.trim(), MILESTONE_TITLE_MAX),
            due_weeks: m.due_weeks,
            criteria_type: m.criteria_type,
            ref_group_id: m.ref_group_id,
            note: trunc(m.note.trim(), NOTE_MAX),
        });
    }
    // 组建议：仅保留 id>0（存在性由确认流校验——草案期不查库）
    let groups: Vec<ProposalGroup> = proposal
        .groups
        .into_iter()
        .filter(|g| {
            if g.group_id <= 0 {
                v.dropped_groups.push(format!("非法组 id: {}", g.group_id));
                false
            } else {
                true
            }
        })
        .map(|g| ProposalGroup { group_id: g.group_id, reason: trunc(g.reason.trim(), NOTE_MAX) })
        .collect();
    // 体系建议：门槛校验（create 需名称+核心问题+≥1 领域入口；link 需 system_id>0）
    let mut systems = Vec::new();
    for s in proposal.systems {
        if s.action == "create" {
            let name = s.name.as_deref().map(str::trim).unwrap_or("");
            let core = s.core_question.as_deref().map(str::trim).unwrap_or("");
            if name.is_empty() || core.is_empty() || s.domain_entries.is_empty() {
                v.dropped_systems.push("体系骨架不完整（名称/核心问题/领域入口缺一），已跳过".to_string());
                continue;
            }
            if s.domain_entries.len() > DOMAIN_ENTRIES_MAX || s.concepts.len() > CONCEPTS_MAX {
                v.dropped_systems.push("体系建议超限（入口/概念数），已跳过".to_string());
                continue;
            }
            systems.push(ProposalSystem {
                action: s.action,
                system_id: None,
                name: Some(trunc(name, SYSTEM_NAME_MAX).to_string()),
                core_question: Some(trunc(core, SYSTEM_NAME_MAX).to_string()),
                domain_entries: s
                    .domain_entries
                    .iter()
                    .take(DOMAIN_ENTRIES_MAX)
                    .map(|e| trunc(e.trim(), DOMAIN_ENTRY_MAX))
                    .collect(),
                concepts: s
                    .concepts
                    .into_iter()
                    .filter(|c| !c.name.trim().is_empty())
                    .map(|c| ProposalConcept {
                        name: trunc(c.name.trim(), CONCEPT_NAME_MAX),
                        essence: trunc(c.essence.trim(), NOTE_MAX),
                        boundary: trunc(c.boundary.trim(), NOTE_MAX),
                        relation: trunc(c.relation.trim(), NOTE_MAX),
                    })
                    .collect(),
                reason: trunc(s.reason.trim(), NOTE_MAX),
            });
        } else if s.action == "link" && s.system_id.map(|id| id > 0).unwrap_or(false) {
            systems.push(ProposalSystem {
                action: s.action,
                system_id: s.system_id,
                name: None,
                core_question: None,
                domain_entries: Vec::new(),
                concepts: Vec::new(),
                reason: trunc(s.reason.trim(), NOTE_MAX),
            });
        } else {
            v.dropped_systems.push("体系动作非法或未指定现有体系".to_string());
        }
    }
    // 周契约边界（复用周契约命令层合法区间）
    let weekly_contract = proposal.weekly_contract.map(|c| ProposalContract {
        target_days: c.target_days.clamp(1, 7),
        target_cards: c.target_cards.clamp(1, 200),
    });
    let summary = trunc(proposal.summary.trim(), NOTE_MAX);
    (
        GoalPlanProposal { milestones, groups, systems, weekly_contract, summary },
        v,
    )
}

/// 字符截断（char 迭代防多字节切 panic；CJK 先例 6fb5d58 教训）。
fn trunc(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

#[cfg(test)]
#[path = "goal_plan_protocol_tests.rs"]
mod tests;
