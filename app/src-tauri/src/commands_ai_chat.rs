//! AI 对话命令层（REQ-224/225/226/227/228，v0.16.0）。
//!
//! @ai-context: 系统层——参数校验 / 授权 gate / 编排；网络在
//!              ai_chat_stream.rs（SSE + 取消），纯函数在 ai_chat.rs，
//!              存储 db_ai_chat.rs。任务对话视图复用 ai_task_history +
//!              ai_task_conversation（REQ-230，见本文件尾部）。
//! @ai-context: 信任语义（用户裁决 2026-08-30）：纯聊天会话 + AI 任务对话
//!              在 AI 对话页合并展示；聊天本身无上下文注入（L1-L4 后续）。

use tauri::ipc::Channel;
use tauri::State;

use crate::ai_chat::{
    AiTurn, ChatMessageInput, ChatRole, build_messages, trajectory_from_json,
};
use crate::ai_chat_client::{
    end_stream, resolve_chat_client, truncate_chars, try_begin_stream, validate_session,
};
use crate::ai_chat_stream::{ChatStreamEvent, stream_chat};
use crate::ai_client::AiClient;
use crate::commands::AppState;
use crate::db_ai_chat::{ChatMessage, ChatSession};

/// 纯聊天系统提示词（不填充身份/能力声明——诚实：不知道用户的学习上下文）。
const CHAT_SYSTEM_PROMPT: &str =
    "你是熵减桌面应用内嵌的 AI 助手。用中文回答，简洁准确；可用 Markdown 组织（标题/列表/表格/代码块）。";

/// 单条消息最大字符数（防误粘贴巨文——超限明确拒绝而非静默截断）。
const MAX_MESSAGE_CHARS: usize = 16000;

/// 新建会话（标题可空——默认"新对话"；retrieval=true = 学习库问答模式，
/// v0.19.1——创建时定死，已有会话不改语义）。
#[tauri::command]
pub fn chat_create_session(
    state: State<'_, AppState>,
    title: Option<String>,
    retrieval: Option<bool>,
) -> Result<ChatSession, String> {
    let title = title.unwrap_or_default();
    if title.chars().count() > 100 {
        return Err("会话标题过长（≤100 字符）".to_string());
    }
    let id = state
        .db
        .insert_chat_session(
            if title.trim().is_empty() { None } else { Some(title.trim()) },
            retrieval.unwrap_or(false),
        )
        .map_err(|e| e.to_string())?;
    validate_session(&state, id)
}

#[tauri::command]
pub fn chat_list_sessions(state: State<'_, AppState>) -> Result<Vec<ChatSession>, String> {
    state.db.list_chat_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn chat_rename_session(state: State<'_, AppState>, session_id: i64, title: String) -> Result<(), String> {
    validate_session(&state, session_id)?;
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 100 {
        return Err("标题长度 1~100 字符".to_string());
    }
    state.db.rename_chat_session(session_id, title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn chat_delete_session(state: State<'_, AppState>, session_id: i64) -> Result<(), String> {
    validate_session(&state, session_id)?;
    state.db.delete_chat_session(session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn chat_list_messages(state: State<'_, AppState>, session_id: i64) -> Result<Vec<ChatMessage>, String> {
    validate_session(&state, session_id)?;
    state.db.list_chat_messages(session_id).map_err(|e| e.to_string())
}

/// 会话模型选择（provider_id=None → 跟随设置页默认；模型必须非空）。
#[tauri::command]
pub fn chat_set_model(
    state: State<'_, AppState>,
    session_id: i64,
    provider_id: Option<String>,
    model: String,
) -> Result<(), String> {
    validate_session(&state, session_id)?;
    let model = model.trim();
    if model.is_empty() || model.chars().count() > 200 {
        return Err("模型名不能为空（≤200 字符）".to_string());
    }
    if let Some(pid) = &provider_id {
        let store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
        if store.get(pid).is_none() {
            return Err(format!("Provider {} 不存在", pid));
        }
        if !store.get(pid).map(|p| p.models.iter().any(|m| m == model)).unwrap_or(false) {
            return Err(format!("模型 {} 不在该 Provider 模型列表中（可先在设置页添加）", model));
        }
    }
    state.db.set_chat_session_model(session_id, provider_id.as_deref(), model).map_err(|e| e.to_string())
}

/// 发送消息（流式；resend_message_id=编辑后重发：更新该用户消息 + 删除其后消息）。
#[tauri::command]
pub async fn chat_send(
    state: State<'_, AppState>,
    session_id: i64,
    content: String,
    resend_message_id: Option<u64>,
    channel: Channel<ChatStreamEvent>,
) -> Result<(), String> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err("消息不能为空".to_string());
    }
    if content.chars().count() > MAX_MESSAGE_CHARS {
        return Err("消息过长（≤16000 字符）".to_string());
    }
    let session = validate_session(&state, session_id)?;
    // v0.19.1（REQ-260）：学习库问答会话——命中列表恒可用（本地能力不受
    // content_gate 约束），生成走 kb 双闸门 → 整链分流入 commands_ai_chat_kb
    if session.retrieval {
        return crate::commands_ai_chat_kb::kb_chat_send(
            &state,
            session_id,
            &content,
            resend_message_id,
            channel,
        );
    }
    let settings = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?
        .clone();
    settings.content_gate()?; // 授权红线：enabled + authorized 双闸门（默认关）
    // 先解析客户端（Provider/密钥缺失 → 明确报错，不落无应答的用户消息）
    let (client, provider_id) = resolve_chat_client(&state, &session)?;
    let model = client.config.model.clone();
    // 单活跃流注册必须早于任何落库（审查修复：原在 run_stream 内注册——
    // 并发 chat_send 会先重复落库再被拒，防重复扣费/重复请求）
    let flag = try_begin_stream(&state, session_id)?;
    // 编辑后重发：改内容 + 作废旧回答（其后消息全删）；
    // 入参校验（审查修复）：消息必须属于本会话且为 user 角色（防跨会话误改）
    if let Some(mid) = resend_message_id {
        let role = state.db.chat_message_role(session_id, mid as i64).map_err(|e| e.to_string())?;
        match role.as_deref() {
            Some("user") => {}
            Some(_) => {
                end_stream(&state, session_id);
                return Err("编辑重发只能作用于用户消息（assistant 消息用「重发」）".to_string());
            }
            None => {
                end_stream(&state, session_id);
                return Err("要编辑的消息不存在或不属于该会话".to_string());
            }
        }
        if let Err(e) = state.db.update_chat_message_content(session_id, mid as i64, &content) {
            end_stream(&state, session_id);
            return Err(e.to_string());
        }
        if let Err(e) = state.db.delete_chat_messages_after(session_id, mid as i64) {
            end_stream(&state, session_id);
            return Err(e.to_string());
        }
    } else if let Err(e) = state.db.insert_chat_message(session_id, "user", &content, "done") {
        end_stream(&state, session_id);
        return Err(e.to_string());
    }
    if let Some(pid) = &provider_id {
        state.db.set_chat_session_model(session_id, Some(pid), &model).map_err(|e| e.to_string())?;
    } else {
        state.db.set_chat_session_model(session_id, None, &model).map_err(|e| e.to_string())?;
    }
    run_stream(&state, session_id, model, client, channel, flag)
}

/// 重新生成（重发/重试）：删除最后一条 assistant（含 failed/aborted 占位）后重流。
#[tauri::command]
pub async fn chat_regenerate(
    state: State<'_, AppState>,
    session_id: i64,
    channel: Channel<ChatStreamEvent>,
) -> Result<(), String> {
    let session = validate_session(&state, session_id)?;
    // v0.19.1：学习库问答会话重生成——重跑检索 + 生成整链
    if session.retrieval {
        return crate::commands_ai_chat_kb::kb_chat_regenerate(&state, session_id, channel);
    }
    let settings = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?
        .clone();
    settings.content_gate()?;
    // 先解析客户端（Provider/密钥失败 → 不删旧回答，保留可重发状态）
    let (client, _provider_id) = resolve_chat_client(&state, &session)?;
    let model = client.config.model.clone();
    // 单活跃流注册早于删除动作（审查修复：与 chat_send 同纪律）
    let flag = try_begin_stream(&state, session_id)?;
    // 审查 M2（v0.19.1 同修既有泄漏）：flag 已注册——list 失败早退必须 end_stream
    let msgs = match state.db.list_chat_messages(session_id) {
        Ok(m) => m,
        Err(e) => {
            end_stream(&state, session_id);
            return Err(e.to_string());
        }
    };
    if let Some(last_assistant) = msgs.iter().rev().find(|m| m.role == "assistant") {
        if let Err(e) = state.db.delete_chat_message(session_id, last_assistant.id) {
            end_stream(&state, session_id);
            return Err(e.to_string());
        }
    } else {
        end_stream(&state, session_id);
        return Err("没有可重新生成的消息".to_string());
    }
    run_stream(&state, session_id, model, client, channel, flag)
}

/// 停止（置取消标志 → 流循环下一行检查短路；无进行中流则 no-op）。
#[tauri::command]
pub fn chat_cancel(state: State<'_, AppState>, session_id: i64) -> Result<(), String> {
    let cancels = state
        .chat_cancels
        .lock()
        .map_err(|e| format!("取消表锁中毒: {}", e))?;
    if let Some(flag) = cancels.get(&session_id) {
        flag.cancel();
    }
    Ok(())
}

/// 单活跃流编排（chat_send/chat_regenerate 共用；flag 由调用方注册）。
fn run_stream(
    state: &AppState,
    session_id: i64,
    model: String,
    client: AiClient,
    channel: Channel<ChatStreamEvent>,
    flag: crate::ai_chat::CancelFlag,
) -> Result<(), String> {
    // 历史组装（最新消息已入库；failed 占位不喂上下文——用户已见错误）。
    // 列表失败不阻断流传输（消息刚插入过）；打印可观测，历史为空保守降级。
    let messages = match state.db.list_chat_messages(session_id) {
        Ok(msgs) => {
            let history: Vec<ChatMessageInput> = msgs
                .into_iter()
                .filter(|m| m.role != "system")
                .filter(|m| m.status != "failed")
                .map(|m| ChatMessageInput {
                    role: if m.role == "user" { ChatRole::User } else { ChatRole::Assistant },
                    content: m.content,
                })
                .collect();
            build_messages(CHAT_SYSTEM_PROMPT, &history)
        }
        Err(e) => {
            eprintln!("[ai-chat] 历史组装失败（降级空上下文）: {}", e);
            build_messages(CHAT_SYSTEM_PROMPT, &[])
        }
    };
    let st = state.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = match stream_chat(&client, &messages, &flag, |ev| {
            let _ = channel.send(ev); // Channel 失败（前端已关）静默——数据不丢仍落库
        }) {
            Ok(o) => o,
            Err(e) => {
                // 失败：占位消息 content=错误原文（审查修复：L2 优先级——错误
                // 文本持久化，前端失败气泡不再依赖瞬态事件态，重启/切换后仍可读）；
                // 重试=chat_regenerate（删占位后重流）
                let msg = e.to_string();
                let _ = channel.send(ChatStreamEvent::from(&e));
                let _ = st.db.insert_chat_message(session_id, "assistant", &truncate_chars(&msg, 500), "failed");
                end_stream(&st, session_id);
                return;
            }
        };
        let status = if outcome.cancelled { "aborted" } else { "done" };
        let _ = st.db.insert_chat_message(session_id, "assistant", &outcome.content, status);
        // 回填用量/模型（取最后落库的 assistant 消息 id）
        if let Ok(msgs) = st.db.list_chat_messages(session_id) {
            if let Some(last) = msgs.iter().rev().find(|m| m.role == "assistant") {
                let _ = st.db.finish_chat_message(
                    last.id,
                    &outcome.content,
                    status,
                    outcome.usage_json.as_deref(),
                    Some(&model),
                );
            }
        }
        if outcome.cancelled {
            let _ = channel.send(ChatStreamEvent::Aborted { content: outcome.content });
        } else {
            let _ = channel.send(ChatStreamEvent::Done { content: outcome.content, usage_json: outcome.usage_json });
        }
        end_stream(&st, session_id);
    });
    Ok(())
}

/// 任务对话详情（REQ-230）：任务记录 + 轨迹（完整提示词/回答，逐 turn）。
#[tauri::command]
pub fn ai_task_conversation(
    state: State<'_, AppState>,
    task_id: u64,
) -> Result<(crate::db_ai_tasks::AiTaskRecord, Vec<AiTurn>), String> {
    let rec = state
        .db
        .list_ai_task_by_id(task_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "任务不存在".to_string())?;
    let turns = state
        .db
        .get_ai_task_trajectory(task_id)
        .map_err(|e| e.to_string())?
        .and_then(|s| trajectory_from_json(&s))
        .unwrap_or_default();
    Ok((rec, turns))
}
