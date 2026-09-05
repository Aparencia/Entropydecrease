//! session_refine_drafts 表读写单测（v0.20.2 / REQ-268）。
//!
//! @ai-context: 内存库（:memory:）隔离——不触碰真实数据（AGENTS.md 环境隔离）；
//!              验收门槛「精修采纳流单测（原料不可变断言）」：本组用例落库/裁决
//!              全程不写 session_segments（原料表行数不变断言在 raw_rows 用例）。

use super::*;
use crate::db::Db;

fn new_session(db: &Db, title: &str) -> i64 {
    db.create_session(&crate::types::NewSession {
        title: title.to_string(),
        source_window: None,
        profile: None,
        kind: None,
    })
    .unwrap()
    .id
}

fn draft(session_id: i64, start_ms: u64, end_ms: u64, base: &str, refined: &str) -> NewRefineDraft {
    NewRefineDraft {
        session_id,
        origin: ORIGIN_SECOND_PASS.to_string(),
        start_ms,
        end_ms,
        base_text: base.to_string(),
        refined_text: refined.to_string(),
        source: SOURCE_ASR_PASS2.to_string(),
        confidence: None,
        similarity: Some(0.5),
    }
}

#[test]
fn add_list_decide_lifecycle() {
    // Arrange
    let db = Db::open(":memory:").unwrap();
    let sid = new_session(&db, "精修流测试");
    db.add_refine_drafts(&[
        draft(sid, 0, 30_000, "旧文本", "新文本"),
        draft(sid, 30_000, 60_000, "B", "C"),
    ])
    .unwrap();
    // Act：裁决第一条采纳、第二条回退
    let all = db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, None).unwrap();
    db.decide_refine_draft(all[0].id, STATUS_ADOPTED).unwrap();
    db.decide_refine_draft(all[1].id, STATUS_REJECTED).unwrap();
    // Assert
    let adopted = db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, Some(STATUS_ADOPTED)).unwrap();
    let rejected = db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, Some(STATUS_REJECTED)).unwrap();
    assert_eq!(adopted.len(), 1);
    assert_eq!(adopted[0].refined_text, "新文本");
    assert!(adopted[0].decided_at.is_some(), "采纳落裁决时间");
    assert_eq!(rejected.len(), 1);
    assert_eq!(rejected[0].refined_text, "C");
}

#[test]
fn decide_flip_back_and_forth() {
    // Arrange：采纳后可回退（rejected），可重新采纳——裁决双向可逆
    let db = Db::open(":memory:").unwrap();
    let sid = new_session(&db, "翻转测试");
    db.add_refine_drafts(&[draft(sid, 0, 10_000, "a", "b")]).unwrap();
    let d = db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, None).unwrap();
    // Act
    db.decide_refine_draft(d[0].id, STATUS_ADOPTED).unwrap();
    db.decide_refine_draft(d[0].id, STATUS_REJECTED).unwrap();
    // Assert
    let st = db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, Some(STATUS_REJECTED)).unwrap();
    assert_eq!(st.len(), 1);
    assert!(db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, Some(STATUS_ADOPTED)).unwrap().is_empty());
}

#[test]
fn invalid_status_rejected() {
    let db = Db::open(":memory:").unwrap();
    let sid = new_session(&db, "非法状态");
    db.add_refine_drafts(&[draft(sid, 0, 1_000, "a", "b")]).unwrap();
    let d = db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, None).unwrap();
    assert!(db.decide_refine_draft(d[0].id, "banana").is_err());
    // 清空守卫：adopted 不可直接清（先回退）
    db.decide_refine_draft(d[0].id, STATUS_ADOPTED).unwrap();
    assert!(db.clear_refine_drafts(sid, ORIGIN_SECOND_PASS, STATUS_ADOPTED).is_err());
    assert!(db.clear_refine_drafts(sid, ORIGIN_SECOND_PASS, STATUS_PENDING).is_ok());
}

#[test]
fn clear_pending_before_rerun() {
    // Arrange：pending 清理供重跑；rejected 历史可清
    let db = Db::open(":memory:").unwrap();
    let sid = new_session(&db, "重跑清理");
    db.add_refine_drafts(&[draft(sid, 0, 5_000, "a", "b"), draft(sid, 6_000, 9_000, "c", "d")])
        .unwrap();
    // Act
    let cleared = db.clear_refine_drafts(sid, ORIGIN_SECOND_PASS, STATUS_PENDING).unwrap();
    // Assert
    assert_eq!(cleared, 2);
    assert!(db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, None).unwrap().is_empty());
}

#[test]
fn raw_segments_untouched_by_draft_flow() {
    // 原料不可变断言：整条草稿流不写 session_segments（行数/内容恒等）
    let db = Db::open(":memory:").unwrap();
    let sid = new_session(&db, "原料不可变");
    db.add_segment(&crate::types::NewSessionSegment {
        session_id: sid,
        start_ms: 0,
        end_ms: 1_000,
        text: "原文".into(),
        source: "asr".into(),
        confidence: None,
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    })
    .unwrap();
    let before = db.list_segments(sid).unwrap();
    // Act：落草稿 + 采纳 + 回退
    db.add_refine_drafts(&[draft(sid, 0, 1_000, "原文", "离线更优")]).unwrap();
    let d = db.list_refine_drafts(sid, ORIGIN_SECOND_PASS, None).unwrap();
    db.decide_refine_draft(d[0].id, STATUS_ADOPTED).unwrap();
    db.decide_refine_draft(d[0].id, STATUS_REJECTED).unwrap();
    // Assert：原料表逐字节未变
    let after = db.list_segments(sid).unwrap();
    assert_eq!(before, after, "session_segments 在精修裁决全流程中不可变");
}
