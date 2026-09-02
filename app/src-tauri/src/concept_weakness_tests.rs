//! concept_weakness 单测（低激活边界：90 天窗口/从未引用/最近活跃）。

use crate::concept_weakness::{rank_weakness, signal_of, ConceptActivity};

const NOW: i64 = 1_700_000_000;

fn act(name: &str, refs: usize, applied_days_ago: Option<i64>, ref_days_ago: Option<i64>) -> ConceptActivity {
    ConceptActivity {
        concept_id: name.len() as i64,
        name: name.to_string(),
        ref_count: refs,
        last_applied_at: applied_days_ago.map(|d| NOW - d * 86_400),
        last_referenced_at: ref_days_ago.map(|d| NOW - d * 86_400),
    }
}

#[test]
fn weak_when_no_activity_for_90_days() {
    let c = act("闭包", 3, Some(120), Some(91));
    let s = signal_of(&c, NOW);
    assert!(s.weak);
    assert!(s.reason.contains("90 天前"));
    // 90 天整不算（边界左闭右开：<90 天为新鲜）
    let fresh = act("生成器", 2, Some(89), Some(89));
    assert!(!signal_of(&fresh, NOW).weak);
}

#[test]
fn never_used_is_weakest_with_honest_reason() {
    let c = act("装饰器", 0, None, None);
    let s = signal_of(&c, NOW);
    assert!(s.weak);
    assert!(s.reason.contains("从未引用/应用"));
    assert_eq!(c.ref_count, 0);
}

#[test]
fn applied_fresh_is_not_weak() {
    let c = act("列表推导", 5, Some(30), Some(200));
    assert!(!signal_of(&c, NOW).weak);
    assert!(signal_of(&c, NOW).reason.contains("有应用记录"));
}

#[test]
fn rank_orders_weak_first() {
    let list = vec![
        act("最近活跃", 5, Some(10), Some(10)),
        act("从未用", 0, None, None),
        act("90 天前", 2, Some(120), Some(120)),
    ];
    let ranked = rank_weakness(&list, NOW);
    assert!(ranked[0].weak && ranked[1].weak && !ranked[2].weak, "{:?}", ranked.iter().map(|r| &r.name).collect::<Vec<_>>());
}
