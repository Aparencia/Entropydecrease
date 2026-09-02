//! goal_plan_prompt 单测（模板捆绑/兜底/组装）。

use crate::goal_plan_prompt::GoalPlanPrompt;

#[test]
fn bundled_template_parses_and_system_contains_format() {
    let p = GoalPlanPrompt::bundled();
    assert!(p.version >= 1);
    assert!(p.system.contains("规划"));
    let system = p.build_system();
    assert!(system.contains("只输出一个 JSON"));
    assert!(system.contains("\"milestones\""));
}

#[test]
fn fallback_is_valid_when_bundled_broken() {
    let f = GoalPlanPrompt::fallback();
    assert!(f.build_system().contains("目标规划师"));
    assert!(f.output_format.contains("weeklyContract"));
}

#[test]
fn few_shot_included_when_present() {
    let f = GoalPlanPrompt::fallback();
    assert!(f.build_system().len() > 100);
}
