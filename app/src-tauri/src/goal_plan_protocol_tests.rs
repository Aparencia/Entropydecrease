//! goal_plan_protocol 强校验 golden（table-driven——合法/门槛/超限/非法枚举矩阵）。

use crate::goal_plan_protocol::{
    validate_proposal, GoalPlanProposal, ProposalConcept, ProposalContract, ProposalGroup,
    ProposalMilestone, ProposalSystem,
};

fn good_milestone(title: &str) -> ProposalMilestone {
    ProposalMilestone {
        title: title.to_string(),
        due_weeks: 4,
        criteria_type: "manual".to_string(),
        ref_group_id: None,
        note: "".to_string(),
    }
}

#[test]
fn valid_proposal_passes_untouched() {
    let p = GoalPlanProposal {
        milestones: vec![good_milestone("基础入门"), good_milestone("项目实战")],
        groups: vec![ProposalGroup { group_id: 5, reason: "素材命中".to_string() }],
        systems: vec![ProposalSystem {
            action: "create".to_string(),
            system_id: None,
            name: Some("Python 基础".to_string()),
            core_question: Some("怎么把语法变成能力？".to_string()),
            domain_entries: vec!["语法基础".to_string(), "项目实践".to_string()],
            concepts: vec![ProposalConcept { name: "闭包".to_string(), essence: "捕获环境的函数".to_string(), boundary: String::new(), relation: String::new() }],
            reason: String::new(),
        }],
        weekly_contract: Some(ProposalContract { target_days: 3, target_cards: 20 }),
        summary: "先补基础再上项目".to_string(),
    };
    let (ok, v) = validate_proposal(p);
    assert_eq!(ok.milestones.len(), 2);
    assert_eq!(ok.systems.len(), 1);
    assert_eq!(ok.weekly_contract.unwrap().target_cards, 20);
    assert!(v.dropped_milestones.is_empty() && v.dropped_systems.is_empty());
}

#[test]
fn gate_matrix_drops_with_reasons() {
    // 非法判据/未绑组的结算型/空标题/超周界 → 全部丢弃并登记
    let p = GoalPlanProposal {
        milestones: vec![
            ProposalMilestone { title: String::new(), due_weeks: 4, criteria_type: "manual".to_string(), ref_group_id: None, note: String::new() },
            good_milestone("过界").clone_with_weeks(100),
            ProposalMilestone { title: "结算未绑组".to_string(), due_weeks: 8, criteria_type: "group_settled".to_string(), ref_group_id: None, note: String::new() },
            ProposalMilestone { title: "非法类型".to_string(), due_weeks: 4, criteria_type: "self_test".to_string(), ref_group_id: None, note: String::new() },
        ],
        groups: vec![ProposalGroup { group_id: -1, reason: "".to_string() }],
        systems: vec![ProposalSystem {
            action: "create".to_string(),
            system_id: None,
            name: Some("无核心问题".to_string()),
            core_question: None,
            domain_entries: vec!["唯一入口".to_string()],
            concepts: vec![],
            reason: "".to_string(),
        }],
        weekly_contract: None,
        summary: "".to_string(),
    };
    let (ok, v) = validate_proposal(p);
    assert!(ok.milestones.is_empty(), "非法里程碑全部丢弃");
    assert!(ok.groups.is_empty());
    assert!(ok.systems.is_empty(), "体系门槛不完整丢弃");
    assert_eq!(v.dropped_milestones.len(), 4, "每条均有登记: {:?}", v.dropped_milestones);
    assert_eq!(v.dropped_groups.len(), 1);
    assert_eq!(v.dropped_systems.len(), 1);
}

#[test]
fn contract_clamped_to_bounds() {
    let p = GoalPlanProposal {
        milestones: vec![],
        groups: vec![],
        systems: vec![],
        weekly_contract: Some(ProposalContract { target_days: 99, target_cards: 9999 }),
        summary: "x".to_string(),
    };
    let (ok, _) = validate_proposal(p);
    assert_eq!(ok.weekly_contract.unwrap().target_days, 7);
}

#[test]
fn truncated_fields_and_caps() {
    let long_title = "长".repeat(300);
    let p = GoalPlanProposal {
        milestones: vec![ProposalMilestone {
            title: long_title.clone(),
            due_weeks: 4,
            criteria_type: "manual".to_string(),
            ref_group_id: None,
            note: String::new(),
        }],
        groups: vec![],
        systems: vec![],
        weekly_contract: None,
        summary: long_title.clone(),
    };
    let (ok, _) = validate_proposal(p);
    assert_eq!(ok.milestones[0].title.chars().count(), 80, "标题截断到 80");
    assert_eq!(ok.summary.chars().count(), 200, "摘要截断到 200");
}

trait CloneWithWeeks {
    fn clone_with_weeks(&self, weeks: usize) -> ProposalMilestone;
}

impl CloneWithWeeks for ProposalMilestone {
    fn clone_with_weeks(&self, weeks: usize) -> ProposalMilestone {
        ProposalMilestone { due_weeks: weeks, ..self.clone() }
    }
}
