//! db_web 单测（v0.20.4 / REQ-303）。

use super::*;
use crate::db::Db;

#[test]
fn insert_get_roundtrip() {
    let db = Db::open(":memory:").unwrap();
    let sid = db
        .create_session(&crate::types::NewSession {
            title: "web 页".to_string(),
            source_window: Some("https://example.com/a".to_string()),
            profile: None,
            kind: Some("web".to_string()),
        })
        .unwrap()
        .id;
    let page = WebPage {
        session_id: sid,
        url: "https://example.com/a".to_string(),
        site: Some("example".to_string()),
        author: Some("张三".to_string()),
        published: None,
        markdown: "# 标题\n正文。".to_string(),
        raw_html: None,
        extracted_ok: true,
        fetched_at: 1,
    };
    db.insert_web_page(&page).unwrap();
    let got = db.get_web_page(sid).unwrap().unwrap();
    assert_eq!(got.url, page.url);
    assert!(got.extracted_ok);
    // 降级路径（raw_html 附件）
    let bad = WebPage {
        raw_html: Some("<html>原文</html>".to_string()),
        extracted_ok: false,
        ..page
    };
    db.insert_web_page(&bad).unwrap();
    let got2 = db.get_web_page(sid).unwrap().unwrap();
    assert!(!got2.extracted_ok);
    assert_eq!(got2.raw_html.as_deref(), Some("<html>原文</html>"));
    // 会话删除级联清页
    db.delete_session(sid).unwrap();
    assert!(db.get_web_page(sid).unwrap().is_none());
}
