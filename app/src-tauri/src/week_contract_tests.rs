//! week_contract 单测（AAA 模式；周界边界与聚合去重 golden）。

use crate::week_contract::{
    aggregate_week, minimal_day_met, week_start_secs, MINIMAL_DAY_CARDS, WEEK_SECS,
};

#[test]
fn week_start_of_epoch_thursday() {
    // Arrange：1970-01-01 是周四；Act：求其所在周周一
    let start = week_start_secs(0);
    // Assert：1969-12-29（周一）零点——周四回退 3 天
    assert_eq!(start, -3 * 86_400);
}

#[test]
fn week_start_of_monday_is_itself() {
    // Arrange：1970-01-05 是周一；Act/Assert：周一零点不变
    let monday = 4 * 86_400;
    assert_eq!(week_start_secs(monday), monday);
}

#[test]
fn week_start_of_sunday_same_week() {
    // Arrange：1970-01-11 是周日（本周最后一天）
    let sunday = 10 * 86_400 + 12_345; // 任意时刻
    // Act
    let start = week_start_secs(sunday);
    // Assert：归到本周周一 1970-01-05（不跨周）
    assert_eq!(start, 4 * 86_400);
}

#[test]
fn week_start_midweek_and_midday() {
    // Arrange：1970-01-07 周三 12:00
    let wed = 6 * 86_400 + 43_200;
    // Act/Assert：回到周一零点
    assert_eq!(week_start_secs(wed), 4 * 86_400);
}

#[test]
fn week_start_cross_year_boundary() {
    // Arrange：2026-01-01 是周四（任意近代日期验证公式稳定）
    let now = 1_767_225_600; // 2026-01-01T00:00:00Z
    let start = week_start_secs(now);
    // Assert：2025-12-29 周一零点（2025-12-29 确实是周一；
    // 1767225600 - 3*86400 = 1766966400）
    assert_eq!(start, 1_766_966_400);
    assert_eq!(start + WEEK_SECS, 1_767_571_200); // 下一周 2026-01-05
}

#[test]
fn aggregate_dedup_same_day() {
    // Arrange：同一天 3 次复习 + 另一天 1 次
    let day1 = 1_767_225_600 + 3_600; // 周四 01:00
    let day2 = 1_767_225_600 + 86_400; // 周五
    let reviews = [day1, day1 + 100, day1 + 200, day2];
    // Act
    let agg = aggregate_week(&reviews);
    // Assert：天数按日去重=2；卡数=4
    assert_eq!(agg.review_days, 2);
    assert_eq!(agg.review_cards, 4);
}

#[test]
fn aggregate_empty_is_zero() {
    // Act/Assert：无复习诚实归零（UI 显示空进度不造假）
    let agg = aggregate_week(&[]);
    assert_eq!(agg, crate::week_contract::WeekAggregate { review_days: 0, review_cards: 0 });
}

#[test]
fn minimal_day_threshold_boundary() {
    // Assert：≥3 卡成立；2 卡不成立（N9/N11 低谷生存的最轻形态边界）
    assert!(!minimal_day_met(MINIMAL_DAY_CARDS - 1));
    assert!(minimal_day_met(MINIMAL_DAY_CARDS));
    assert!(minimal_day_met(MINIMAL_DAY_CARDS + 5));
}
