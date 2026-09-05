//! commands_web 单测（v0.20.4 / REQ-303 内核——转笔记管线用内存库）。

use super::*;
use crate::db::Db;

#[test]
fn web_to_note_pipeline() {
    let db = Db::open(":memory:").unwrap();
    let sid = db
        .create_session(&crate::types::NewSession {
            title: "熵减方法论".to_string(),
            source_window: Some("https://example.com/x".to_string()),
            profile: None,
            kind: Some("web".to_string()),
        })
        .unwrap()
        .id;
    db.insert_web_page(&WebPage {
        session_id: sid,
        url: "https://example.com/x".to_string(),
        site: Some("example".to_string()),
        author: Some("张三".to_string()),
        published: None,
        markdown: "# 熵减方法论\n正文第一段。\n- 要点甲\n".to_string(),
        raw_html: None,
        extracted_ok: true,
        fetched_at: 1,
    })
    .unwrap();
    let note = web_session_to_note_core(&db, sid).unwrap();
    assert_eq!(note.source, "web");
    assert_eq!(note.session_id, Some(sid));
    assert!(note.content.contains("正文第一段"));
    let props: serde_json::Value = serde_json::from_str(note.properties.as_deref().unwrap_or("{}")).unwrap();
    assert_eq!(props["url"], "https://example.com/x");
    assert_eq!(props["author"], "张三");
}

#[test]
fn failed_extraction_blocked_with_message() {
    let db = Db::open(":memory:").unwrap();
    let sid = db
        .create_session(&crate::types::NewSession {
            title: "降级页".to_string(),
            source_window: None,
            profile: None,
            kind: Some("web".to_string()),
        })
        .unwrap()
        .id;
    db.insert_web_page(&WebPage {
        session_id: sid,
        url: "https://example.com/bad".to_string(),
        site: None,
        author: None,
        published: None,
        markdown: String::new(),
        raw_html: Some("<html>原文</html>".to_string()),
        extracted_ok: false,
        fetched_at: 1,
    })
    .unwrap();
    let err = web_session_to_note_core(&db, sid).unwrap_err();
    assert!(err.contains("抽取失败"), "{}", err);
}
