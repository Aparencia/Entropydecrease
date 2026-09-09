//! db_ai_tasks.rs 单测（AAA 模式；内存库隔离——不触碰真实数据）。
//!
//! @ai-context: 覆盖：插入/终态更新/采纳标记/成本回填/恢复（未采纳成功
//!              结果）/历史列表/保留策略（每类型 50 条上限清理最旧）。
//! @ai-context 2026-09-09 批 1：任务表最大 id 查询 + 启动序列下限纯函数
//!              （防重启后新任务复用历史 task_id 顶替历史行——含已采纳）。

use crate::commands_ai_refine::task_seq_lower_bound;
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
        target_kind: None,
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

#[test]
fn find_latest_unadopted_refine_by_session() {
    let db = open_mem();
    // Arrange：同会话两条成功任务（旧+新）+ 他会话已采纳任务 + 他类任务
    db.insert_ai_task(&rec(10, "refine", 5, "succeeded")).unwrap();
    db.insert_ai_task(&rec(20, "refine", 5, "succeeded")).unwrap();
    db.insert_ai_task(&rec(30, "refine", 6, "succeeded")).unwrap();
    db.mark_ai_task_adopted(30).unwrap();
    db.insert_ai_task(&rec(40, "enrich", 5, "succeeded")).unwrap();
    // Act + Assert：取最新未采纳（created_at=20）；已采纳/他类/不存在 → None
    let found = db.find_latest_unadopted_refine(5).unwrap();
    assert_eq!(found.as_ref().map(|t| t.task_id), Some(20), "应取同会话最新未采纳成功任务");
    assert!(db.find_latest_unadopted_refine(6).unwrap().is_none(), "已采纳任务不返回");
    assert!(db.find_latest_unadopted_refine(999).unwrap().is_none(), "无任务不返回");
}

#[test]
fn adopted_query_true_after_mark_false_otherwise() {
    let db = open_mem();
    db.insert_ai_task(&rec(8, "refine", 4, "succeeded")).unwrap();
    // 未采纳 → false
    assert!(!db.is_ai_task_adopted(8));
    // 标记后 → true
    db.mark_ai_task_adopted(8).unwrap();
    assert!(db.is_ai_task_adopted(8));
    // 不存在的任务 → false（防御方向保守——旧任务无记录放行）
    assert!(!db.is_ai_task_adopted(999));
}

#[test]
fn max_task_id_spans_all_states_not_only_restorable() {
    // Arrange（2026-09-09 批 1 回归形状）：id 更大的已采纳/failed/running
    // 行均不在启动恢复集——旧实现按恢复集越序列会漏掉它们，重启后新任务
    // 复用这些 task_id 并 REPLACE 顶替（含已采纳——数据丢失）
    let db = open_mem();
    let mut adopted = rec(80, "refine", 1, "succeeded");
    adopted.adopted = true;
    db.insert_ai_task(&adopted).unwrap();
    db.insert_ai_task(&rec(120, "refine", 2, "failed")).unwrap();
    db.insert_ai_task(&rec(95, "enrich", 3, "running")).unwrap();
    // Act + Assert：全表最大 id = 120（不被恢复集 80 封顶）
    assert_eq!(db.max_ai_task_id().unwrap(), 120);
    // 空表 → 0（序列下限不后退，起点维持 1）
    assert_eq!(open_mem().max_ai_task_id().unwrap(), 0);
}

#[test]
fn seq_lower_bound_never_reuses_existing_row_ids() {
    // 空表（db_max=0）→ 至少 1（与 task_seq 初始值一致）
    assert_eq!(task_seq_lower_bound(1, 0), 1);
    // DB 最大 id 41（如已采纳历史行）→ 下限 42：新任务不复用 1..=41
    assert_eq!(task_seq_lower_bound(1, 41), 42);
    assert_eq!(task_seq_lower_bound(10, 41), 42);
    // 当前值已更大 → 只前进不回退
    assert_eq!(task_seq_lower_bound(300, 41), 300);
    // 极端：u64::MAX 不 panic（saturating_add）且不前进
    assert_eq!(task_seq_lower_bound(u64::MAX, u64::MAX), u64::MAX);
}
