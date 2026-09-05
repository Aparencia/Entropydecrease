//! web_capture 纯逻辑单测（v0.20.4 / REQ-303）。

use super::*;

const SAMPLE: &str = r#"<!doctype html><html><head>
<title>熵减方法论</title>
<meta property="og:site_name" content="Aparencia 博客">
<meta name="author" content="张三">
<meta property="article:published_time" content="2026-09-01T10:00:00Z">
</head><body><article>
<h1>熵减方法论</h1>
<p>第一段内容——本地优先与数据不出机。</p>
<ul><li>要点甲</li><li>要点乙</li></ul>
<p>第二段补充说明。</p>
</article><script>var x=1;</script></body></html>"#;

#[test]
fn extract_title_and_meta() {
    let page = extract_page(SAMPLE);
    assert_eq!(page.title, "熵减方法论");
    assert_eq!(page.site.as_deref(), Some("Aparencia 博客"));
    assert_eq!(page.author.as_deref(), Some("张三"));
    assert_eq!(page.published.as_deref(), Some("2026-09-01T10:00:00Z"));
}

#[test]
fn extract_body_keeps_heading_and_bullets() {
    let page = extract_page(SAMPLE);
    assert!(page.ok);
    assert!(page.markdown.contains("# 熵减方法论"), "{}", page.markdown);
    assert!(page.markdown.contains("- 要点甲"));
    assert!(page.markdown.contains("第一段内容"));
    assert!(!page.markdown.contains("var x=1"), "script 剔除");
}

#[test]
fn entity_decode_and_collapse() {
    let page = extract_page("<html><body><p>甲 &amp; 乙 &nbsp;&nbsp;丙</p></body></html>");
    assert!(page.markdown.contains("甲 & 乙 丙"));
}

#[test]
fn body_too_short_marks_fail() {
    let page = extract_page("<html><head><title>仅标题</title></head><body><p>短</p></body></html>");
    assert!(!page.ok, "正文过少=抽取失败（走 raw_html 降级链）");
}
