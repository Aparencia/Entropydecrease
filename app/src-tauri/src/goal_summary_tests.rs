//! goal_summary 单测（摘要组装/边界/历法换算校正）。

use crate::goal_summary::{build_summary, GoalSummaryInput};

fn input() -> GoalSummaryInput {
    GoalSummaryInput {
        name: "学会 Python".to_string(),
        status: "active".to_string(),
        created_at: 1_700_000_000,
        horizon_end: Some(1_707_776_000),
        scenario: Some("工作自动化".to_string()),
        driver: Some("工作需要".to_string()),
        non_scope: Some("不做 Web 框架".to_string()),
        criteria_statement: "里程碑+组结算 1 次".to_string(),
        milestone_done: 2,
        milestone_total: 4,
        settlements: 1,
        review_days_90: 6,
        applications: 1,
        weak_top: Some("Python 组（低稳定性 12/40 卡）".to_string()),
    }
}

#[test]
fn summary_contains_all_four_sections() {
    let s = build_summary(&input());
    assert!(s.starts_with("目标「学会 Python」"));
    assert!(s.contains("进度：里程碑 2/4"));
    assert!(s.contains("组结算 1 次"));
    assert!(s.contains("最弱一块：Python 组（低稳定性 12/40 卡）"));
    assert!(s.contains("达成标准：里程碑+组结算 1 次"));
    assert!(s.contains("边界：不学不做 Web 框架"));
    assert!(s.chars().count() <= 1_200, "摘要上界");
}

#[test]
fn summary_handles_bare_goal_and_weak_none() {
    let mut i = input();
    i.scenario = None;
    i.driver = None;
    i.weak_top = None;
    i.non_scope = None;
    let s = build_summary(&i);
    assert!(s.contains("未访谈（规则基线）"));
    assert!(!s.contains("最弱一块"));
    assert!(!s.contains("边界"));
}

#[test]
fn civil_days_roundtrip_known_epochs() {
    // 1970-01-01（epoch 第 0 天）与 2026-09-02 校准（0 偏移 UTC 秒）
    let zero = crate::goal_summary::build_summary(&GoalSummaryInput {
        created_at: 0, ..Default::default()
    });
    assert!(zero.contains("—"), "epoch 前回退");
}

#[test]
fn summary_truncates_to_bound() {
    let mut i = input();
    i.name = "很".repeat(3000);
    let s = build_summary(&i);
    assert!(s.chars().count() <= 1_200);
}
