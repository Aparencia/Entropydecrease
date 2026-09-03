//! kb_prompt.rs 单测（片段打包/消息组装/meta 契约——v0.19.1 纯函数）。

use crate::ai_chat::ChatRole;
use crate::db_ai_chat::ChatMessage;
use crate::kb_prompt::{
    KB_SYSTEM_PROMPT, as_history, is_kb_history_eligible, kb_budget_chars, kb_build_context,
    kb_hits_only_content, kb_label, kb_meta_is_answer, kb_meta_json, kb_messages,
    kb_qa_user_content,
};
use crate::kb_search::KbHit;

fn hit(kind: &str, chunk_id: i64) -> KbHit {
    KbHit {
        chunk_id,
        source_kind: kind.to_string(),
        note_id: if kind == "note" { Some(7) } else { None },
        fragment_id: if kind == "note" { None } else { Some(9) },
        note_title: if kind == "note" { Some("眼影入门".to_string()) } else { None },
        group_name: None,
        heading: if kind == "note" { Some("晕染手法".to_string()) } else { None },
        snippet: "片段".to_string(),
        score_kind: "fts".to_string(),
    }
}

fn msg(role: &str, content: &str, meta: Option<&str>, status: &str) -> ChatMessage {
    ChatMessage {
        id: 1,
        session_id: 1,
        role: role.to_string(),
        content: content.to_string(),
        model: None,
        usage_json: None,
        meta_json: meta.map(|s| s.to_string()),
        status: status.to_string(),
        created_at: 1,
    }
}

#[test]
fn labels_reflect_source_kind_and_heading() {
    // Arrange/Act
    let n = hit("note", 1);
    let f = hit("fragment", 2);
    // Assert
    assert_eq!(kb_label(&n), "笔记《眼影入门》·晕染手法");
    let mut n2 = hit("note", 3);
    n2.heading = None;
    assert_eq!(kb_label(&n2), "笔记《眼影入门》");
    assert_eq!(kb_label(&f), "碎片");
    let mut f2 = hit("fragment", 4);
    f2.group_name = Some("化妆课".to_string());
    assert_eq!(kb_label(&f2), "碎片（化妆课）");
}

#[test]
fn context_builds_labeled_entries_and_truncates_honestly() {
    // Arrange
    let n = hit("note", 1);
    let text = "晕染手法的核心是少量多次。";
    // Act
    let (ctx, truncated) = kb_build_context(&[(n, text.to_string())], kb_budget_chars("standard"));
    // Assert
    assert!(!truncated);
    assert!(ctx.contains("[1] 出自 笔记《眼影入门》·晕染手法"), "ctx={}", ctx);
    assert!(ctx.contains(text));
    // 超预算 → 诚实截断标记
    let (ctx2, truncated2) = kb_build_context(&[(hit("note", 1), text.to_string())], 20);
    assert!(truncated2);
    assert!(ctx2.contains("超预算"), "截断标记不静默: {}", ctx2);
    // 空条目 → 空串
    let (empty, t3) = kb_build_context(&[], 1000);
    assert!(empty.is_empty() && !t3);
}

#[test]
fn user_content_combines_context_and_question() {
    // Arrange/Act
    let c = kb_qa_user_content("[1] 片段", "我在哪学过晕染？");
    // Assert
    assert!(c.contains("[1] 片段") && c.contains("我在哪学过晕染？"));
}

#[test]
fn messages_insert_context_before_last_user_question() {
    // Arrange：历史末条 = 当前提问（chat_send 先落用户消息）
    let history = vec![
        crate::ai_chat::ChatMessageInput { role: ChatRole::User, content: "旧问题".into() },
        crate::ai_chat::ChatMessageInput { role: ChatRole::Assistant, content: "旧回答".into() },
        crate::ai_chat::ChatMessageInput { role: ChatRole::User, content: "当前问题".into() },
    ];
    // Act
    let msgs = kb_messages(KB_SYSTEM_PROMPT, &history, "【片段】");
    // Assert
    assert_eq!(msgs[0]["role"], "system");
    assert!(msgs[0]["content"].as_str().unwrap().contains("只依据"));
    let roles: Vec<&str> = msgs.iter().map(|m| m["role"].as_str().unwrap()).collect();
    assert_eq!(roles, vec!["system", "user", "assistant", "user", "user"], "上下文插在提问前");
    assert_eq!(msgs[msgs.len() - 1]["content"], "当前问题");
    assert_eq!(msgs[msgs.len() - 2]["content"], "【片段】");
}

#[test]
fn messages_fallback_appends_context_when_no_user_tail() {
    // Arrange/Act（防御路径：末条非 user → 上下文附加不吞问题）
    let history = vec![crate::ai_chat::ChatMessageInput { role: ChatRole::Assistant, content: "x".into() }];
    let msgs = kb_messages(KB_SYSTEM_PROMPT, &history, "【片段】");
    // Assert
    assert_eq!(msgs.last().unwrap()["content"], "【片段】");
}

#[test]
fn meta_json_mode_roundtrip() {
    // Arrange/Act
    let meta = kb_meta_json("answer", &[hit("note", 5)]).expect("serialize");
    // Assert
    assert!(kb_meta_is_answer(Some(&meta)), "answer 模式可入后续上下文");
    assert!(!kb_meta_is_answer(None));
    assert!(!kb_meta_is_answer(Some("{}")));
    assert!(!kb_meta_is_answer(Some(&kb_meta_json("hits-only", &[hit("note", 5)]).unwrap())));
    assert!(meta.contains("\"mode\":\"answer\""));
    assert!(meta.contains("\"sourceKind\":\"note\"") || meta.contains("\"source_kind\":\"note\""), "meta={}", meta);
}

#[test]
fn history_eligibility_excludes_hits_only_guidance() {
    // Arrange
    let hits_only = kb_meta_json("hits-only", &[]).unwrap();
    let answer = kb_meta_json("answer", &[]).unwrap();
    // Assert
    assert!(is_kb_history_eligible("user", None));
    assert!(is_kb_history_eligible("assistant", None), "旧消息（无 meta）照常入上下文");
    assert!(is_kb_history_eligible("assistant", Some(&answer)));
    assert!(!is_kb_history_eligible("assistant", Some(&hits_only)), "引导文案不冒充回答");
}

#[test]
fn as_history_filters_failed_and_hits_only() {
    // Arrange
    let rows = vec![
        msg("user", "问题", None, "done"),
        msg("assistant", "🔍 命中列表引导…", Some(&kb_meta_json("hits-only", &[]).unwrap()), "done"),
        msg("assistant", "真回答", Some(&kb_meta_json("answer", &[]).unwrap()), "done"),
        msg("assistant", "失败占位", None, "failed"),
    ];
    // Act
    let hist = as_history(&rows);
    // Assert
    assert_eq!(hist.len(), 2);
    assert_eq!(hist[0].content, "问题");
    assert_eq!(hist[1].content, "真回答");
}

#[test]
fn hits_only_content_is_honest_and_guides() {
    // Arrange/Act
    let with_hits = kb_hits_only_content(3, "问");
    let none = kb_hits_only_content(0, "超长问题内容内容内容内容内容内容");
    // Assert
    assert!(with_hits.contains("3 条命中"));
    assert!(with_hits.contains("学习库问答生成"));
    assert!(none.contains("未找到"));
}

#[test]
fn budget_scales_with_tier() {
    // Arrange/Act/Assert（light < standard < deep——档位硬顶分级）
    assert!(kb_budget_chars("light") < kb_budget_chars("standard"));
    assert!(kb_budget_chars("standard") < kb_budget_chars("deep"));
}
