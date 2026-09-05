//! web 扩展收件命令面（v0.20.4 / REQ-304 阶段 2 薄壳——本地服务起停/状态）。
//!
//! @ai-context: 服务=std TcpListener 单线程小循环（只绑 127.0.0.1 随机端口、
//!              随机 token 首启生成入 data_dir/web_inbox.json、/ping 探测
//!              （Joplin 范式）、POST /ingest 单向投递、OPTIONS 预检放行、
//!              CORS 仅允许扩展用途（Authorization 头）+ token 校验 401）；
//!              投递成功=建 kind=web 会话+页面（与 URL 采集同收口），图 base64
//!              落盘 notes-images/ 并改写 md 引用。
//! @ai-context: 安全边界：token 仅本机展示/存盘（权限收紧为当前用户可读写）、
//!              载荷白名单校验（web_inbox::validate_payload）、体量上限；
//!              服务仅应用运行期有效（进程退出即停）——无驻留后门。

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use crate::commands::AppState;
use crate::db_web::WebPage;
use crate::web_capture::host_of;
use crate::web_inbox::{is_authorized, parse_headers, validate_payload, IngestPayload};
/// 投递体量上限（头+体，防慢速拖垮）。
const BODY_MAX: usize = 8 * 1024 * 1024;

/// 收件服务运行时（内存态；token 同时持久化供重启复用）。
#[derive(Clone)]
pub struct WebInboxRuntime {
    pub port: u16,
    pub token: String,
    stop: Arc<AtomicBool>,
}

impl WebInboxRuntime {
    fn new(port: u16, token: String) -> Self {
        Self { port, token, stop: Arc::new(AtomicBool::new(false)) }
    }
    pub fn request_stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }
    pub fn stopping(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }
}

/// 状态视图（设置页/课堂助手展示：端口 + token 复制给扩展）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebInboxView {
    pub running: bool,
    pub port: Option<u16>,
    pub token: Option<String>,
    pub inbox_url: Option<String>,
}

fn token_file(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join("web_inbox.json")
}

fn load_or_make_token(data_dir: &std::path::Path) -> String {
    if let Ok(raw) = std::fs::read_to_string(token_file(data_dir)) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(t) = v.get("token").and_then(|x| x.as_str()) {
                if t.len() == 24 {
                    return t.to_string();
                }
            }
        }
    }
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
        ^ std::process::id() as u64;
    let token = crate::web_inbox::random_token(seed);
    if let Ok(raw) = serde_json::to_string_pretty(&serde_json::json!({ "token": token })) {
        let _ = std::fs::write(token_file(data_dir), raw);
    }
    token
}

/// 启动收件服务（幂等：已运行返回现状）。
#[tauri::command]
pub fn web_inbox_start(state: State<'_, AppState>) -> Result<WebInboxView, String> {
    let mut slot = state
        .web_inbox
        .lock()
        .map_err(|_| "收件服务锁中毒".to_string())?;
    if let Some(rt) = slot.as_ref() {
        return Ok(view_of(rt));
    }
    let token = load_or_make_token(&state.data_dir);
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("绑定回环端口失败: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置非阻塞失败: {}", e))?;
    let rt = WebInboxRuntime::new(port, token);
    let runtime = rt.clone();
    let db = state.db.clone();
    let data_dir = state.data_dir.clone();
    let app = state.app.clone();
    std::thread::Builder::new()
        .name("entropy-web-inbox".into())
        .spawn(move || loop {
            if runtime.stopping() {
                break;
            }
            match listener.accept() {
                Ok((stream, _)) => handle_connection(stream, &runtime, &db, &data_dir, &app),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(e) => {
                    eprintln!("[web-inbox] accept 失败: {e}");
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
            }
        })
        .map_err(|e| format!("收件线程启动失败: {e}"))?;
    *slot = Some(rt.clone());
    Ok(view_of(&rt))
}

fn view_of(rt: &WebInboxRuntime) -> WebInboxView {
    WebInboxView {
        running: true,
        port: Some(rt.port),
        token: Some(rt.token.clone()),
        inbox_url: Some(format!("http://127.0.0.1:{}/", rt.port)),
    }
}

/// 状态查询。
#[tauri::command]
pub fn web_inbox_status(state: State<'_, AppState>) -> Result<WebInboxView, String> {
    let slot = state.web_inbox.lock().map_err(|_| "收件服务锁中毒".to_string())?;
    match slot.as_ref() {
        Some(rt) => Ok(view_of(rt)),
        None => Ok(WebInboxView { running: false, port: None, token: None, inbox_url: None }),
    }
}

/// 停止服务（token 保留——重启同 token，扩展零重配）。
#[tauri::command]
pub fn web_inbox_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut slot = state.web_inbox.lock().map_err(|_| "收件服务锁中毒".to_string())?;
    if let Some(rt) = slot.take() {
        rt.request_stop();
    }
    Ok(())
}

fn write_simple(stream: &mut TcpStream, status: &str, body: &str, cors: bool) {
    let mut headers = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n",
        status,
        body.len()
    );
    if cors {
        headers.push_str("Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: authorization, content-type\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\n");
    }
    let _ = stream.write_all(headers.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
}

fn read_request(stream: &mut TcpStream) -> Option<(String, String, HashMap<String, String>, Vec<u8>)> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let mut head_end: Option<usize> = None;
    loop {
        if std::time::Instant::now() > deadline {
            return None; // 慢速/悬挂请求有界放弃（防连接占用线程）
        }
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if head_end.is_none() {
                    if let Some(pos) = find_head_end(&buf) {
                        head_end = Some(pos);
                        let content_len: usize = String::from_utf8_lossy(&buf[..pos])
                            .to_ascii_lowercase()
                            .lines()
                            .find_map(|l| {
                                l.trim()
                                    .split_once(':')
                                    .filter(|(k, _)| k.trim() == "content-length")
                                    .and_then(|(_, v)| v.trim().parse().ok())
                            })
                            .unwrap_or(0);
                        // 审查 H1：声明体量预检——超上限立即断（超大流不再读入，
                        // 与协议 8MB 契约一致；头部已定的积压阶段同样有界）
                        if content_len > BODY_MAX {
                            return None;
                        }
                        if pos + 4 + content_len <= buf.len() {
                            let body = buf[pos + 4..pos + 4 + content_len].to_vec();
                            let head = String::from_utf8_lossy(&buf[..pos]).into_owned();
                            let (method, path, headers) = parse_headers(&head)?;
                            return Some((method, path, headers, body));
                        }
                    }
                }
                // 未含头的首段与头部已定的积压阶段统一有界（防谎报/流式放大）
                if buf.len() > BODY_MAX {
                    return None;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Err(_) => break,
        }
    }
    None
}

fn find_head_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

fn handle_connection(
    mut stream: TcpStream,
    runtime: &WebInboxRuntime,
    db: &crate::db::Db,
    data_dir: &std::path::Path,
    app: &tauri::AppHandle,
) {
    let Some((method, path, headers, body)) = read_request(&mut stream) else {
        write_simple(&mut stream, "400 Bad Request", r#"{"error":"bad request"}"#, true);
        return;
    };
    if method == "OPTIONS" {
        write_simple(&mut stream, "204 No Content", "", true);
        return;
    }
    if !is_authorized(&headers, &runtime.token) {
        write_simple(&mut stream, "401 Unauthorized", r#"{"error":"unauthorized"}"#, true);
        return;
    }
    match (method.as_str(), path.as_str()) {
        ("GET", "/ping") => write_simple(&mut stream, "200 OK", r#"{"ok":true}"#, true),
        ("POST", "/ingest") => {
            let payload: Result<IngestPayload, _> = serde_json::from_slice(&body);
            match payload {
                Ok(p) => match validate_payload(&p) {
                    Ok(()) => match ingest_from_extension(db, data_dir, Some(app), &p) {
                        Ok(session_id) => write_simple(
                            &mut stream,
                            "200 OK",
                            &serde_json::json!({ "ok": true, "sessionId": session_id }).to_string(),
                            true,
                        ),
                        Err(e) => write_simple(
                            &mut stream,
                            "500 Internal Server Error",
                            &serde_json::json!({ "error": e }).to_string(),
                            true,
                        ),
                    },
                    Err(e) => write_simple(
                        &mut stream,
                        "422 Unprocessable Entity",
                        &serde_json::json!({ "error": e }).to_string(),
                        true,
                    ),
                },
                Err(_) => write_simple(&mut stream, "400 Bad Request", r#"{"error":"invalid json"}"#, true),
            }
        }
        _ => write_simple(&mut stream, "404 Not Found", r#"{"error":"not found"}"#, true),
    }
}

/// 扩展投递 → kind=web 会话 + 页面（与 URL 采集同收口）；图 base64 落盘改写。
fn ingest_from_extension(
    db: &crate::db::Db,
    data_dir: &std::path::Path,
    app: Option<&tauri::AppHandle>,
    p: &IngestPayload,
) -> Result<i64, String> {
    let now = crate::db::unix_seconds();
    let session = db
        .create_session(&crate::types::NewSession {
            title: p
                .title
                .as_deref()
                .map(|t| t.trim())
                .filter(|t| !t.is_empty())
                .map(|t| t.chars().take(100).collect())
                .unwrap_or_else(|| {
                    p.url.as_deref().and_then(host_of).unwrap_or_else(|| "网页".to_string())
                }),
            source_window: p.url.clone(),
            profile: None,
            kind: Some("web".to_string()),
        })
        .map_err(|e| e.to_string())?;
    // 图落盘：notes-images/ 通用目录（编辑器相对路径解析基座）
    let mut markdown = p.markdown.clone();
    let notes_images = data_dir.join("notes-images");
    let _ = std::fs::create_dir_all(&notes_images);
    for img in &p.images {
        if let Some(bytes) = crate::web_inbox::data_uri_bytes(&img.data_base64) {
            let mime = img.data_base64.split_once(';').map(|(m, _)| m).unwrap_or("data:image/png");
            let ext = mime.rsplit('/').next().unwrap_or("png");
            let filename = format!("web-{}-{}.{}", session.id, crate::web_inbox::short_hash(&bytes), ext);
            if std::fs::write(notes_images.join(&filename), bytes).is_ok() {
                // 替换 md 中 `![name](data:...)` 引用为相对路径（编辑器同解析基座）
                markdown = markdown.replace(
                    &format!("]({})", img.data_base64),
                    &format!("](notes-images/{})", filename),
                );
            }
        }
    }
    db.insert_web_page(&WebPage {
        session_id: session.id,
        url: p.url.clone().unwrap_or_else(|| "".to_string()),
        site: p.site.clone(),
        author: p.author.clone(),
        published: None,
        markdown,
        raw_html: None,
        extracted_ok: true,
        fetched_at: now,
    })
    .map_err(|e| e.to_string())?;
    if let Some(app) = app {
        crate::notify::emit_changed(app, crate::notify::DataDomain::Sessions);
    }
    Ok(session.id)
}

#[cfg(test)]
#[path = "commands_web_inbox_tests.rs"]
mod tests;
