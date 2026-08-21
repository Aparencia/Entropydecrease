//! scheduler 单测（AAA 模式；FSRS-6 行为契约）。

use crate::scheduler::{schedule, CardState, Rating};

/// 基准时刻（固定，单测可重现）。
const NOW_MS: u64 = 1_755_900_000_000;

#[test]
fn new_card_good_produces_positive_interval() {
    // Arrange/Act：新卡首次 Good
    let out = schedule(None, Rating::Good, NOW_MS);
    // Assert：状态初始化合理，到期在未来
    assert!(out.next.stability > 0.0, "新卡 Good 应有正稳定性");
    assert!(out.next.difficulty > 0.0);
    assert_eq!(out.next.reps, 1);
    assert_eq!(out.next.lapses, 0);
    assert!(out.interval_days >= 1.0, "间隔下限 1 天");
    assert!(out.due_at_ms > NOW_MS);
}

#[test]
fn rating_monotonicity_easy_over_good_over_again() {
    // Arrange/Act：同一新卡四种评分
    let again = schedule(None, Rating::Again, NOW_MS);
    let good = schedule(None, Rating::Good, NOW_MS);
    let easy = schedule(None, Rating::Easy, NOW_MS);
    // Assert：评分越高间隔越长（Again 最短——FSRS 核心契约）
    assert!(easy.interval_days > good.interval_days, "Easy 间隔应长于 Good");
    assert!(good.interval_days >= again.interval_days, "Good 间隔不短于 Again");
}

#[test]
fn again_increments_lapses() {
    // Arrange：复习过的卡
    let first = schedule(None, Rating::Good, NOW_MS);
    // Act：遗忘一次
    let out = schedule(Some(&first.next), Rating::Again, NOW_MS + 86_400_000);
    // Assert：lapses+1，reps 累计
    assert_eq!(out.next.lapses, 1);
    assert_eq!(out.next.reps, 2);
}

#[test]
fn successful_review_grows_stability() {
    // Arrange：首次 Good 后按时复习再 Good
    let first = schedule(None, Rating::Good, NOW_MS);
    // Act：到期时刻复习
    let second = schedule(Some(&first.next), Rating::Good, first.due_at_ms);
    // Assert：稳定性增长（间隔效应——FSRS 核心收益）
    assert!(
        second.next.stability > first.next.stability,
        "成功复习应增长稳定性: {} → {}",
        first.next.stability,
        second.next.stability
    );
    assert!(second.interval_days >= first.interval_days);
}

#[test]
fn overdue_card_uses_real_elapsed_days() {
    // Arrange：欠账 30 天的卡（弹性承诺——不追债不清零，按真实间隔演化）
    let first = schedule(None, Rating::Good, NOW_MS);
    let overdue_at = first.due_at_ms + 30 * 86_400_000;
    // Act
    let out = schedule(Some(&first.next), Rating::Good, overdue_at);
    // Assert：状态仍演化成功（不 panic 不清零），last_review 更新为当前
    assert!(out.next.stability > 0.0);
    assert_eq!(out.next.last_review_ms, overdue_at);
    assert_eq!(out.next.lapses, 0, "按时评分 Good 不计遗忘");
}

#[test]
fn card_state_json_roundtrip() {
    // Arrange：落库格式（flashcards.state_json）序列化往返
    let state = CardState {
        stability: 12.5,
        difficulty: 5.2,
        reps: 3,
        lapses: 1,
        last_review_ms: NOW_MS,
    };
    // Act
    let json = serde_json::to_string(&state).expect("serialize");
    let back: CardState = serde_json::from_str(&json).expect("deserialize");
    // Assert
    assert_eq!(back, state);
}

#[test]
fn rating_parse_accepts_contract_values() {
    // Arrange/Act/Assert：四档契约值 + 非法值诚实 None
    assert_eq!(Rating::parse("again"), Some(Rating::Again));
    assert_eq!(Rating::parse("easy"), Some(Rating::Easy));
    assert_eq!(Rating::parse("unknown"), None);
}
