//! 学习库问答·命令编排（REQ-260，v0.19.1；设计 §7.1/§7.3）。
//!
//! @ai-context: 读路径 A 发送流——本地 kb_search 命中 → **命中片段列表恒返回**
//!              （本地零成本零上传，不受 AI 闸门约束）→ 生成仅当 content_gate
//!              + kb_qa_enabled 双闸门开（默认关）→ 片段打包（budget_allocator
//!              pack_fragments 转正：预算硬顶 + 诚实截断标记）→ 流式生成 →
//!              回答 + meta_json 引用落库（命中清单/引用溯源）。
//! @ai-context: 降级链（§7.3）：断网/Provider 故障 → 该条回退命中列表 + 诚实
//!              错误（failed 占位 + meta 命中——引用不丢，重试沿用）；
//!              无 embedding → FTS-only 精度（0.19.3 前置无感知）。

use tauri::ipc::Channel;

use crate::ai_chat::CancelFlag;
use crate::ai_chat_client::{
    end_stream, resolve_chat_client, truncate_chars, try_begin_stream, validate_session,
};
use crate::ai_chat_stream::{ChatStreamEvent, stream_chat};
use crate::ai_settings::AiSettings;
use crate::commands::AppState;
use crate::kb_prompt::{
    KB_SYSTEM_PROMPT, as_history, kb_budget_chars, kb_build_context, kb_hits_only_content,
    kb_meta_json, kb_messages, kb_qa_user_content,
};
use crate::kb_search::{KbHit, KB_SEARCH_DEFAULT_LIMIT};

/// 本路径检索命中上限（设计 top-K；≤命令层钳制，同时防 meta 膨胀）。
pub const KB_QA_HITS_LIMIT: usize = KB_SEARCH_DEFAULT_LIMIT;

/// 发送流（chat_send 检索分支入口；resend=编辑后重发，与纯聊同语义）。
pub(crate) fn kb_chat_send(
    state: &AppState,
    session_id: i64,
    content: &str,
    resend_message_id: Option<u64>,
    channel: Channel<ChatStreamEvent>,
) -> Result<(), String> {
    let settings = settings_snapshot(state)?;
    // 单活跃流注册必须早于任何落库（与纯聊同纪律——防并发双落/双扣费）
    let flag = try_begin_stream(state, session_id)?;
    // 用户消息落库（编辑重发：改内容 + 作废旧回答；入参校验防跨会话误改）
    if let Some(mid) = resend_message_id {
        let role = state.db.chat_message_role(session_id, mid as i64).map_err(|e| e.to_string())?;
        match role.as_deref() {
            Some("user") => {}
            Some(_) => {
                end_stream(state, session_id);
                return Err("编辑重发只能作用于用户消息（assistant 消息用「重发」）".to_string());
            }
            None => {
                end_stream(state, session_id);
                return Err("要编辑的消息不存在或不属于该会话".to_string());
            }
        }
        if let Err(e) = state.db.update_chat_message_content(session_id, mid as i64, content) {
            end_stream(state, session_id);
            return Err(e.to_string());
        }
        if let Err(e) = state.db.delete_chat_messages_after(session_id, mid as i64) {
            end_stream(state, session_id);
            return Err(e.to_string());
        }
    } else if let Err(e) = state.db.insert_chat_message(session_id, "user", content, "done") {
        end_stream(state, session_id);
        return Err(e.to_string());
    }
    // 交互即"最近更新"（gate-off 路径无 model 回写不再 bump——显式 touch；
    // 审查 L5：此前仅生成成功路径经 set_chat_session_model 顺带刷新排序）
    let _ = state.db.touch_chat_session(session_id);
    kb_run(state, session_id, content, channel, flag, &settings)
}

/// 重新生成（chat_regenerate 检索分支入口：删旧回答后以最近提问重跑整链）。
pub(crate) fn kb_chat_regenerate(
    state: &AppState,
    session_id: i64,
    channel: Channel<ChatStreamEvent>,
) -> Result<(), String> {
    let settings = settings_snapshot(state)?;
    let flag = try_begin_stream(state, session_id)?;
    let msgs = match state.db.list_chat_messages(session_id) {
        Ok(m) => m,
        // 审查 M2：flag 已注册——任何早退必须 end_stream，否则会话永久
        // "进行中"直至重启
        Err(e) => {
            end_stream(state, session_id);
            return Err(e.to_string());
        }
    };
    // 先定位并删除旧回答（failed/aborted 占位一并重试——语义同纯聊 regenerate）
    let old_assistant = msgs.iter().rev().find(|m| m.role == "assistant");
    if let Some(last) = old_assistant {
        if let Err(e) = state.db.delete_chat_message(session_id, last.id) {
            end_stream(state, session_id);
            return Err(e.to_string());
        }
    }
    let question = msgs
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.trim().to_string());
    match question {
        Some(q) if !q.is_empty() => {
            let _ = state.db.touch_chat_session(session_id);
            kb_run(state, session_id, &q, channel, flag, &settings)
        }
        _ => {
            end_stream(state, session_id);
            Err("没有可重新生成的提问（历史已空）".to_string())
        }
    }
}

fn settings_snapshot(state: &AppState) -> Result<AiSettings, String> {
    state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))
        .map(|g| g.clone())
}

/// 检索 → 双产物主链（命中列表恒发；生成按闸门分流）。
fn kb_run(
    state: &AppState,
    session_id: i64,
    question: &str,
    channel: Channel<ChatStreamEvent>,
    flag: CancelFlag,
    settings: &AiSettings,
) -> Result<(), String> {
    // ① 本地检索（零成本零上传——不受闸门约束；REQ-259：引擎就绪自动语义合流；
    // 锁与 db 调用同作用域——引擎借用不逃逸锁生命周期）
    let hits = {
        let slot = state
            .embedding_slot
            .lock()
            .map_err(|e| format!("embedding 引擎锁中毒: {}", e))?;
        let engine = (slot.engine.dims().is_some()).then(|| slot.engine.as_ref());
        state.db.kb_search_hybrid(engine, question, KB_QA_HITS_LIMIT)
    };
    let hits = match hits {
        Ok(h) => h,
        Err(e) => {
            // 检索层故障：failed 占位 + 诚实错误（与断网同类降级路径）
            eprintln!("[kb-chat] 本地检索失败: {}", e);
            let msg = truncate_chars(&format!("本地检索失败（命中列表暂不可用）: {}", e), 500);
            let _ = state.db.insert_chat_message(session_id, "assistant", &msg, "failed");
            let _ = channel.send(ChatStreamEvent::Failed { error_kind: "local".to_string(), message: msg });
            end_stream(state, session_id);
            return Ok(());
        }
    };
    let _ = channel.send(ChatStreamEvent::KbHits { hits: hits.clone() });
    // ② 生成闸门（默认关）——关：命中列表 + 引导文案即完整产物
    if let Err(gate_msg) = settings.kb_qa_gate() {
        let mut content = kb_hits_only_content(hits.len(), question);
        // 全局未开/未授权场景附具体引导（不灰死——直达设置文案）
        if !settings.enabled || !settings.authorized {
            content.push_str("（另需在设置 → AI 服务开启全局 AI 并同意授权）");
        } else {
            content.push_str(&format!("（{}）", gate_msg));
        }
        persist_hits_msg(state, session_id, &content, "done", Some(&hits));
        let _ = channel.send(ChatStreamEvent::Done { content, usage_json: None });
        end_stream(state, session_id);
        return Ok(());
    }
    // ③ 生成可用：客户端解析失败 → 回退命中列表 + 诚实错误（重试沿用）
    let session = match validate_session(state, session_id) {
        Ok(s) => s,
        Err(e) => {
            let msg = truncate_chars(&e, 500);
            persist_hits_msg(state, session_id, &msg, "failed", Some(&hits));
            let _ = channel.send(ChatStreamEvent::Failed { error_kind: "config".to_string(), message: msg });
            end_stream(state, session_id);
            return Ok(());
        }
    };
    let (client, provider_id) = match resolve_chat_client(state, &session) {
        Ok(c) => c,
        Err(e) => {
            let msg = truncate_chars(&e, 500);
            persist_hits_msg(state, session_id, &msg, "failed", Some(&hits));
            let _ = channel.send(ChatStreamEvent::Failed { error_kind: "config".to_string(), message: msg });
            end_stream(state, session_id);
            return Ok(());
        }
    };
    let model = client.config.model.clone();
    if let Some(pid) = &provider_id {
        let _ = state.db.set_chat_session_model(session_id, Some(pid), &model);
    } else {
        let _ = state.db.set_chat_session_model(session_id, None, &model);
    }
    let meta_answer = kb_meta_json("answer", &hits);
    // 失败分支共用的 hits-only meta 快照（线程内命中引用保留——审查 H1：
    // 生成中失败（断网/401/429）也必须挂 meta，前端 failed 气泡据此渲染引用）
    let meta_hits = kb_meta_json("hits-only", &hits);
    let st = state.clone();
    let q = question.to_string();
    let tier = settings.kb_qa_tier.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // ④ 片段全文取回 → 预算打包（pack_fragments 转正——硬顶 + 诚实截断）
        let chunk_ids: Vec<i64> = hits.iter().map(|h| h.chunk_id).collect();
        let text_map = match st.db.kb_chunk_texts(&chunk_ids) {
            Ok(m) => m,
            Err(e) => {
                // 审查 L4：取回失败不得静默——记录并按空文本降级（命中引用仍在）
                eprintln!("[kb-chat] 命中全文取回失败（按空文本降级）: {}", e);
                std::collections::HashMap::new()
            }
        };
        let entries: Vec<(KbHit, String)> = hits
            .iter()
            .cloned()
            .map(|h| {
                let text = text_map.get(&h.chunk_id).cloned().unwrap_or_default();
                (h, text)
            })
            .collect();
        let (ctx, _truncated) = kb_build_context(&entries, kb_budget_chars(&tier));
        // ⑤ 消息组装（历史剔除 hits-only 引导——is_kb_history_eligible 由
        // as_history 承担）+ 流式生成
        let history = match st.db.list_chat_messages(session_id) {
            Ok(msgs) => as_history(&msgs),
            Err(e) => {
                eprintln!("[kb-chat] 历史组装失败（降级空上下文）: {}", e);
                Vec::new()
            }
        };
        let messages = kb_messages(KB_SYSTEM_PROMPT, &history, &kb_qa_user_content(&ctx, &q));
        match stream_chat(&client, &messages, &flag, |ev| {
            let _ = channel.send(ev);
        }) {
            Ok(o) => {
                let status = if o.cancelled { "aborted" } else { "done" };
                match st.db.insert_chat_message(session_id, "assistant", &o.content, status) {
                    Ok(id) => {
                        let _ = st.db.finish_chat_message(
                            id,
                            &o.content,
                            status,
                            o.usage_json.as_deref(),
                            Some(&model),
                        );
                        if let Some(meta) = &meta_answer {
                            let _ = st.db.set_chat_message_meta(session_id, id, Some(meta));
                        }
                    }
                    Err(e) => eprintln!("[kb-chat] 回答落库失败: {}", e),
                }
                if o.cancelled {
                    let _ = channel.send(ChatStreamEvent::Aborted { content: o.content });
                } else {
                    let _ = channel.send(ChatStreamEvent::Done { content: o.content, usage_json: o.usage_json });
                }
            }
            Err(e) => {
                let msg = e.to_string();
                let _ = channel.send(ChatStreamEvent::from(&e));
                // 失败回退命中列表（hits-only meta 照挂——引用不丢；历史过滤
                // 按 failed 排除——审查 H1 修复：生成中失败与生成前失败同契约）
                match st.db.insert_chat_message(
                    session_id,
                    "assistant",
                    &truncate_chars(&msg, 500),
                    "failed",
                ) {
                    Ok(id) => {
                        let _ = st.db.finish_chat_message(
                            id,
                            &truncate_chars(&msg, 500),
                            "failed",
                            None,
                            Some(&model),
                        );
                        if let Some(meta) = &meta_hits {
                            let _ = st.db.set_chat_message_meta(session_id, id, Some(meta));
                        }
                    }
                    Err(e2) => eprintln!("[kb-chat] 失败消息落库失败: {}", e2),
                }
            }
        }
        end_stream(&st, session_id);
    });
    Ok(())
}

/// 落库命中引导/失败消息（id 级直写 + hits-only meta——命中不丢）。
fn persist_hits_msg(
    state: &AppState,
    session_id: i64,
    content: &str,
    status: &str,
    hits: Option<&[KbHit]>,
) {
    match state.db.insert_chat_message(session_id, "assistant", content, status) {
        Ok(id) => {
            let _ = state.db.finish_chat_message(id, content, status, None, None);
            if let Some(h) = hits {
                if let Some(meta) = kb_meta_json("hits-only", h) {
                    let _ = state.db.set_chat_message_meta(session_id, id, Some(&meta));
                }
            }
        }
        Err(e) => eprintln!("[kb-chat] 消息落库失败: {}", e),
    }
}
