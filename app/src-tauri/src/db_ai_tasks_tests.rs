//! db_ai_tasks.rs 单测（AAA 模式；内存库隔离——不触碰真实数据）。
//!
//! @ai-context: 覆盖：插入/终态更新/采纳标记/成本回填/恢复（未采纳成功
//!              结果）/历史列表/保留策略（每类型 50 条上限清理最旧）。

use crate::db::Db;
use crate::db_ai_tasks::{AiTaskRecord, TASKS_KEEP_PER_TYPE};

fn open_mem() -> Db {
    let db = Db::open(":memory:").expect("open mem db");
    db.init_ai_tasks().expect("init ai_tasks");
    db
}

fn rec(task_id: u64, op: &str, ref_id: i64, state: &str) -> AiTaskRecord {
    AiTaskRecord {
        task_id,
        op_type: op.to_string(),
        ref_id,
        state: state.to_string(),
        result_json: if state == "succeeded" { Some("{\"k\":1}".to_string()) } else { None },
        cost_yuan: None,
        elapsed_ms: None,
        model: Some("m".to_string()),
        error: None,
        slices: Some(1),
        created_at: task_id as i64,
        finished_at: if state == "succeeded" { Some(task_id as i64) } else { None },
        adopted: false,
    }
}

#[test]
fn insert_and_finish_roundtrip() {
    // Arrange
    let db = open_mem();
    db.insert_ai_task(&rec(1, "refine", 7, "pending")).unwrap();
    // Act：终态更新
    db.finish_ai_task(1, "succeeded", Some("{\"k\":1}"), None, 1200).unwrap();
    // Assert：恢复列表可见（未采纳成功结果）
    let restorable = db.list_restorable_succeeded(10).unwrap();
    assert_eq!(restorable.len(), 1);
    assert_eq!(restorable[0].state, "succeeded");
    assert_eq!(restorable[0].elapsed_ms, Some(1200));
    assert!(!restorable[0].adopted);
}

#[test]
fn adopted_excluded_from_restore() {
    // Arrange：已采纳任务
    let db = open_mem();
    db.insert_ai_task(&rec(2, "refine", 8, "succeeded")).unwrap();
    db.mark_ai_task_adopted(2).unwrap();
    // Act
    let restorable = db.list_restorable_succeeded(10).unwrap();
    // Assert：采纳后不可恢复（防重启重复采纳）
    assert!(restorable.is_empty());
}

#[test]
fn failed_and_running_not_restorable() {
    // Arrange：失败 + 进行中任务
    let db = open_mem();
    let mut failed = rec(3, "refine", 9, "failed");
    failed.result_json = None;
    db.insert_ai_task(&failed).unwrap();
    db.insert_ai_task(&rec(4, "enrich", 10, "running")).unwrap();
    // Act
    let restorable = db.list_restorable_succeeded(10).unwrap();
    // Assert：仅 succeeded + adopted=0 可恢复
    assert!(restorable.is_empty());
}

#[test]
fn list_tasks_filters_by_op_type() {
    let db = open_mem();
    db.insert_ai_task(&rec(5, "refine", 1, "succeeded")).unwrap();
    db.insert_ai_task(&rec(6, "enrich", 2, "failed")).unwrap();
    let refined = db.list_ai_tasks("refine", 10).unwrap();
    assert_eq!(refined.len(), 1);
    assert_eq!(refined[0].task_id, 5);
    let enriched = db.list_ai_tasks("enrich", 10).unwrap();
    assert_eq!(enriched.len(), 1);
    assert_eq!(enriched[0].task_id, 6);
}

#[test]
fn trim_keeps_latest_terminal_per_type() {
    let db = open_mem();
    // 超上限：每类型插入 KEEP+10 条终态任务
    let n = TASKS_KEEP_PER_TYPE + 10;
    for i in 1..=n {
        db.insert_ai_task(&rec(i as u64, "refine", 1, "succeeded")).unwrap();
    }
    db.trim_ai_tasks().unwrap();
    let list = db.list_ai_tasks("refine", 10_000).unwrap();
    assert_eq!(list.len(), TASKS_KEEP_PER_TYPE as usize, "保留策略：只留最新 50 条");
    // 最旧被清（created_at=1 的已删）
    assert!(list.iter().all(|t| t.task_id >= (n - TASKS_KEEP_PER_TYPE + 1) as u64));
}

#[test]
fn trim_keeps_running_tasks() {
    let db = open_mem();
    for i in 1..=60 {
        let state = if i <= 55 { "succeeded" } else { "running" };
        db.insert_ai_task(&rec(i as u64, "refine", 1, state)).unwrap();
    }
    db.trim_ai_tasks().unwrap();
    let list = db.list_ai_tasks("refine", 10_000).unwrap();
    // 55 条终态 → 裁到 50；5 条 running 保留
    assert_eq!(list.len(), 55);
}

#[test]
fn cost_backfill_updates_record() {
    let db = open_mem();
    db.insert_ai_task(&rec(7, "refine", 3, "succeeded")).unwrap();
    db.update_ai_task_cost(7, 0.5).unwrap();
    let list = db.list_ai_tasks("refine", 10).unwrap();
    assert_eq!(list[0].cost_yuan, Some(0.5));
}
