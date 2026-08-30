//! AI 对话纯函数层（REQ-224/225/230，v0.16.0）。
//!
//! @ai-context: 本模块只含"无副作用"的原子逻辑（消息组装 / SSE 行解析 /
//!              轨迹序列化 / 取消标志）——业务编排在 command 层，网络在
//!              ai_chat_stream.rs，存储在 db_ai_chat.rs；纯函数 AAA 单测
//!              （AGENTS.md §3.5 测试纪律）。
//! @ai-context: 轨迹（AiTurn）= 每次 LLM 调用的提示词与回答全文——"AI 任务
//!              对话视图"数据源（REQ-230 用户裁决：能看提示词和回答）。
//!              vision 调用只记图数占位（base64 不入库：图在本机会话图库，
//!              入库会使体积翻数倍且冗余同图）。

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

/// 聊天消息角色（OpenAI 兼容白名单——防任意 role 注入，防御性编程）。
#[derive(Debug, Clone, PartialEq)]
pub enum ChatRole {
    /// 保留（system 由 build_messages 单独注入——角色不落库不旁路）
    #[allow(dead_code)]
    System,
    User,
    Assistant,
}

impl ChatRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            ChatRole::System => "system",
            ChatRole::User => "user",
            ChatRole::Assistant => "assistant",
        }
    }
}

/// 历史消息输入（组装前的最小结构——不耦合 DB 行，纯函数可单测）。
#[derive(Debug, Clone, PartialEq)]
pub struct ChatMessageInput {
    pub role: ChatRole,
    pub content: String,
}

impl ChatMessageInput {
    /// 便捷构造（测试/未来上下文注入层使用）
    #[allow(dead_code)]
    pub fn user(content: impl Into<String>) -> Self {
        Self { role: ChatRole::User, content: content.into() }
    }
}

/// 组装 OpenAI messages 数组（system 置顶；history 仅 user/assistant）。
///
/// @ai-context: 多轮对话历史一律截断到最近 MAX_HISTORY 条（防长会话 token
///              失控；超出后第一条 user 摘要占比仍递减——MVP 不做摘要压缩，
///              与 v0.8 精修"切片 + 片间摘要"策略同思路，后续再议）。
pub const MAX_HISTORY: usize = 30;

pub fn build_messages(system: &str, history: &[ChatMessageInput]) -> Vec<serde_json::Value> {
    let mut out = Vec::with_capacity(history.len() + 1);
    if !system.trim().is_empty() {
        out.push(serde_json::json!({ "role": "system", "content": system }));
    }
    let tail_start = history.len().saturating_sub(MAX_HISTORY);
    for m in &history[tail_start..] {
        out.push(serde_json::json!({ "role": m.role.as_str(), "content": m.content }));
    }
    out
}

/// SSE 行解析结果。
#[derive(Debug, Clone, PartialEq)]
pub enum SseEvent {
    /// 增量文本（choices[0].delta.content）
    Delta(String),
    /// 流结束标记 `data: [DONE]`
    Done,
    /// 非 data 行 / 空增量 / 畸形 JSON（跳过不失败——服务商行尾差异容错）
    Ignore,
}

/// 解析一行 SSE（`data: {json}` 或 `data: [DONE]`）。
///
/// @ai-context: 流式响应各服务商末 chunk 的 usage/finish_reason 字段不一致
///              （OpenAI 单独 usage chunk / DeepSeek 附在末 chunk / 无），
///              本解析只取 delta.content；用量另由非流式兜底与账单口径处理。
pub fn parse_sse_line(line: &str) -> SseEvent {
    let line = line.trim();
    if line.is_empty() {
        return SseEvent::Ignore;
    }
    let Some(payload) = line.strip_prefix("data:") else {
        return SseEvent::Ignore;
    };
    let payload = payload.trim();
    if payload == "[DONE]" {
        return SseEvent::Done;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
        return SseEvent::Ignore;
    };
    let delta = v["choices"][0]["delta"]["content"].as_str().unwrap_or("");
    if delta.is_empty() {
        SseEvent::Ignore
    } else {
        SseEvent::Delta(delta.to_string())
    }
}

/// 一次 LLM 调用的完整轨迹（提示词 + 回答全文）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTurn {
    /// 片序（1 起；失败片无轨迹——任务卡已显失败片数）
    pub turn: usize,
    /// 组装后的 system 提示词（模板构建结果，非模板原文）
    pub system: String,
    /// user 请求文本（精修=AiRefineRequest JSON；vision 附图数占位）
    pub user: String,
    /// 模型回答（结构化响应 JSON；原始返回即 JSON）
    pub response: String,
}

/// 轨迹 → JSON（落库 trajectory_json 列；失败返回 None 由调用方降级不写）。
pub fn trajectory_to_json(turns: &[AiTurn]) -> Option<String> {
    serde_json::to_string(turns).ok()
}

/// JSON → 轨迹（旧任务/损坏数据 → None，视图诚实提示"无轨迹存档"）。
pub fn trajectory_from_json(s: &str) -> Option<Vec<AiTurn>> {
    serde_json::from_str(s).ok()
}

/// 流取消标志（Arc 共享；chat_cancel 置位 → 流循环每 chunk 检查）。
#[derive(Debug, Default, Clone)]
pub struct CancelFlag(Arc<AtomicBool>);

impl CancelFlag {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
#[path = "ai_chat_tests.rs"]
mod tests;
