//! note_group_assign 单测（内存库；AAA 模式）。

use crate::analysis::SessionAnalysis;
use crate::db::Db;
use crate::note_group_assign::{group_of_session, resolve_group_for_session};
use crate::types::{NewNote, Session, SessionOcrBlock, SessionSegment};

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 构造分析结果（serde 路径——practice 三字段 serde(default) 免填）。
fn analysis_with(chapters: usize, glossary: usize) -> SessionAnalysis {
    let chapter_json: Vec<String> = (0..chapters)
        .map(|i| format!(r#"{{"time_ms":{},"votes":2,"topic_drop":0.5}}"#, (i + 1) * 60000))
        .collect();
    let glossary_json: Vec<String> = (0..glossary)
        .map(|i| {
            format!(r#"{{"term":"术语{}","ocr_count":3,"asr_count":1,"score":3.0}}"#, i)
        })
        .collect();
    serde_json::from_str(&format!(
        r#"{{"chapters":[{}],"highlights":[],"glossary":[{}],
             "speaker_changes":[],"practice_points":[],"normalized_segments":[]}}"#,
        chapter_json.join(","),
        glossary_json.join(",")
    ))
    .expect("分析 JSON 构造")
}

/// 会话助手（标题/时长/形态可配）。
fn session(title: &str, duration_secs: i64, profile: Option<&str>) -> Session {
    Session {
        id: 1,
        title: title.to_string(),
        source_window: None,
        started_at: 1000,
        ended_at: Some(1000 + duration_secs),
        status: "finished".to_string(),
        profile: profile.map(|p| p.to_string()),
    }
}

/// 转写段助手。
fn segment(text: &str) -> SessionSegment {
    SessionSegment {
        id: 1,
        session_id: 1,
        start_ms: 0,
        end_ms: 1000,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: None,
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }
}

#[test]
fn series_sessions_share_course_group() {
    // Arrange：同系列 P1/P5（series_detect 剥集号后同键）
    let db = mem_db();
    let s1 = session("零基础化妆 P1", 3600, Some("lecture"));
    let s5 = session("零基础化妆 P5", 3600, Some("lecture"));
    let no_segs: Vec<SessionSegment> = vec![];
    let no_ocr: Vec<SessionOcrBlock> = vec![];
    // Act
    let g1 = resolve_group_for_session(&db, &s1, &analysis_with(0, 0), &no_segs, &no_ocr)
        .expect("resolve p1");
    let g5 = resolve_group_for_session(&db, &s5, &analysis_with(0, 0), &no_segs, &no_ocr)
        .expect("resolve p5");
    // Assert：同组（课程组幂等）且 kind=course
    assert_eq!(g1, g5);
    let group = db.get_group(g1).expect("get").expect("exists");
    assert_eq!(group.kind, "course");
    assert_eq!(group.series_key.as_deref(), Some("零基础化妆"));
}

#[test]
fn rich_lecture_becomes_standalone_group() {
    // Arrange：一小时 4 章节 + 8 术语——高结构共振
    let db = mem_db();
    let s = session("高等数学 微积分精讲", 3600, Some("lecture"));
    let segs = vec![segment("今天我们讲微积分的基本概念与定理")];
    let empty = vec![];
    // Act
    let gid = resolve_group_for_session(&db, &s, &analysis_with(4, 8), &segs, &empty)
        .expect("resolve");
    // Assert：独立组（自成一组），路由理由含高密度信号
    let group = db.get_group(gid).expect("get").expect("exists");
    assert_eq!(group.kind, "standalone");
    let reason = group.route_reason.expect("reason");
    assert!(reason.contains("\"own\""), "理由 JSON 应标记 own：{}", reason);
}

#[test]
fn low_structure_with_domain_joins_topic_group() {
    // Arrange：低结构（零章节零术语）+ 标题领域命中（化妆→beauty）
    let db = mem_db();
    let s1 = session("化妆小技巧分享", 300, Some("unknown"));
    let s2 = session("另一个化妆视频", 300, Some("unknown"));
    let segs = vec![segment("随便聊聊")];
    let empty: Vec<SessionOcrBlock> = vec![];
    // Act：两个低结构会话应共享同一主题组
    let g1 = resolve_group_for_session(&db, &s1, &analysis_with(0, 0), &segs, &empty)
        .expect("resolve 1");
    let g2 = resolve_group_for_session(&db, &s2, &analysis_with(0, 0), &segs, &empty)
        .expect("resolve 2");
    // Assert
    assert_eq!(g1, g2);
    let group = db.get_group(g1).expect("get").expect("exists");
    assert_eq!(group.kind, "topic");
    assert_eq!(group.domain_tag.as_deref(), Some("beauty"));
}

#[test]
fn group_of_session_inherits_from_note() {
    // Arrange：会话笔记已归组——精修基线继承路径
    let db = mem_db();
    let s = session("会话X", 3600, Some("lecture"));
    let segs = vec![segment("内容")];
    let empty: Vec<SessionOcrBlock> = vec![];
    let gid = resolve_group_for_session(&db, &s, &analysis_with(3, 6), &segs, &empty)
        .expect("resolve");
    db.create_session(&crate::types::NewSession {
        title: "会话X".into(),
        source_window: None,
        profile: None,
    })
    .expect("session");
    db.create_note(&NewNote {
        title: "会话X笔记".into(),
        content: "c".into(),
        source: "classroom".into(),
        session_id: Some(1),
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: Some(gid),
    })
    .expect("note");
    // Act
    let inherited = group_of_session(&db, 1).expect("inherit");
    // Assert
    assert_eq!(inherited, Some(gid));
}
