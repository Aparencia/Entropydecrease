//! goal_retro 纯函数单测（毕业报告组装/回顾流/文本摘要边界）。

use crate::goal_retro::{
    assemble_report, assemble_retro, report_text, ArtifactsInventory, GroupSettlementSnapshot,
    MilestoneSnapshot, ReportSignals, ReviewStats,
};

fn ms(title: &str, status: &str, completed_at: Option<i64>) -> MilestoneSnapshot {
    MilestoneSnapshot { title: title.to_string(), status: status.to_string(), completed_at }
}

fn signals() -> ReportSignals {
    ReportSignals {
        goal_id: 1,
        goal_name: "学会 Python".to_string(),
        graduated_at: 1_700_000_000,
        milestones: vec![
            ms("基础入门", "done", Some(100)),
            ms("应用练习", "done", Some(200)),
            ms("项目实战", "skipped", None),
        ],
        group_settlements: vec![GroupSettlementSnapshot {
            group_id: 5,
            group_name: "Python 组".to_string(),
            settlement_count: 3,
            last_settled_at: Some(300),
        }],
        review_stats: ReviewStats { card_total: 40, review_logs_total: 120, review_days_90: 7, weak_cards: 6 },
        artifacts: ArtifactsInventory { groups: 1, notes: 8, cards: 40, concepts: 5 },
        criteria_statement: "完成全部里程碑 + 组结算 1 次".to_string(),
    }
}

#[test]
fn assemble_report_passes_through_all_fields() {
    let r = assemble_report(signals());
    assert_eq!(r.goal_name, "学会 Python");
    assert_eq!(r.milestones.len(), 3);
    assert_eq!(r.group_settlements[0].settlement_count, 3);
    assert_eq!(r.review_stats.weak_cards, 6);
    assert_eq!(r.artifacts.concepts, 5);
    assert!(r.criteria_statement.contains("组结算 1 次"));
}

#[test]
fn retro_orders_chronologically_with_four_kinds() {
    let r = assemble_report(signals());
    let entries = assemble_retro(50, &r.milestones, &r.group_settlements, Some(&r));
    // 只含完成态里程碑（skipped 无发生时刻不入时间线）；按时刻升序
    let kinds: Vec<&str> = entries.iter().map(|e| e.kind.as_str()).collect();
    assert_eq!(kinds, vec!["created", "milestone", "milestone", "settlement", "graduated"]);
    assert!(entries.iter().all(|e| !e.detail.contains("已跳过")), "跳过项不造假时间线事件");
    // 时间顺序：created(50) < ms完成(100/200) < settlement(300) < graduated
    let ats: Vec<i64> = entries.iter().map(|e| e.occurred_at).collect();
    assert!(ats.windows(2).all(|w| w[0] <= w[1]), "升序: {:?}", ats);
}

#[test]
fn retro_without_graduation_keeps_three_kinds() {
    let r = assemble_report(signals());
    let entries = assemble_retro(50, &r.milestones, &r.group_settlements, None);
    assert!(entries.iter().all(|e| e.kind != "graduated"));
    assert!(entries.iter().any(|e| e.kind == "settlement"));
}

#[test]
fn retro_empty_milestones_still_has_created() {
    let entries = assemble_retro(50, &[], &[], None);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].kind, "created");
}

#[test]
fn report_text_summary_contains_all_blocks() {
    let r = assemble_report(signals());
    let text = report_text(&r);
    assert!(text.contains("🎓 学会 Python"));
    assert!(text.contains("里程碑 2/2"), "skipped 不计入总数: {}", text);
    assert!(text.contains("组结算 1 组 3 次"));
    assert!(text.contains("120 次"));
    assert!(text.contains("8 笔记"));
    assert!(text.contains("5 概念"));
    assert!(text.contains("达成标准：完成全部里程碑 + 组结算 1 次"));
}

#[test]
fn report_text_zero_artifacts_boundary() {
    let mut s = signals();
    s.artifacts = ArtifactsInventory { groups: 0, notes: 0, cards: 0, concepts: 0 };
    s.milestones = vec![];
    s.group_settlements = vec![];
    let r = assemble_report(s);
    let text = report_text(&r);
    assert!(text.contains("里程碑 0/0"));
    assert!(text.contains("0 组 · 0 笔记 · 0 卡 · 0 概念"));
}
