//! AI 对话客户端解析与流槽管理（REQ-224/225，v0.16.0）。
//!
//! @ai-context: 审查拆分（2026-08-30，commands_ai_chat.rs 324 行 > 300 硬上限）
//!              ——会话校验 / Provider→AiClient 解析 / 单活跃流槽生命周期
//!              内聚本模块；命令层只做入参校验与编排。
//! @ai-context: 流槽纪律：try_begin_stream 必须早于任何落库（防并发
//!              chat_send 先重复落库再被拒）；前置校验失败路径须 end_stream
//!              清理（防流槽泄漏——后续发送永被拒）。

use crate::ai_chat::CancelFlag;
use crate::ai_client::AiClient;
use crate::ai_provider::{AiProviderConfig, ProviderKind, provider_scope};
use crate::commands::AppState;
use crate::db_ai_chat::ChatSession;

/// 会话存在性校验（所有 chat_* 命令公共前置——Tauri IPC 入参校验红线）。
pub fn validate_session(state: &AppState, session_id: i64) -> Result<ChatSession, String> {
    state
        .db
        .get_chat_session(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "会话不存在".to_string())
}

/// 会话客户端解析：session.provider_id 显式 > 默认 Provider；密钥口径
/// 显式=per-scope（env 不覆盖显式选择），默认=resolve_default_provider_key
/// （env > per-provider > legacy，与精修链同口径）。
pub fn resolve_chat_client(
    state: &AppState,
    session: &ChatSession,
) -> Result<(AiClient, Option<String>), String> {
    let store = state
        .ai_providers
        .lock()
        .map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?
        .clone();
    if let Some(pid) = session.provider_id.clone() {
        let provider = store
            .get(&pid)
            .cloned()
            .ok_or_else(|| format!("Provider {} 不存在（请到设置页检查）", pid))?;
        let client = build_provider_client(state, &provider, &pid)?;
        return Ok((client, Some(pid)));
    }
    let settings = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?
        .clone();
    let stored_key = crate::commands_ai_providers::resolve_default_provider_key(state)?;
    Ok((AiClient::from_settings_with_store(&settings, stored_key, &store), None))
}

/// 显式 Provider 客户端（Ollama 免密钥；其余 per-scope 凭据缺失 → 明确报错）。
pub fn build_provider_client(
    state: &AppState,
    provider: &AiProviderConfig,
    pid: &str,
) -> Result<AiClient, String> {
    if provider.kind == ProviderKind::Ollama {
        return Ok(AiClient::from_provider(provider, None));
    }
    let key = state
        .ai_credentials
        .load_key(&provider_scope(pid))?
        .ok_or_else(|| format!("Provider {} 未保存密钥（设置页保存后重试）", provider.name))?;
    Ok(AiClient::from_provider(provider, Some(key)))
}

/// 单活跃流注册（gate 之后、任何落库之前调用——防并发重复落库/扣费；
/// 失败方负责 end_stream 清理）。
pub fn try_begin_stream(state: &AppState, session_id: i64) -> Result<CancelFlag, String> {
    let flag = CancelFlag::new();
    let mut cancels = state
        .chat_cancels
        .lock()
        .map_err(|e| format!("取消表锁中毒: {}", e))?;
    if cancels.insert(session_id, flag.clone()).is_some() {
        return Err("该会话已有进行中的对话——请等待完成或先停止".to_string());
    }
    Ok(flag)
}

/// 释放单活跃流（落库失败/前置校验失败路径——保证流槽不泄漏）。
pub fn end_stream(state: &AppState, session_id: i64) {
    state.chat_cancels.lock().unwrap_or_else(|x| x.into_inner()).remove(&session_id);
}

/// 截断到上限字符数（错误持久化文本——防超长错误撑爆消息列表）。
pub fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let cut: String = s.chars().take(max).collect();
    format!("{}…", cut)
}
