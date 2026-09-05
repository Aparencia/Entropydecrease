//! commands_web_inbox 单测（v0.20.4 / REQ-304 收口函数）。

use super::*;
use crate::db::Db;
use crate::web_inbox::{IngestImage, IngestPayload};

#[test]
fn ingest_builds_web_session_and_rewrites_images() {
    let db = Db::open(":memory:").unwrap();
    let dir = std::env::temp_dir().join(format!("entropy-web-inbox-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let png_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYAAAAAMAASsJTYQA"
        .to_string();
    let payload = IngestPayload {
        title: Some("扩展投递".to_string()),
        url: Some("https://mp.weixin.qq.com/s/abc".to_string()),
        site: Some("公众号".to_string()),
        author: Some("作者甲".to_string()),
        markdown: format!("# 标题\n正文段落。\n![图1]({})\n", png_uri),
        images: vec![IngestImage { name: "图1.png".into(), data_base64: png_uri }],
    };
    let sid = ingest_from_extension(&db, &dir, None, &payload)
        .map_err(|e| panic!("{}", e))
        .unwrap();
    let page = db.get_web_page(sid).unwrap().unwrap();
    assert!(!page.markdown.contains("data:image"), "data URI 已改写为相对路径");
    assert!(page.markdown.contains("notes-images/web-"), "{}", page.markdown);
    let session = db.get_session(sid).unwrap().unwrap();
    assert_eq!(session.kind.as_deref(), Some("web"));
    assert_eq!(session.source_window.as_deref(), Some("https://mp.weixin.qq.com/s/abc"));
    let _ = std::fs::remove_dir_all(&dir);
}
