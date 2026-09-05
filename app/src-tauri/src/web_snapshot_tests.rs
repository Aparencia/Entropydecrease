//! web_snapshot 纯逻辑单测（v0.20.4 / REQ-305）。

use super::*;

#[test]
fn resolve_url_forms() {
    assert_eq!(resolve_url("https://a.com/x/y.html", "/css/s.css").as_deref(), Some("https://a.com/css/s.css"));
    assert_eq!(resolve_url("https://a.com/x/y.html", "img/1.png").as_deref(), Some("https://a.com/x/img/1.png"));
    assert_eq!(resolve_url("https://a.com", "//cdn.e/x.js").as_deref(), Some("https://cdn.e/x.js"));
    assert_eq!(resolve_url("https://a.com/x", "https://b.com/z").as_deref(), Some("https://b.com/z"));
    assert!(resolve_url("https://a.com", "").is_none());
    assert!(resolve_url("not-a-url", "x").is_none());
}

#[test]
fn inline_styles_imgs_and_strip_external_scripts() {
    let html = r#"<html><head><link rel="stylesheet" href="/css/main.css">
<script src="https://evil.example/x.js"></script></head>
<body><img src="pic/logo.png" alt="logo"><script>var ok=1;</script><p>正文</p></body></html>"#;
    let mut resolver = |url: &str| match url {
        "https://a.com/css/main.css" => Some("aGFzaA==".to_string()), // base64('hash')
        "https://a.com/x/pic/logo.png" => Some("aWNvbg==".to_string()),
        _ => None,
    };
    let out = inline_html("https://a.com/x/y.html", html, &mut resolver);
    assert!(out.contains("data:text/css;base64,aGFzaA=="), "{}", out);
    assert!(out.contains("data:image/png;base64,aWNvbg=="), "{}", out);
    assert!(!out.contains("evil.example"), "外链脚本剔除");
    assert!(!out.contains("var ok=1"), "行内脚本同样剔除（离线打开零执行面）");
    assert!(out.contains("<p>正文</p>"));
}

#[test]
fn scrub_removes_event_attrs_and_javascript_urls() {
    let html = r#"<a href="javascript:alert(1)" onclick="x()" data-x="1">点我</a><img src="pic/a.png" onerror="x()"><iframe src="javascript:void(0)"></iframe>"#;
    let mut resolver = |url: &str| {
        if url.ends_with("pic/a.png") { Some("aQ==".to_string()) } else { None }
    };
    let out = inline_html("https://a.com/x/", html, &mut resolver);
    assert!(!out.contains("javascript:"), "{}", out);
    assert!(!out.contains("onclick"), "{}", out);
    assert!(!out.contains("onerror"), "{}", out);
    assert!(out.contains(">点我</a>") || out.contains("点我"), "{}", out);
}

#[test]
fn unresolvable_assets_keep_original_reference() {
    let html = r#"<img src="missing.png"><link rel="stylesheet" href="/gone.css">"#;
    let mut calls = 0;
    let out = inline_html("https://a.com/x/", html, &mut |_url: &str| {
        calls += 1;
        None
    });
    assert!(out.contains("missing.png"));
    assert!(out.contains("gone.css"));
    assert_eq!(calls, 2, "拉取失败保留原引用（降级链语义）");
}
