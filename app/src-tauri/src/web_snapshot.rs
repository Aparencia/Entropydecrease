//! 整页静态快照（v0.20.4 / REQ-305——自研 core 内联，规避 SingleFile AGPL）。
//!
//! @ai-context: 渲染型整页 DOM+子资源内联需要隐藏 wry 窗口（tauri WebView2
//!              无 MHTML API——已否决，Foresight §二）；本模块提供**静态降级档**
//!              （monolith CC0 同思路自研：纯函数规则内联 <link>/<img>/样式块，
//!              外链脚本剔除防快照 XSS——快照是可离线查看的文档存档，不执行
//!              原文 JS）。渲染档（wry eval 注入）与截图兜底链登记后置。
//! @ai-context: 纯函数 + 注入 resolver（测试传假数据；生产=ureq 拉取），
//!              相对 URL 按页面 base 解析；资源数量/单个体量/总预算护栏。

/// 资源解析器：绝对 URL → data URI（None=拉取失败，保留原引用降级）。
pub type Resolver<'a> = &'a mut dyn FnMut(&str) -> Option<String>;

/// 相对引用按 base 解析（纯函数；仅 http(s)/同页锚/相对路径）。
pub fn resolve_url(base: &str, href: &str) -> Option<String> {
    let href = href.trim();
    if href.is_empty() {
        return None;
    }
    if href.starts_with("data:") || href.starts_with('#') {
        return Some(href.to_string());
    }
    if href.starts_with("http://") || href.starts_with("https://") {
        return Some(href.to_string());
    }
    if href.starts_with("//") {
        return Some(format!("https:{}", href)); // 协议相对
    }
    let scheme_split = base.find("://")?;
    let scheme_end = scheme_split + 3;
    let rest = &base[scheme_end..];
    let authority = rest.split('/').next().unwrap_or("");
    if href.starts_with('/') {
        return Some(format!("{}://{}{}", &base[..scheme_split], authority, href));
    }
    // 目录相对：取 base 目录（最后一个 / 之前，保留 authority）
    let dir = match rest.rfind('/') {
        Some(i) => rest[..=i].to_string(),
        None => format!("{}/", rest),
    };
    Some(format!("{}://{}{}", &base[..scheme_split], dir, href))
}

/// 解码 base64 为文本（CSS 内联用；失败=None 保留原引用降级）。
fn decode_text(b64: &str) -> Option<String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.trim()).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// 内联单资源占位（img 用 data URI；style 走 decode_text 分支）。
fn data_or_keep(
    kind: &str,
    resolved: Option<String>,
    resolver: &mut dyn FnMut(&str) -> Option<String>,
) -> Option<String> {
    let url = resolved?;
    let data = resolver(&url)?;
    let mime = kind_mime(kind, &url);
    Some(format!("data:{};base64,{}", mime, data))
}

fn kind_mime(kind: &str, url: &str) -> String {
    if kind == "style" {
        return "text/css".to_string();
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains(".png") || lower.contains(".apng") {
        "image/png".to_string()
    } else if lower.contains(".webp") {
        "image/webp".to_string()
    } else if lower.contains(".svg") {
        "image/svg+xml".to_string()
    } else if lower.contains(".gif") {
        "image/gif".to_string()
    } else {
        "image/jpeg".to_string()
    }
}

/// HTML → 静态内联快照（纯函数；返回内联后 HTML）。
///
/// @ai-context: 处理 <link rel=stylesheet href>、<img src>、外链 <script src>
///              （剔除并注释——不执行原文脚本，快照 XSS 面归零）；
///              行内 <style>/<script> 保持原文（行内 script 属原文内容，
///              快照只存不开——由打开方语境保证）。
pub fn inline_html(base: &str, html: &str, resolver: Resolver) -> String {
    let mut out = String::new();
    let mut rest = html;
    while let Some(pos) = rest.find('<') {
        out.push_str(&rest[..pos]);
        rest = &rest[pos..];
        let end = rest.find('>').map(|e| e + 1).unwrap_or(rest.len());
        let tag = &rest[..end];
        rest = &rest[end..];
        let lower = tag.to_ascii_lowercase();
        if lower.starts_with("<link") {
            if let Some(href) = extract_attr(tag, "href") {
                if lower.contains("stylesheet") {
                    // CSS 必须解码为纯文本塞入 <style>（data URI 字面量是非法规则——
                    // 审查 M1：内联产物对外部样式要真实生效）
                    if let Some(url) = resolve_url(base, &href) {
                        if let Some(b64) = resolver(&url) {
                            if let Some(css) = decode_text(b64.as_str()) {
                                out.push_str(&format!("<style data-inlined=\"{}\">{}</style>", escape_attr(&href), css));
                                continue;
                            }
                        }
                    }
                }
            }
            out.push_str(&scrub_tag(tag));
        } else if lower.starts_with("<img") {
            if let Some(src) = extract_attr(tag, "src") {
                let data = data_or_keep("img", resolve_url(base, &src), &mut *resolver);
                if let Some(d) = data {
                    let replaced = replace_attr(tag, "src", &d);
                    // 内联化后仍须过净化（原标签其余 on*/危险属性一并剥除）
                    out.push_str(&scrub_tag(&replaced));
                    continue;
                }
            }
            out.push_str(&scrub_tag(tag));
        } else if lower.starts_with("<script") {
            // 全部 script 剔除（外链+行内——快照离线打开语境不得执行任何原文脚本）
            out.push_str("<!-- entropy-snapshot: script removed -->");
            let lower_rest = rest.to_ascii_lowercase();
            if let Some(close_idx) = lower_rest.find("</script") {
                if let Some(gt) = rest[close_idx..].find('>') {
                    rest = &rest[close_idx + gt + 1..];
                    continue;
                }
            }
            // 无闭合标签的畸形脚本：继续正常扫描
        } else {
            // 通用标签净化：on* 事件属性与 javascript:/data:text/html URL 剥除
            out.push_str(&scrub_tag(tag));
        }
    }
    out.push_str(rest);
    out
}

fn extract_attr(tag: &str, name: &str) -> Option<String> {
    let mut search = tag;
    while let Some(p) = search.find(name) {
        let after = &search[p + name.len()..];
        let after = after.trim_start();
        if let Some(after_eq) = after.strip_prefix('=') {
            let v = after_eq.trim_start();
            let value = if let Some(q) = v.strip_prefix('"') {
                q.split('"').next().unwrap_or("").to_string()
            } else if let Some(q) = v.strip_prefix('\'') {
                q.split('\'').next().unwrap_or("").to_string()
            } else {
                v.split_whitespace().next().unwrap_or("").to_string()
            };
            return Some(value);
        }
        search = after;
    }
    None
}

fn replace_attr(tag: &str, name: &str, new_value: &str) -> String {
    if let Some(p) = tag.find(name) {
        let after = &tag[p + name.len()..];
        let after = after.trim_start();
        if let Some(after_eq) = after.strip_prefix('=') {
            let v = after_eq.trim_start();
            if let Some(first) = v.chars().next() {
                if first == '"' || first == '\'' {
                    let rest = &v[first.len_utf8()..];
                    if let Some(end) = rest.find(first) {
                        let head = format!("{}{}={}", &tag[..p], name, first);
                        let tail = &rest[end..];
                        return format!("{}{}{}", head, new_value, tail);
                    }
                }
            }
        }
    }
    tag.to_string()
}

fn escape_attr(s: &str) -> String {
    s.replace('"', "&quot;")
}

/// 标签净化（纯函数）：剥除 on* 事件属性与 javascript:/data:text/html 危险
/// URL——快照是离线下发的 HTML 文档，任何可执行面归零（安全边界）。
fn scrub_tag(tag: &str) -> String {
    // '>' 边界单独保留（不参与属性 token 判定——防整段误吞闭合符）
    let (body, closer) = match tag.rfind('>') {
        Some(i) => (&tag[..i], &tag[i..]),
        None => (tag, ""),
    };
    let mut out = String::new();
    let mut rest = body;
    let mut first = true;
    while let Some(ws) = rest.find(|c: char| c.is_whitespace()) {
        let token = &rest[..ws];
        rest = rest[ws..].trim_start();
        if first {
            out.push_str(token);
            first = false;
            continue;
        }
        if !token.is_empty() && !dangerous_attr(token) {
            out.push(' ');
            out.push_str(token);
        }
    }
    if first {
        out.push_str(rest);
    } else if !rest.is_empty() && !dangerous_attr(rest) {
        out.push(' ');
        out.push_str(rest);
    }
    out.push_str(closer);
    out
}

fn dangerous_attr(token: &str) -> bool {
    let name: String = token.chars().take_while(|c| *c != '=').collect();
    let lower_name = name.to_ascii_lowercase();
    if lower_name.starts_with("on") {
        return true; // 事件属性（onclick/onload/onerror…）
    }
    let lower_token = token.to_ascii_lowercase();
    if lower_token.contains("javascript:") || lower_token.contains("data:text/html") {
        return true;
    }
    // <a>/<img> 之外标签的 data:image 保留（仅图片类 data URI 安全）；href 上
    // 的 data:text/html 已被上一行拦截
    false
}

#[cfg(test)]
#[path = "web_snapshot_tests.rs"]
mod tests;
