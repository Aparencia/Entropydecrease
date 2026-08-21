//! 批量转笔记编排单测（v0.7.1 会话体验批次）。
//!
//! @ai-context: 由 commands_session.rs 以 #[cfg(test)] #[path] 引入；
//!              被测对象 run_batch_conversion 为纯编排（注入 Db + UiJunkList），
//!              全部走 :memory: 隔离库（环境隔离——不触碰真实数据）。
//! @ai-context: v0.7.6 审查硬拆：run_batch_conversion 随笔记管线移入
//!              commands_session_note.rs——本测试引用随之更新。

use crate::commands_session_note::run_batch_conversion;
use crate::db::Db;
use crate::types::{NewNote, NewSession, NewSessionSegment};
use crate::ui_junk::UiJunkList;

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

/// 造一个已结束（finished）且有转写内容的会话。
fn finished_session(db: &Db, title: &str) -> i64 {
    let s = db
        .create_session(&NewSession {
            title: title.into(),
            source_window: None,
            profile: None,
        })
        .expect("create session");
    db.finish_session(s.id).expect("finish session");
    db.add_segment(&NewSessionSegment {
        session_id: s.id,
        start_ms: 0,
        end_ms: 1000,
        text: format!("{} 的转写内容", title),
        source: "asr".into(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    })
    .expect("add segment");
    s.id
}

/// 造一个录制中会话。
fn recording_session(db: &Db, title: &str) -> i64 {
    db.create_session(&NewSession {
        title: title.into(),
        source_window: None,
        profile: None,
    })
    .expect("create session")
    .id
}

#[test]
fn batch_converts_all_eligible_sessions() {
    // Arrange：两个已结束且有内容的会话
    let db = mem_db();
    let a = finished_session(&db, "A课");
    let b = finished_session(&db, "B课");
    // Act
    let result = run_batch_conversion(
        &db,
        &UiJunkList::defaults(),
        &crate::note_filter::PurifyEnv::default(),
        std::path::Path::new("."), vec![a, b]).expect("batch");
    // Assert：全部转换成功；关联已建立（find_note_by_session 可见）
    assert_eq!(result.converted.len(), 2);
    assert!(result.skipped.is_empty());
    for item in &result.converted {
        assert!(db.find_note_by_session(item.session_id).unwrap().is_some());
    }
}

#[test]
fn batch_skips_recording_and_duplicate_and_invalid() {
    // Arrange：录制中 + 重复 id + 无效 id + 正常会话
    let db = mem_db();
    let live = recording_session(&db, "直播中");
    let ok = finished_session(&db, "正常课");
    // Act
    let result =
        run_batch_conversion(
        &db,
        &UiJunkList::defaults(),
        &crate::note_filter::PurifyEnv::default(),
        std::path::Path::new("."), vec![live, ok, ok, 0, -3]).expect("batch");
    // Assert：只转换 1 条；跳过 3 条（重复 id 静默去重，不计入跳过）
    assert_eq!(result.converted.len(), 1);
    assert_eq!(result.converted[0].session_id, ok);
    assert_eq!(result.skipped.len(), 3);
    let reasons: Vec<&str> = result.skipped.iter().map(|s| s.reason.as_str()).collect();
    assert!(reasons.contains(&"进行中的会话不能生成笔记"));
    assert!(reasons.contains(&"无效的会话 id"));
    // 重复 id 静默去重——不重复转换也不报错
    assert_eq!(reasons.iter().filter(|r| r.contains("已转笔记")).count(), 0);
}

#[test]
fn batch_skips_already_converted_session() {
    // Arrange：会话已转过一次笔记
    let db = mem_db();
    let id = finished_session(&db, "已转课");
    db.create_note(&NewNote {
        title: "已有笔记".into(),
        content: "x".into(),
        source: "classroom".into(),
        session_id: Some(id),
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: None,
    })
    .expect("create note");
    // Act
    let result = run_batch_conversion(
        &db,
        &UiJunkList::defaults(),
        &crate::note_filter::PurifyEnv::default(),
        std::path::Path::new("."), vec![id]).expect("batch");
    // Assert：不重复生成，原因显式
    assert!(result.converted.is_empty());
    assert_eq!(result.skipped.len(), 1);
    assert!(result.skipped[0].reason.contains("已转笔记"));
}

#[test]
fn batch_skips_missing_session() {
    // Arrange
    let db = mem_db();
    // Act：不存在的会话 id
    let result = run_batch_conversion(
        &db,
        &UiJunkList::defaults(),
        &crate::note_filter::PurifyEnv::default(),
        std::path::Path::new("."), vec![9999]).expect("batch");
    // Assert
    assert!(result.converted.is_empty());
    assert_eq!(result.skipped.len(), 1);
    assert_eq!(result.skipped[0].reason, "会话不存在");
}

#[test]
fn batch_rejects_over_limit() {
    // Arrange：51 个 id（上限 50）
    let db = mem_db();
    let ids: Vec<i64> = (1..=51).collect();
    // Act
    let result = run_batch_conversion(
        &db,
        &UiJunkList::defaults(),
        &crate::note_filter::PurifyEnv::default(),
        std::path::Path::new("."), ids);
    // Assert
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("上限 50"));
}

#[test]
fn batch_partial_failure_does_not_block_others() {
    // Arrange：录制中 + 正常 混排（录制中在前，验证不阻塞后续）
    let db = mem_db();
    let live = recording_session(&db, "直播中");
    let ok = finished_session(&db, "正常课");
    // Act
    let result =
        run_batch_conversion(
        &db,
        &UiJunkList::defaults(),
        &crate::note_filter::PurifyEnv::default(),
        std::path::Path::new("."), vec![live, ok]).expect("batch");
    // Assert：后续会话仍成功转换
    assert_eq!(result.converted.len(), 1);
    assert_eq!(result.converted[0].session_id, ok);
    assert_eq!(result.skipped.len(), 1);
    assert_eq!(result.skipped[0].session_id, live);
}
