//! AI 对话流式发送（REQ-225，v0.16.0）。
//!
//! @ai-context: 纯聊天走 `stream: true` SSE——逐 delta 经 Tauri Channel 推给
//!              前端（打字效果 + 可停止）。与 ai_client.rs 的阻塞式
//!              post_completions（精修/补充用）分居：流式**不自动重试**
//!              （重试=重复生成，聊天天然由用户"重发"触发；精修幂等才重试）。
//! @ai-context: usage 口径各家不一（末 chunk 附带 / 独立 chunk / 无）——本层
//!              只"看见则存"（最后一个带 usage 的 data 行），看不见则为 None
//!              （前端仅显示 token（如获知）与估算成本，不阻塞会话）。

use std::io::{BufRead, BufReader};

use serde::Serialize;

use crate::ai_chat::{CancelFlag, SseEvent, parse_sse_line};
use crate::ai_client::{AiClient, AiClientError, chat_completions_url};

/// 流式事件（Tauri Channel 载荷契约——kind 标签，前端按 kind 分发）。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum ChatStreamEvent {
    /// 增量文本（流式打字）
    Chunk { delta: String },
    /// 流正常结束（附用量 JSON 原样——含 token/成本口径的原始数据）
    Done { content: String, usage_json: Option<String> },
    /// 失败（AiClientError 六类归一；前端映射 + 重试按钮）
    Failed { error_kind: String, message: String },
    /// 用户取消（content=已生成文本；消息落库标 aborted）
    Aborted { content: String },
    /// v0.19.1（REQ-260）：学习库问答命中片段（本地恒可用——先于/独立于
    /// 生成；无命中为空列表——前端按内容文案呈现）
    KbHits { hits: Vec<crate::kb_search::KbHit> },
}

impl From<&AiClientError> for ChatStreamEvent {
    fn from(e: &AiClientError) -> Self {
        ChatStreamEvent::Failed { error_kind: e.kind().to_string(), message: e.to_string() }
    }
}

impl AiClientError {
    /// 错误类别标签（前端映射 + 任务失败四类契约复用）。
    pub fn kind(&self) -> &'static str {
        match self {
            AiClientError::Auth(_) => "auth",
            AiClientError::Network(_) => "network",
            AiClientError::Balance(_) => "balance",
            AiClientError::Quota(_) => "quota",
            AiClientError::Server(_) => "server",
            AiClientError::Parse(_) => "parse",
        }
    }
}

/// 流式结果（content/usage/是否取消——command 层落库口径）。
#[derive(Debug)]
pub struct StreamOutcome {
    pub content: String,
    pub usage_json: Option<String>,
    pub cancelled: bool,
    /// REQ-290①：是否收到 SSE [DONE] 正常收尾（false=断流/服务端 error——
    /// 调用方应视作失败走重试/回退，禁止把截断当成功）
    pub completed: bool,
}

/// 发送流式 chat/completions（SSE），逐 delta 回调 emit。
///
/// @ai-context: 取消语义：每读一行检查 CancelFlag（Arc 共享——chat_cancel
///              命令置位）；响应头未到时的取消由 HTTP 超时兜底（不做
///              abort transport——ureq 无取消句柄，超时后命令层重试/重发）。
///              emit 为 FnMut 无返回：Channel 发送失败（前端已关）由
///              command 层静默降级（不阻断落库，数据不丢）。
pub fn stream_chat(
    client: &AiClient,
    messages: &[serde_json::Value],
    cancel: &CancelFlag,
    mut emit: impl FnMut(ChatStreamEvent),
) -> Result<StreamOutcome, AiClientError> {
    if !client.config.is_local && client.config.api_key.trim().is_empty() {
        return Err(AiClientError::Auth(
            "未配置 API 密钥（设置页保存或配置环境变量）".to_string(),
        ));
    }
    let mut payload = serde_json::json!({
        "model": client.config.model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": client.config.max_tokens,
        "stream": true,
    });
    // R1 系推理模型：关闭思考标签（与 build_chat_payload 同款约束——保持
    // 输出稳定；DeepSeek-R1 在线端点会输出 reasoning_content 占 delta）
    if client.config.model.to_lowercase().contains("r1") {
        payload["no_think"] = serde_json::json!(true);
    }
    let url = chat_completions_url(&client.config.base_url);
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(client.config.timeout_secs.max(5)))
        .build();
    let resp = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", client.config.api_key.trim()))
        .send_string(&payload.to_string())
        .map_err(map_status)?;
    let reader = BufReader::new(resp.into_reader());
    let mut content = String::new();
    let mut usage_json: Option<String> = None;
    let mut cancelled = false;
    let mut completed = false;
    for line in reader.lines() {
        if cancel.is_cancelled() {
            cancelled = true;
            break;
        }
        let line = match line {
            Ok(l) => l,
            Err(_) => break, // 传输中途断流：completed=false——调用方不得当成功
        };
        match parse_sse_line(&line) {
            SseEvent::Delta(d) => {
                content.push_str(&d);
                emit(ChatStreamEvent::Chunk { delta: d });
            }
            SseEvent::Done => {
                completed = true;
                break;
            }
            SseEvent::Ignore => {
                // usage 可能挂在非 delta 的 data 行（OpenAI 兼容末 chunk）
                if let Some(usage) = extract_usage(&line) {
                    usage_json = Some(usage);
                }
            }
        }
    }
    Ok(StreamOutcome { content, usage_json, cancelled, completed })
}

/// 从 data 行提取 usage（纯函数；无 usage → None）。
pub fn extract_usage(line: &str) -> Option<String> {
    let line = line.trim();
    let payload = line.strip_prefix("data:")?.trim();
    let v: serde_json::Value = serde_json::from_str(payload).ok()?;
    let u = v.get("usage")?;
    if u.is_null() {
        None
    } else {
        serde_json::to_string(u).ok()
    }
}

/// 精修流式传输（REQ-290①）：对给定 payload 置 stream:true 发 SSE，逐 delta
/// 回调 emit（无取消语义——精修片幂等由重试兜底，与 chat stream_chat 区分：
/// 不自动重试/不落库/无 usage 消费）。返回全部累积文本供整包回退解析。
pub fn stream_sse_content(
    client: &AiClient,
    mut payload: serde_json::Value,
    mut emit: impl FnMut(&str),
) -> Result<StreamOutcome, AiClientError> {
    if !client.config.is_local && client.config.api_key.trim().is_empty() {
        return Err(AiClientError::Auth(
            "未配置 API 密钥（设置页保存或配置环境变量）".to_string(),
        ));
    }
    payload["stream"] = serde_json::json!(true);
    let url = chat_completions_url(&client.config.base_url);
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(client.config.timeout_secs.max(5)))
        .build();
    let resp = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", client.config.api_key.trim()))
        .send_string(&payload.to_string())
        .map_err(map_status)?;
    let (content, usage_json, cancelled, completed) =
        read_sse_lines(BufReader::new(resp.into_reader()), None, |d| emit(d));
    Ok(StreamOutcome { content, usage_json, cancelled, completed })
}

/// 通用 SSE 读取内核（观察 2026-09-05-2：收敛与 stream_chat 高度同构的循环——
/// 断流行 completed=false，调用方不得当成功；cancel 可选供聊天路径复用）。
fn read_sse_lines(
    reader: impl std::io::BufRead,
    cancel: Option<&CancelFlag>,
    mut on_delta: impl FnMut(&str),
) -> (String, Option<String>, bool, bool) {
    let mut content = String::new();
    let mut usage_json: Option<String> = None;
    let mut cancelled = false;
    let mut completed = false;
    for line in reader.lines() {
        if cancel.is_some_and(|c| c.is_cancelled()) {
            cancelled = true;
            break;
        }
        let line = match line {
            Ok(l) => l,
            Err(_) => break, // 传输中途断流：completed=false——调用方不得当成功
        };
        match parse_sse_line(&line) {
            SseEvent::Delta(d) => {
                content.push_str(&d);
                on_delta(&d);
            }
            SseEvent::Done => {
                completed = true;
                break;
            }
            SseEvent::Ignore => {
                if let Some(usage) = extract_usage(&line) {
                    usage_json = Some(usage);
                }
            }
        }
    }
    (content, usage_json, cancelled, completed)
}

/// HTTP 状态 → AiClientError（与 post_completions 同归一口径——四下一致）。
fn map_status(e: ureq::Error) -> AiClientError {
    match e {
        ureq::Error::Status(401, _) => AiClientError::Auth(
            "API 密钥无效（HTTP 401）——请检查设置页密钥或环境变量".to_string(),
        ),
        ureq::Error::Status(403, _) => AiClientError::Auth(
            "API 密钥无权限（HTTP 403）——账号未开通该模型或额度受限".to_string(),
        ),
        ureq::Error::Status(402, _) => {
            AiClientError::Balance("账户余额不足（请充值或切换免费档模型）".to_string())
        }
        ureq::Error::Status(429, _) => {
            AiClientError::Quota("请求过频或配额耗尽（HTTP 429）".to_string())
        }
        ureq::Error::Status(code, _) if code >= 500 => {
            AiClientError::Server(format!("服务端错误 HTTP {}", code))
        }
        ureq::Error::Status(code, _) => {
            AiClientError::Network(format!("请求被拒绝 HTTP {}（不重试）", code))
        }
        e => AiClientError::Network(format!("传输错误: {}", e)),
    }
}

#[cfg(test)]
#[path = "ai_chat_stream_tests.rs"]
mod tests;
