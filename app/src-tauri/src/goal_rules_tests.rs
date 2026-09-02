//! goal_rules 状态机与毕业判据单测（转移矩阵 + 守卫的边界/非法路径）。

use crate::goal_interview::derive_criteria;
use crate::goal_progress::{build_report, GoalSignals};
use crate::goal_rules::{can_transition, graduation_readiness, valid_goal_status};
use crate::goal_schema::{
    SuccessCriteria, GOAL_ABANDONED, GOAL_ACTIVE, GOAL_GRADUATED, GOAL_PAUSED, TIER_DEFAULT,
    TIER_HANDS_ON, TIER_SOLO_PROJECT, TIER_TEACH_CERT,
};

fn criteria(tier: &str) -> SuccessCriteria {
    SuccessCriteria {
        tier: tier.to_string(),
        group_settlements: 1,
        applications: None,
        self_test_rate: None,
        self_test_enforced: false,
        review_active_days: None,
        statement: "test".to_string(),
    }
}

fn active_ready_signals() -> GoalSignals {
    GoalSignals {
        milestone_total: 2,
        milestone_done: 2,
        settlements_count: 1,
        applications_count: 1,
        review_days_90: 5,
        ..Default::default()
    }
}

#[test]
fn status_whitelist() {
    for s in [GOAL_ACTIVE, GOAL_PAUSED, GOAL_GRADUATED, GOAL_ABANDONED] {
        assert!(valid_goal_status(s));
    }
    for s in ["draft", "archived", ""] {
        assert!(!valid_goal_status(s), "非法状态 {:?} 应拒绝", s);
    }
}

#[test]
fn transition_matrix_all_pairs() {
    // 16 对全矩阵：只允许图中五条边
    for from in [GOAL_ACTIVE, GOAL_PAUSED, GOAL_GRADUATED, GOAL_ABANDONED] {
        for to in [GOAL_ACTIVE, GOAL_PAUSED, GOAL_GRADUATED, GOAL_ABANDONED] {
            let expect = matches!(
                (from, to),
                (GOAL_ACTIVE, GOAL_PAUSED)
                    | (GOAL_ACTIVE, GOAL_GRADUATED)
                    | (GOAL_ACTIVE, GOAL_ABANDONED)
                    | (GOAL_PAUSED, GOAL_ACTIVE)
                    | (GOAL_PAUSED, GOAL_ABANDONED)
            );
            assert_eq!(can_transition(from, to), expect, "{} → {}", from, to);
        }
    }
}

#[test]
fn guard_terminated_statuses_cannot_graduate_again() {
    let progress = build_report(&active_ready_signals());
    // 状态机终态守卫：重复毕业非法（已毕业/已放弃不可再判毕业）
    let graduated = graduation_readiness(GOAL_GRADUATED, &progress, &criteria(TIER_HANDS_ON));
    assert!(!graduated.ready);
    assert!(graduated.checks[0].detail.contains("不可重复毕业"));
    let abandoned = graduation_readiness(GOAL_ABANDONED, &progress, &criteria(TIER_HANDS_ON));
    assert!(!abandoned.ready);
    assert!(abandoned.checks[0].detail.contains("不可再判毕业"));
}

#[test]
fn guard_paused_requires_resume_first() {
    let progress = build_report(&active_ready_signals());
    let paused = graduation_readiness(GOAL_PAUSED, &progress, &criteria(TIER_HANDS_ON));
    assert!(!paused.ready);
    assert!(paused.checks[0].detail.contains("恢复后再判毕业"));
}

#[test]
fn readiness_all_met_hands_on() {
    let progress = build_report(&active_ready_signals());
    let r = graduation_readiness(GOAL_ACTIVE, &progress, &criteria(TIER_HANDS_ON));
    assert!(r.ready, "全满足应可毕业: {:?}", r.checks);
    assert_eq!(r.checks.len(), 2, "hands_on 档只有里程碑+结算两项判据");
}

#[test]
fn readiness_milestone_incomplete() {
    let s = GoalSignals { milestone_total: 2, milestone_done: 1, settlements_count: 1, ..Default::default() };
    let r = graduation_readiness(GOAL_ACTIVE, &build_report(&s), &criteria(TIER_HANDS_ON));
    assert!(!r.ready);
    assert!(r.checks[0].detail.contains("1 / 2"));
}

#[test]
fn readiness_zero_milestones_not_ready() {
    // 无里程碑：清单为空无判据——诚实提示先拆计划
    let s = GoalSignals { settlements_count: 1, ..Default::default() };
    let r = graduation_readiness(GOAL_ACTIVE, &build_report(&s), &criteria(TIER_HANDS_ON));
    assert!(!r.ready);
    assert!(r.checks[0].detail.contains("无里程碑"));
}

#[test]
fn readiness_settlement_history_count() {
    // 归档组仍计入（settlements 历史计数口径——0 结算 / 1 结算边界）
    let s = GoalSignals { milestone_total: 1, milestone_done: 1, settlements_count: 0, ..Default::default() };
    let r = graduation_readiness(GOAL_ACTIVE, &build_report(&s), &criteria(TIER_HANDS_ON));
    assert!(!r.ready);
    assert!(r.checks[1].detail.contains("0 / 1"));
}

#[test]
fn readiness_solo_project_requires_application() {
    let mut c = criteria(TIER_SOLO_PROJECT);
    c.applications = Some(1);
    let s = GoalSignals { milestone_total: 1, milestone_done: 1, settlements_count: 1, applications_count: 0, ..Default::default() };
    let r = graduation_readiness(GOAL_ACTIVE, &build_report(&s), &c);
    assert!(!r.ready);
    assert!(r.checks.iter().any(|ch| ch.label == "应用记录" && !ch.met));
    // 达标后
    let s2 = GoalSignals { applications_count: 1, ..s };
    let r2 = graduation_readiness(GOAL_ACTIVE, &build_report(&s2), &c);
    assert!(r2.ready);
}

#[test]
fn readiness_teach_cert_placeholder_not_enforced_in_m1() {
    // M1/M2 占位：self_test_enforced=false → 自测不参与判定（tier 配方默认 false）
    let c = criteria(TIER_TEACH_CERT);
    assert!(!c.self_test_enforced);
    let s = GoalSignals { milestone_total: 1, milestone_done: 1, settlements_count: 1, ..Default::default() };
    let r = graduation_readiness(GOAL_ACTIVE, &build_report(&s), &c);
    assert!(r.ready, "M1 占位期自测不判（防占位假装达标却也防误伤）：{:?}", r.checks);
    assert!(r.checks.iter().all(|ch| ch.label != "自测通过率"));
}

#[test]
fn readiness_self_test_enforced_path() {
    // M3 真实化后的判定路径：无数据 → 未达标；数据达标 → 达标
    let mut c = criteria(TIER_TEACH_CERT);
    c.self_test_rate = Some(0.8);
    c.self_test_enforced = true;
    let base = GoalSignals { milestone_total: 1, milestone_done: 1, settlements_count: 1, ..Default::default() };
    let none = build_report(&GoalSignals { self_test_passed_rate: None, ..base.clone() });
    assert!(!graduation_readiness(GOAL_ACTIVE, &none, &c).ready);
    let ok = build_report(&GoalSignals { self_test_passed_rate: Some(0.9), ..base });
    assert!(graduation_readiness(GOAL_ACTIVE, &ok, &c).ready);
}

#[test]
fn readiness_default_tier_requires_review_activity() {
    // 真实配方推导（criteria() 是手动夹具——这里验证 default 档配方的复习活跃要求）
    let c = derive_criteria(TIER_DEFAULT, None);
    assert_eq!(c.review_active_days, Some(5));
    let s = GoalSignals { milestone_total: 1, milestone_done: 1, settlements_count: 1, review_days_90: 4, ..Default::default() };
    let r = graduation_readiness(GOAL_ACTIVE, &build_report(&s), &c);
    assert!(!r.ready);
    assert!(r.checks.iter().any(|ch| ch.label == "复习活跃" && !ch.met));
    let s2 = GoalSignals { review_days_90: 5, ..s };
    assert!(graduation_readiness(GOAL_ACTIVE, &build_report(&s2), &c).ready);
}
