//! goal_progress 纯函数单测（信号组装/百分比/弱项口径边界）。

use crate::goal_progress::{
    build_report, progress_statement, rank_weakness, weakness_ratio, GoalSignals,
};
use crate::goal_schema::GroupWeakness;

fn weak(group_id: i64, total: usize, weak_cards: usize) -> GroupWeakness {
    GroupWeakness {
        group_id,
        group_name: format!("组{}", group_id),
        card_total: total,
        weak_cards,
        weak_ratio: weakness_ratio(total, weak_cards),
    }
}

#[test]
fn report_boundary_zero_signals() {
    // Arrange：空信号（新目标零绑定零里程碑）
    let s = GoalSignals::default();
    // Act
    let r = build_report(&s);
    // Assert：无里程碑 → 0%，不猜
    assert_eq!(r.percent, 0.0);
    assert_eq!(progress_statement(&r), "0% · 里程碑 0/0");
    assert_eq!(r.settlements_count, 0);
    assert_eq!(r.contract_total, 0);
}

#[test]
fn report_milestone_ratio() {
    let s = GoalSignals {
        milestone_total: 4,
        milestone_done: 2,
        settlements_count: 1,
        contract_done: 3,
        contract_total: 5,
        review_days_90: 7,
        applications_count: 1,
        ..Default::default()
    };
    let r = build_report(&s);
    assert_eq!(r.percent, 50.0);
    assert_eq!(progress_statement(&r), "50% · 里程碑 2/4");
    assert_eq!(r.settlements_count, 1);
    assert_eq!(r.contract_done, 3);
    assert_eq!(r.contract_total, 5);
    assert_eq!(r.review_days_90, 7);
    assert_eq!(r.applications_count, 1);
}

#[test]
fn report_full_milestones_rounds_percent() {
    let s = GoalSignals { milestone_total: 3, milestone_done: 3, ..Default::default() };
    let r = build_report(&s);
    assert_eq!(r.percent, 100.0);
    assert_eq!(progress_statement(&r), "100% · 里程碑 3/3");
}

#[test]
fn weakness_ratio_boundaries() {
    // 0 卡 → 0（空组不是弱项）；占比 clamp 到 [0,1]
    assert_eq!(weakness_ratio(0, 0), 0.0);
    assert_eq!(weakness_ratio(0, 5), 0.0);
    assert_eq!(weakness_ratio(10, 4), 0.4);
    assert_eq!(weakness_ratio(10, 10), 1.0);
}

#[test]
fn rank_weakness_orders_by_ratio_then_weak_count() {
    let groups = vec![weak(1, 10, 1), weak(2, 100, 60), weak(3, 10, 6), weak(4, 0, 0)];
    let ranked = rank_weakness(groups);
    // 占比相同（0.6）时弱卡数多者排前：「最弱」= 未巩固记忆的绝对量更大
    assert_eq!(ranked[0].group_id, 2);
    assert_eq!(ranked[0].weak_ratio, 0.6);
    assert_eq!(ranked[1].group_id, 3);
    assert_eq!(ranked[2].group_id, 1);
    assert_eq!(ranked[3].group_id, 4, "空组占比 0 垫底");
}

#[test]
fn report_weak_groups_passthrough() {
    let groups = vec![weak(9, 4, 2)];
    let s = GoalSignals { weak_groups: groups.clone(), ..Default::default() };
    let r = build_report(&s);
    assert_eq!(r.weak_groups, groups);
}
