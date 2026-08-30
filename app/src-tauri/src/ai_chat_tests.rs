//! ai_chat.rs 纯函数单测（AAA 模式：Arrange/Act/Assert）。

use crate::ai_chat::{
    AiTurn, CancelFlag, ChatMessageInput, ChatRole, SseEvent, build_messages, parse_sse_line,
    trajectory_from_json, trajectory_to_json,
};

#[test]
fn build_messages_system_on_top() {
    let history = vec![ChatMessageInput::user("你好")];
    let msgs = build_messages("助手", &history);
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs[0]["role"], "system");
    assert_eq!(msgs[0]["content"], "助手");
    assert_eq!(msgs[1]["role"], "user");
    assert_eq!(msgs[1]["content"], "你好");
}

#[test]
fn build_messages_skips_blank_system() {
    let msgs = build_messages("  ", &[ChatMessageInput::user("hi")]);
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0]["role"], "user");
}

#[test]
fn build_messages_truncates_to_max_history() {
    // 31 条历史 → 只留最近 30 条（防长会话 token 失控）
    let history: Vec<ChatMessageInput> =
        (0..31).map(|i| ChatMessageInput::user(format!("m{}", i))).collect();
    let msgs = build_messages("s", &history);
    assert_eq!(msgs.len(), 31); // system + 30
    assert_eq!(msgs[1]["content"], "m1"); // 第 0 条被截
    assert_eq!(msgs[30]["content"], "m30");
}

#[test]
fn parse_sse_line_delta() {
    let line = r#"data: {"choices":[{"delta":{"content":"你好"},"index":0}]}"#;
    assert_eq!(parse_sse_line(line), SseEvent::Delta("你好".to_string()));
}

#[test]
fn parse_sse_line_done_with_spaces() {
    assert_eq!(parse_sse_line("data: [DONE]"), SseEvent::Done);
    assert_eq!(parse_sse_line("data:[DONE]"), SseEvent::Done);
}

#[test]
fn parse_sse_line_ignores_non_data_and_malformed() {
    assert_eq!(parse_sse_line(""), SseEvent::Ignore);
    assert_eq!(parse_sse_line("event: ping"), SseEvent::Ignore);
    assert_eq!(parse_sse_line("data: not-json"), SseEvent::Ignore);
    assert_eq!(parse_sse_line("data: {\"choices\":[{\"delta\":{}}]}"), SseEvent::Ignore);
}

#[test]
fn parse_sse_line_ignores_unicode_whitespace() {
    // 行尾 \r（Windows/老服务商行尾）trim 后正常解析
    let line = "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\r";
    assert_eq!(parse_sse_line(line), SseEvent::Delta("a".to_string()));
}

#[test]
fn trajectory_roundtrip() {
    let turns = vec![
        AiTurn {
            turn: 1,
            system: "s".to_string(),
            user: r#"{"content":"片1"}"#.to_string(),
            response: r#"{"blocks":[]}"#.to_string(),
        },
        AiTurn { turn: 2, system: "s".to_string(), user: "u".to_string(), response: "r".to_string() },
    ];
    let json = trajectory_to_json(&turns).expect("序列化");
    let back = trajectory_from_json(&json).expect("反序列化");
    assert_eq!(back, turns);
}

#[test]
fn trajectory_parse_corrupt_returns_none() {
    assert_eq!(trajectory_from_json("not-json"), None);
    // 结构非法（非对象数组）→ None（诚实降级，不 panic）
    assert_eq!(trajectory_from_json(r#"{"a":1}"#), None);
}

#[test]
fn cancel_flag_initial_false_then_cancel() {
    let flag = CancelFlag::new();
    assert!(!flag.is_cancelled());
    flag.cancel();
    assert!(flag.is_cancelled());
}

#[test]
fn chat_role_as_str_whitelist() {
    assert_eq!(ChatRole::System.as_str(), "system");
    assert_eq!(ChatRole::User.as_str(), "user");
    assert_eq!(ChatRole::Assistant.as_str(), "assistant");
}
