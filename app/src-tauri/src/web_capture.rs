//! web 页面静态抽取（v0.20.4 / REQ-303 内核纯逻辑）。
//!
//! @ai-context: 阶段 1 = 静态直取（不渲染 JS——SPA/登录墙缺口由阶段 2 扩展
//!              读已登录 DOM 补齐，Foresight 定案裁决 4）；抽取=轻量规则化
//!              转 MD（标题层级保留→标题锚点回链语义；正文为整篇初稿，原子化
//!              拆解留给核心处理 γ——两阶段不互相阻塞）。
//! @ai-context: 诚实降级——正文文本过少视为抽取失败（extracted_ok=0）并保留
//!              raw_html 附件；规则只处理常见静态页，不做全站承诺。
//! @ai-context: 纯函数无 IO（HTML→元数据/MD），全可单测。

/// 抽取结果。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ExtractedPage {
    pub title: String,
    pub site: Option<String>,
    pub author: Option<String>,
    pub published: Option<String>,
    /// 正文 Markdown（标题层级 + 段落 + 列表）
    pub markdown: String,
    /// 抽取是否成功（正文长度门槛）
    pub ok: bool,
}

/// 正文过少即失败门槛（字符）。
const MIN_BODY_CHARS: usize = 40;

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

fn meta_content(html: &str, key: &str) -> Option<String> {
    // og:* 与 name=key 双态；属性顺序宽容（content 在 name 后也认）
    for pat in [
        &format!("property=\"og:{}\"", key),
        &format!("property='og:{}'", key),
        &format!("property=\"{}\"", key),
        &format!("property='{}'", key),
        &format!("name=\"{}\"", key),
        &format!("name='{}'", key),
    ] {
        if let Some(pos) = html.find(pat) {
            let rest = &html[pos + pat.len()..];
            if let Some(cpos) = rest.find("content=\"") {
                let v = &rest[cpos + "content=\"".len()..];
                if let Some(end) = v.find('"') {
                    let val = decode_entities(&v[..end]).trim().to_string();
                    if !val.is_empty() {
                        return Some(val);
                    }
                }
            } else if let Some(cpos) = rest.find("content='") {
                let v = &rest[cpos + "content='".len()..];
                if let Some(end) = v.find('\'') {
                    let val = decode_entities(&v[..end]).trim().to_string();
                    if !val.is_empty() {
                        return Some(val);
                    }
                }
            }
        }
    }
    None
}

fn extract_title(html: &str) -> String {
    if let Some(t) = meta_content(html, "title").or_else(|| meta_content(html, "og:title")) {
        if !t.is_empty() {
            return t.chars().take(200).collect();
        }
    }
    // <title> 标签兜底（无 og/meta title 的常见静态页）
    if let Some(pos) = html.find("<title") {
        let after = &html[pos..];
        if let Some(start) = after.find('>') {
            let inner = &after[start + 1..];
            if let Some(end) = inner.find("</title") {
                let t = decode_entities(inner[..end].trim()).trim().to_string();
                if !t.is_empty() {
                    return t.chars().take(200).collect();
                }
            }
        }
    }
    String::new()
}

/// URL 主机名（会话标题兜底；纯函数）。
pub fn host_of(url: &str) -> Option<String> {
    let rest = url.split("://").nth(1)?;
    Some(
        rest.split(['/', '?', '#'])
            .next()
            .unwrap_or("")
            .chars()
            .take(100)
            .collect(),
    )
}

/// HTML → Markdown 正文（轻量规则：script/style 剔除；块级换行；标题/列表/
/// 链接/图片简化；实体解码）。
///
/// @ai-context: 不做 DOM 语义重排（readability 兜底在 WebView 注入面阶段 2 补）；
///              常见静态页正文足够——精确度不承诺，失败降级链见模块头注。
pub fn html_to_markdown(html: &str) -> String {
    let mut out = String::new();
    let mut chars = html.chars().peekable();
    let mut in_script = 0usize;
    let mut buf: Vec<char> = Vec::new(); // 当前文本缓冲
    let flush_text = |buf: &mut Vec<char>, out: &mut String| {
        let t: String = buf.drain(..).collect();
        let t = collapse_space(&decode_entities(&t));
        if !t.is_empty() {
            out.push_str(&t);
            out.push('\n');
        }
    };
    while let Some(c) = chars.next() {
        if c == '<' {
            let tag: String = chars.by_ref().take_while(|&x| x != '>').collect();
            let lower = tag.to_ascii_lowercase();
            let name: String = lower.chars().take_while(|x| x.is_ascii_alphanumeric()).collect();
            let closing = lower.starts_with('/');
            match name.as_str() {
                "script" | "style" | "noscript" | "svg" | "template" => {
                    flush_text(&mut buf, &mut out);
                    if closing {
                        in_script = in_script.saturating_sub(1);
                    } else {
                        in_script += 1;
                    }
                }
                _ if in_script > 0 => {}
                "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                    flush_text(&mut buf, &mut out);
                    if !closing {
                        let level = name[1..].parse::<usize>().unwrap_or(1);
                        out.push_str(&"#".repeat(level));
                        out.push(' ');
                    }
                }
                "p" | "div" | "section" | "article" | "br" | "li" | "tr" | "blockquote" | "pre" | "ul" | "ol" | "table" => {
                    flush_text(&mut buf, &mut out);
                    if name == "li" && !closing {
                        out.push_str("- ");
                    }
                    if name == "br" || (name == "p" && !closing) {
                        out.push('\n');
                    }
                }
                "a" => {
                    if !closing {
                        if let Some(href) = tag.find("href=\"") {
                            let href = tag[href + "href=\"".len()..].split('"').next().unwrap_or("");
                            if href.starts_with("http") {
                                // 链接以 markdown 形式暂缓——正文保留文本（链接语义由
                                // 原标题锚点回链承担）；直接吞掉开标签
                            }
                        }
                    }
                }
                "img" => {
                    flush_text(&mut buf, &mut out);
                }
                _ => {}
            }
        } else if in_script == 0 {
            buf.push(c);
        }
    }
    flush_text(&mut buf, &mut out);
    out.lines()
        .map(|l| l.trim_end())
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

fn collapse_space(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_space = false;
    for c in s.chars() {
        let sp = c.is_whitespace();
        if sp && last_space {
            continue;
        }
        if sp {
            out.push(' ');
        } else {
            out.push(c);
        }
        last_space = sp;
    }
    out.trim().to_string()
}

/// 全页抽取入口（纯函数）：标题/元数据 + 正文 MD + 成功判定。
pub fn extract_page(html: &str) -> ExtractedPage {
    let title = extract_title(html);
    let site = meta_content(html, "site_name").map(|s| s.chars().take(100).collect());
    let author = meta_content(html, "author").map(|s| s.chars().take(100).collect());
    let published = meta_content(html, "article:published_time").map(|s| s.chars().take(50).collect());
    let markdown = html_to_markdown(html);
    let body_len = markdown.chars().count();
    ExtractedPage {
        title,
        site,
        author,
        published,
        markdown,
        ok: body_len >= MIN_BODY_CHARS,
    }
}

#[cfg(test)]
#[path = "web_capture_tests.rs"]
mod tests;
