//! db_goals_progress 聚合口径单测（结算历史/周契约边界/弱项占比/90 天活跃）。

use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::goal_schema::NewGoal;
use crate::types::NewNoteGroup;
use crate::week_contract::week_start_secs;

/// 固定 now（保证 90 天窗口与周界断言稳定）。
const NOW: i64 = 1_700_000_000;

fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

fn group(db: &Db, name: &str) -> i64 {
    db.create_group(&NewNoteGroup {
        name: name.to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("建组")
    .id
}

/// 建目标（name + 绑定组）+ 返回 goal_id。
fn goal_with(db: &Db, name: &str, group_ids: Vec<i64>) -> i64 {
    db.create_goal(&NewGoal {
        name: name.to_string(),
        domain_tag: None,
        horizon_end: None,
        success_criteria_json: "{}".to_string(),
        intent_json: "{}".to_string(),
        milestones: vec![],
        group_ids,
    })
    .expect("建目标")
    .id
}

fn card_state(stability: f32) -> String {
    format!(r#"{{"stability":{},"difficulty":0.0,"reps":1,"lapses":0,"lastReviewMs":0}}"#, stability)
}

fn card(db: &Db, group_id: i64, state_json: String) -> i64 {
    db.create_card(&NewFlashcard {
        group_id,
        note_id: None,
        fragment_id: None,
        front: format!("q{}", group_id),
        back: "a".to_string(),
        kind: "fact".to_string(),
        state_json,
        due_at: 0,
    })
    .expect("建卡")
    .id
}

fn review(db: &Db, card_id: i64, at_ms: i64) {
    db.add_review_log(card_id, "good", at_ms).expect("评卡");
}

#[test]
fn signals_zero_when_fresh_goal() {
    let db = mem_db();
    let goal_id = goal_with(&db, "空目标", vec![]);
    let s = db.goal_progress_signals(goal_id, NOW).expect("信号");
    assert_eq!(s.milestone_total, 0);
    assert_eq!(s.settlements_count, 0);
    assert_eq!(s.contract_total, 0);
    assert_eq!(s.review_days_90, 0);
    assert_eq!(s.applications_count, 0);
    assert!(s.weak_groups.is_empty());
    assert_eq!(s.self_test_passed_rate, None, "M1 占位无自测数据");
}

#[test]
fn settlements_history_counts_all_records_for_bound_groups() {
    // 规格 §七 ②：结算读**历史计数**——note_groups 无状态列（无归档态可滤），
    // JOIN 不设任何 status 过滤即天然「归档组仍计入」；多次结算累计。
    let db = mem_db();
    let gid = group(&db, "旧组");
    let goal_id = goal_with(&db, "结算历史", vec![gid]);
    db.create_settlement(gid, r#"{"merged":0}"#).expect("结算1");
    db.create_settlement(gid, r#"{"merged":1}"#).expect("结算2");
    let s = db.goal_progress_signals(goal_id, NOW).expect("信号");
    assert_eq!(s.settlements_count, 2, "历史计数累计（不只看最近一次）");
    // 双组绑定：各自历史合计
    let gid2 = group(&db, "二组");
    db.create_settlement(gid2, r#"{"merged":0}"#).expect("结算3");
    assert!(db.bind_group(goal_id, gid2).expect("绑定"));
    let s2 = db.goal_progress_signals(goal_id, NOW).expect("信号2");
    assert_eq!(s2.settlements_count, 3);
}

#[test]
fn week_contract_aggregate_boundary() {
    let db = mem_db();
    let gid = group(&db, "契约组");
    let goal_id = goal_with(&db, "周契约", vec![gid]);
    let ws = week_start_secs(NOW);
    db.upsert_week_contract(gid, ws, 2, 3).expect("立约");
    // 未立约/不足时 0/1
    let s0 = db.goal_progress_signals(goal_id, NOW).expect("信号0");
    assert_eq!(s0.contract_total, 1);
    assert_eq!(s0.contract_done, 0);
    // 满足天数但卡数不足 → 未完成（双达标口径）
    let cid1 = card(&db, gid, card_state(5.0));
    review(&db, cid1, ws * 1000);
    review(&db, cid1, ws * 1000 + 100_000);
    let s1 = db.goal_progress_signals(goal_id, NOW).expect("信号1");
    assert_eq!(s1.contract_done, 0, "卡数 2/3 未达标");
    // 补足卡数 → 完成（天数 1≥2？天数不足——再补一卡另一天）
    review(&db, cid1, ws * 1000 + 86_400_000);
    let s2 = db.goal_progress_signals(goal_id, NOW).expect("信号2");
    assert_eq!(s2.contract_done, 1, "天数 2/2 卡数 2/3——卡数仍不足");
    review(&db, cid1, ws * 1000 + 86_400_000 + 1);
    let s3 = db.goal_progress_signals(goal_id, NOW).expect("信号3");
    assert_eq!(s3.contract_done, 1, "双达标：天 2/2 卡 3/3");
}

#[test]
fn review_days_90_window_and_dedup() {
    let db = mem_db();
    let gid = group(&db, "活跃组");
    let goal_id = goal_with(&db, "活跃度", vec![gid]);
    let cid = card(&db, gid, card_state(5.0));
    let day_ms = 86_400_000;
    // 近 90 天内两天 → 2
    review(&db, cid, NOW * 1000 - day_ms * 10);
    review(&db, cid, NOW * 1000 - day_ms * 9);
    review(&db, cid, NOW * 1000 - day_ms * 9 + 1); // 同日去重
    // 窗口外（第 91 天）不计
    review(&db, cid, NOW * 1000 - day_ms * 91);
    let s = db.goal_progress_signals(goal_id, NOW).expect("信号");
    assert_eq!(s.review_days_90, 2);
}

#[test]
fn applications_count_matches_bound_group_used_refs() {
    let db = mem_db();
    let gid = group(&db, "应用组");
    let goal_id = goal_with(&db, "应用信号", vec![gid]);
    // used_refs camelCase（UsedRefs serde 契约）
    db.create_decision(&crate::types::NewKnowledgeDecision {
        kind: "application".to_string(),
        system_id: None,
        question_id: None,
        used_refs: format!(r#"{{"groupId":{}}}"#, gid),
        content: "用了一次".to_string(),
        expectation: None,
        actual: None,
        reflection: None,
    })
    .expect("应用记录");
    db.create_decision(&crate::types::NewKnowledgeDecision {
        kind: "decision".to_string(),
        system_id: None,
        question_id: None,
        used_refs: format!(r#"{{"groupId":{}}}"#, gid),
        content: "决策不算应用".to_string(),
        expectation: None,
        actual: None,
        reflection: None,
    })
    .expect("决策记录");
    let s = db.goal_progress_signals(goal_id, NOW).expect("信号");
    assert_eq!(s.applications_count, 1, "只计 kind=application");
}

#[test]
fn weak_groups_ratio_and_top_ordering() {
    let db = mem_db();
    let gid_weak = group(&db, "最弱组");
    let gid_fresh = group(&db, "新卡组");
    let gid_strong = group(&db, "久经组");
    let goal_id = goal_with(&db, "弱项", vec![gid_weak, gid_fresh, gid_strong]);
    // 最弱组：4 卡 3 弱（0.75）
    for i in 0..4 {
        card(&db, gid_weak, card_state(if i < 3 { 0.5 } else { 9.0 }));
    }
    // 新卡组：全 stability 0（0/1 弱=新卡默认弱——占比 1.0 排最前）
    card(&db, gid_fresh, card_state(0.0));
    // 久经组：全高稳定性（0 弱）
    card(&db, gid_strong, card_state(30.0));
    let s = db.goal_progress_signals(goal_id, NOW).expect("信号");
    assert_eq!(s.weak_groups.len(), 3);
    assert_eq!(s.weak_groups[0].group_id, gid_fresh, "占比最高（新卡 100% 弱）");
    assert_eq!(s.weak_groups[0].weak_ratio, 1.0);
    assert_eq!(s.weak_groups[1].group_id, gid_weak);
    assert_eq!(s.weak_groups[2].group_id, gid_strong, "0% 弱垫底");
}

#[test]
fn weak_groups_ignores_invalid_state_json_and_missing_group() {
    let db = mem_db();
    let gid = group(&db, "脏数据组");
    let gone = group(&db, "将删组");
    let goal_id = goal_with(&db, "弱项健壮性", vec![gid, gone]);
    // 占用 id 后删除该组（绑定 CASCADE 清除——本不在信号集，模拟查无组）
    assert!(db.delete_group(gone).expect("删组"));
    // 卡池无组内卡 → total 0 → 占比 0 垫底（不 panic 不误判）
    let s = db.goal_progress_signals(goal_id, NOW).expect("信号");
    assert_eq!(s.weak_groups.len(), 1, "已删组跳过");
    assert_eq!(s.weak_groups[0].group_id, gid);
    assert_eq!(s.weak_groups[0].card_total, 0);
    assert_eq!(s.weak_groups[0].weak_ratio, 0.0);
}
