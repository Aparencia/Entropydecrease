//! web 扩展收件服务（v0.20.4 / REQ-304 阶段 2 薄壳——本地收件面）。
//!
//! @ai-context: 浏览器扩展在已登录 DOM 内抽取（登录墙正解）→ POST 到本服务
//!              （127.0.0.1 随机端口 + 随机 token——Joplin loopback 范式）；
//!              只绑回环 + token 校验 + 单向投递（服务只收不发）+ 体量/类型
//!              校验（安全边界，AGENTS.md 红线对齐）。图 base64 随投→落盘
//!              notes-images/ 并改写 md 引用（复用编辑器相对路径解析）。
//! @ai-context: 纯逻辑层（请求行/头解析、token 校验、载荷校验、base64 图提取）
//!              与 IO（TcpListener 循环/写盘）分离——前者全可单测。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 投递载荷（扩展契约 v1；source 字段位预留=extension）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestPayload {
    pub title: Option<String>,
    pub url: Option<String>,
    pub site: Option<String>,
    pub author: Option<String>,
    /// 正文 Markdown（扩展内 readability+turndown 或 DOM 规则抽取）
    pub markdown: String,
    /// 图片：name=md 引用名，data_base64=data URI（图落盘改写引用）
    #[serde(default)]
    pub images: Vec<IngestImage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestImage {
    pub name: String,
    pub data_base64: String,
}

/// 解析请求头区（纯函数）：请求行 + 键值头（大小写不敏感键）。
pub fn parse_headers(head: &str) -> Option<(String, String, HashMap<String, String>)> {
    let mut lines = head.split("\r\n");
    let request_line = lines.next()?.trim();
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_ascii_uppercase();
    let path = parts.next()?.to_string();
    let mut headers = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    Some((method, path, headers))
}

/// token 校验（纯函数，恒定时间比较——防时序侧信道）。
pub fn is_authorized(headers: &HashMap<String, String>, token: &str) -> bool {
    let given = headers
        .get("authorization")
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    given.len() == token.len() && given.bytes().zip(token.bytes()).fold(0u32, |acc, (a, b)| acc + u32::from(a != b)) == 0
}

/// 载荷校验（纯函数）：正文非空有界、图名白名单、base64 体量护栏。
pub fn validate_payload(p: &IngestPayload) -> Result<(), String> {
    let md_len = p.markdown.trim().chars().count();
    if md_len == 0 {
        return Err("正文为空".to_string());
    }
    if md_len > 2_000_000 {
        return Err("正文超限（>2MB）".to_string());
    }
    if let Some(u) = &p.url {
        if !(u.starts_with("https://") || u.starts_with("http://")) || u.len() > 2048 {
            return Err("url 非法".to_string());
        }
    }
    if p.images.len() > 50 {
        return Err("图片数量超限（≤50）".to_string());
    }
    for img in &p.images {
        let name_len = img.name.chars().count();
        if img.name.is_empty()
            || name_len > 120
            || img.name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        {
            return Err(format!("图片名非法: {}", img.name));
        }
        if img.data_base64.len() > 8 * 1024 * 1024 {
            return Err(format!("图片超限: {}", img.name));
        }
        if !img.data_base64.starts_with("data:image/") {
            return Err(format!("非图片 data URI: {}", img.name));
        }
    }
    Ok(())
}

/// 从 data URI 提取二进制（纯函数；失败=None）。
pub fn data_uri_bytes(data_base64: &str) -> Option<Vec<u8>> {
    let comma = data_base64.find(',')?;
    let b64 = &data_base64[comma + 1..];
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.decode(b64).ok()
}

/// 短摘要（非密码用途——文件名去重即可；注释注明防误用）。
pub fn short_hash(bytes: &[u8]) -> String {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for &b in bytes {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{:016x}", h)
}

/// 生成随机 token（非密码级 PRNG 注明——回环+长度双保险；改进位见协议文档）。
pub fn random_token(seed: u64) -> String {
    let mut x = seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1;
    let mut out = String::with_capacity(24);
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for _ in 0..24 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        out.push(CHARS[(x % (CHARS.len() as u64)) as usize] as char);
    }
    out
}

#[cfg(test)]
#[path = "web_inbox_tests.rs"]
mod tests;
