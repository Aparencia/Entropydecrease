//! 会话数据层单测（AAA 模式；内存库隔离，绝不触碰真实文件）。
//!
//! @ai-context: 由 db_sessions.rs 以 #[cfg(test)] #[path] 引入，保持实现文件 ≤300 行
//!              （AGENTS.md §3 模块化）。

use crate::db::Db;
use crate::db_sessions::{SESSION_STATUS_FINISHED, SESSION_STATUS_RECORDING};
use crate::types::{NewNote, NewSession, NewSessionOcrBlock, NewSessionSegment};

fn mem_db() -> Db {
    // Arrange：内存库，绝不触碰真实文件（环境隔离）
    Db::open(":memory:").expect("open in-memory db")
}

fn new_session(title: &str) -> NewSession {
    NewSession { title: title.into(), source_window: Some("网课窗口".into()), profile: None }
}

fn segment(session_id: i64, start_ms: u64, end_ms: u64, text: &str) -> NewSessionSegment {
    NewSessionSegment {
        session_id,
        start_ms,
        end_ms,
        text: text.into(),
        source: "asr".into(),
        confidence: Some(0.9),
    }
}

#[test]
fn create_and_get_session_roundtrip() {
    // Arrange
    let db = mem_db();
    // Act
    let created = db.create_session(&new_session("物理课")).expect("create");
    let fetched = db.get_session(created.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.title, "物理课");
    assert_eq!(fetched.source_window.as_deref(), Some("网课窗口"));
    assert_eq!(fetched.status, SESSION_STATUS_RECORDING);
    assert!(fetched.ended_at.is_none());
}

#[test]
fn finish_session_updates_status_once() {
    // Arrange
    let db = mem_db();
    let created = db.create_session(&new_session("化学课")).unwrap();
    // Act
    let first = db.finish_session(created.id).expect("finish");
    let second = db.finish_session(created.id).expect("finish again");
    let fetched = db.get_session(created.id).unwrap().unwrap();
    // Assert：幂等——第二次不改变状态
    assert!(first);
    assert!(!second);
    assert_eq!(fetched.status, SESSION_STATUS_FINISHED);
    assert!(fetched.ended_at.is_some());
}

#[test]
fn list_sessions_orders_by_started_desc_and_filters_keyword() {
    // Arrange
    let db = mem_db();
    let a = db.create_session(&new_session("物理课")).unwrap();
    let b = db.create_session(&new_session("数学课")).unwrap();
    let c = db.create_session(&NewSession { title: "随笔".into(), source_window: None, profile: None }).unwrap();
    // Act
    let all = db.list_sessions(None, 10, 0).expect("list all");
    let matched = db.list_sessions(Some("物理"), 10, 0).expect("list by keyword");
    let by_window = db.list_sessions(Some("网课窗口"), 10, 0).expect("list by window");
    // Assert：同秒创建时按 id 倒序（新会话在前）；关键词/窗口名可命中
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].id, c.id);
    assert_eq!(all[1].id, b.id);
    assert_eq!(all[2].id, a.id);
    assert_eq!(matched.len(), 1);
    assert_eq!(matched[0].title, "物理课");
    assert_eq!(by_window.len(), 2);
}

#[test]
fn list_sessions_paginates() {
    // Arrange
    let db = mem_db();
    for i in 0..5 {
        db.create_session(&NewSession { title: format!("课{}", i), source_window: None, profile: None }).unwrap();
    }
    // Act
    let page1 = db.list_sessions(None, 2, 0).unwrap();
    let page2 = db.list_sessions(None, 2, 2).unwrap();
    // Assert
    assert_eq!(page1.len(), 2);
    assert_eq!(page2.len(), 2);
    assert_ne!(page1[0].id, page2[0].id);
}

#[test]
fn delete_session_cascades_children() {
    // Arrange：外键级联删除（PRAGMA foreign_keys=ON 在 open 时开启）
    let db = mem_db();
    let created = db.create_session(&new_session("待删")).unwrap();
    db.add_segment(&segment(created.id, 0, 1000, "内容")).unwrap();
    db.add_ocr_block(&NewSessionOcrBlock {
        session_id: created.id,
        timestamp_ms: 500,
        text: "板书".into(),
        score: 0.9,
        region: "full".into(),
        region_kind: None,
    })
    .unwrap();
    // Act
    let ok = db.delete_session(created.id).expect("delete");
    // Assert：会话与子表全部清除
    assert!(ok);
    assert!(db.get_session(created.id).unwrap().is_none());
    assert!(db.list_segments(created.id).unwrap().is_empty());
    assert!(db.list_ocr_blocks(created.id).unwrap().is_empty());
}

#[test]
fn recent_ocr_texts_returns_latest_sessions_only() {
    // 审查修复核对：recent_ocr_texts 只取最近 N 会话、按 (session, text) 返回、会话倒序
    let db = mem_db();
    let s1 = db.create_session(&new_session("旧")).unwrap();
    let s2 = db.create_session(&new_session("新")).unwrap();
    for (sid, ts, text) in [(s1.id, 100, "旧会话文字"), (s2.id, 100, "新会话文字"), (s2.id, 200, "新会话第二行")] {
        db.add_ocr_block(&NewSessionOcrBlock {
            session_id: sid,
            timestamp_ms: ts,
            text: text.into(),
            score: 0.9,
            region: "full".into(),
            region_kind: None,
        })
        .unwrap();
    }
    // Act：最近 1 个会话
    let rows = db.recent_ocr_texts(1).unwrap();
    // Assert：只含 s2 的两行，且 session_id 正确
    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|(sid, _)| *sid == s2.id));
    assert!(rows.iter().any(|(_, t)| t == "新会话文字"));
    assert!(rows.iter().any(|(_, t)| t == "新会话第二行"));
    // 最近 2 个会话 → 全部 3 行
    assert_eq!(db.recent_ocr_texts(2).unwrap().len(), 3);
    // 空库 → 空列表
    let db2 = mem_db();
    assert!(db2.recent_ocr_texts(3).unwrap().is_empty());
}

#[test]
fn add_segments_batch_commits_all() {
    // Arrange
    let db = mem_db();
    let created = db.create_session(&new_session("批量")).unwrap();
    let items: Vec<NewSessionSegment> = (0..150)
        .map(|i| segment(created.id, i * 1000, i * 1000 + 800, &format!("句{}", i)))
        .collect();
    // Act
    let inserted = db.add_segments_batch(&items).expect("batch");
    let listed = db.list_segments(created.id).unwrap();
    // Assert：150 条全部落库且按时间轴升序
    assert_eq!(inserted, 150);
    assert_eq!(listed.len(), 150);
    assert_eq!(listed[0].text, "句0");
    assert_eq!(listed[149].text, "句149");
}

#[test]
fn mark_interrupted_sessions_flags_recording() {
    // Arrange
    let db = mem_db();
    let live = db.create_session(&new_session("进行中")).unwrap();
    db.finish_session(db.create_session(&new_session("已完成")).unwrap().id).unwrap();
    // Act
    let affected = db.mark_interrupted_sessions().expect("mark");
    let fetched = db.get_session(live.id).unwrap().unwrap();
    // Assert：仅 recording 被标记 failed，finished 不动
    assert_eq!(affected, 1);
    assert_eq!(fetched.status, "failed");
    assert!(fetched.ended_at.is_some());
}

#[test]
fn session_notes_tables_coexist() {
    // Arrange：会话与笔记共享同一数据库（向后兼容验证）
    let db = mem_db();
    // Act
    let session = db.create_session(&new_session("共存")).unwrap();
    let note = db.create_note(&NewNote {
        title: "旧笔记".into(),
        content: "v0.1.0 数据".into(),
        source: "manual".into(),
    });
    // Assert
    assert!(note.is_ok());
    assert_eq!(db.list_sessions(None, 10, 0).unwrap().len(), 1);
    assert_eq!(db.list_notes().unwrap().len(), 1);
    assert_eq!(session.id, 1);
}
