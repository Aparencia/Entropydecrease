//! web 采集命令面（v0.20.4 / REQ-303 阶段 1 内核）。
//!
//! @ai-context: URL 采集 = 课堂助手动线「URL 采集」→ 本地抽取管线（ureq 静态
//!              直取 + 轻量规则转 MD）→ kind='web' 会话 + web_session_pages
//!              页面（正文整篇初稿/元数据/raw_html 降级附件）；转笔记复用
//!              会话↔笔记通道（session_to_note 对 kind=web 走 web 专用管线：
//!              正文 MD 直落 + properties 元数据 + 标题锚点回链）。
//! @ai-context: 失败语义（Foresight 兜底链）：网络/解析失败返回明确错误且
//!              不产生半成品会话；正文抽取过少 → extracted_ok=0 保留 raw_html
//!              附件可再处理。SPA/登录墙缺口由阶段 2 扩展覆盖。
//! @ai-context: 安全：仅 http/https、5MB 上限、UA 标识、15s 总超时；URL 只作
//!              出站读，不落执行上下文。

use serde::Serialize;
use std::time::Duration;
use tauri::State;

use crate::commands::AppState;
use crate::db_web::WebPage;
use crate::types::NewNote;
use crate::web_capture::{extract_page, host_of};

/// 抓取体量上限（防超大响应拖垮内存/耗时）。
const FETCH_MAX_BYTES: usize = 5 * 1024 * 1024;
/// 单次抓取超时（网络兜底——不可达快速报错）。
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
/// 出站 UA（常见静态站基本放行）。
const UA: &str = "EntropyDecrease/0.20.4 (+https://github.com/Aparencia/Entropydecrease)";

/// 采集结果视图。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebCaptureView {
    pub session_id: i64,
    pub title: String,
    pub site: Option<String>,
    pub author: Option<String>,
    pub chars: usize,
    /// 正文抽取是否成功（false=已保留 raw_html 附件可再处理）
    pub extracted_ok: bool,
}

/// URL 采集（async + spawn_blocking——网络/IO 不占 UI 线程）。
#[tauri::command]
pub async fn web_capture_url(
    state: State<'_, AppState>,
    url: String,
) -> Result<WebCaptureView, String> {
    let url = url.trim().to_string();
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.len() > 2048 {
        return Err("仅支持 http(s):// URL".to_string());
    }
    let st: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || capture_inner(&st, &url))
        .await
        .map_err(|e| format!("任务调度失败: {}", e))?
}

fn capture_inner(st: &AppState, url: &str) -> Result<WebCaptureView, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(FETCH_TIMEOUT)
        .redirects(5)
        .user_agent(UA)
        .build();
    let response = agent
        .get(url)
        .call()
        .map_err(|e| format!("抓取失败（离线/站点拒绝？）: {}", e))?;
    // 分块读 + 显式上限（ureq trait object 无 take——手写护栏）
    use std::io::Read;
    let mut reader = response.into_reader();
    let mut body: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        let n = reader
            .read(&mut chunk)
            .map_err(|e| format!("读取响应失败: {}", e))?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
        if body.len() > FETCH_MAX_BYTES {
            return Err("页面超过 5MB 上限（已放弃，防内存拖垮）".to_string());
        }
    }
    let html = String::from_utf8_lossy(&body).into_owned();
    let page = extract_page(&html);
    let now = crate::db::unix_seconds();
    // kind=web 会话（finished——无采集过程，直接可用）
    let session = st
        .db
        .create_session(&crate::types::NewSession {
            title: if page.title.trim().is_empty() {
                host_of(url).unwrap_or_else(|| "网页".to_string())
            } else {
                page.title.trim().chars().take(100).collect()
            },
            source_window: Some(url.to_string()),
            profile: None,
            kind: Some("web".to_string()),
        })
        .map_err(|e| e.to_string())?;
    st.db
        .insert_web_page(&WebPage {
            session_id: session.id,
            url: url.to_string(),
            site: page.site.clone(),
            author: page.author.clone(),
            published: page.published.clone(),
            markdown: if page.ok { page.markdown.clone() } else { String::new() },
            raw_html: if page.ok { None } else { Some(html.clone()) },
            extracted_ok: page.ok,
            fetched_at: now,
        })
        .map_err(|e| e.to_string())?;
    // 会话域广播（列表即时可见）
    crate::notify::emit_changed(&st.app, crate::notify::DataDomain::Sessions);
    Ok(WebCaptureView {
        session_id: session.id,
        title: session.title,
        site: page.site,
        author: page.author,
        chars: page.markdown.chars().count(),
        extracted_ok: page.ok,
    })
}

/// web 会话页面读取（详情展示/回链跳转数据源）。
#[tauri::command]
pub fn web_page_get(state: State<'_, AppState>, session_id: i64) -> Result<Option<WebPage>, String> {
    state.db.get_web_page(session_id).map_err(|e| e.to_string())
}

/// web → 笔记核心（正文 MD 直落 + properties 元数据 + 来源回链）；
/// session_to_note 对 kind=web 分支调用（commands_session_note 接线点）。
pub(crate) fn web_session_to_note_core(db: &crate::db::Db, session_id: i64) -> Result<crate::types::Note, String> {
    let session = db
        .get_session(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "会话不存在".to_string())?;
    let page = db
        .get_web_page(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "web 页面不存在（kind=web 会话必有页面行）".to_string())?;
    if !page.extracted_ok && page.markdown.trim().is_empty() {
        return Err("该页正文抽取失败（已保留原 HTML 附件）——可稍后在扩展/快照路径重试，暂无法转笔记".to_string());
    }
    let props = serde_json::json!({
        "url": page.url,
        "site": page.site,
        "author": page.author,
        "published": page.published,
        "fetchedAt": page.fetched_at,
        "type": "web-article"
    })
    .to_string();
    let note = db
        .create_note(&NewNote {
            title: session.title.clone(),
            content: page.markdown.clone(),
            source: "web".to_string(),
            session_id: Some(session_id),
            rule_version: None,
            purify_stats: None,
            tags: None,
            properties: Some(props),
            group_id: None,
        })
        .map_err(|e| e.to_string())?;
    Ok(note)
}

#[cfg(test)]
#[path = "commands_web_tests.rs"]
mod tests;
