//! ai_chat_stream.rs 测试（本地 TCP 假服务端——不依赖真实 API）。
//!
//! @ai-context: 覆盖：SSE 逐 delta 回调、[DONE] 终止、usage 提取、
//!              取消短路（emit 内置位 → 循环退出）、401 归一 Auth。

use std::net::TcpListener;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use crate::ai_chat::CancelFlag;
use crate::ai_chat_stream::{ChatStreamEvent, extract_usage, stream_chat};
use crate::ai_client::{AiClient, AiClientConfig};

/// 起一个假 SSE 服务端：响应体（Content-Length 精算）+ 可选延迟后关闭。
/// 返回端口；请求内容读弃（不校验——payload 组装另有纯函数单测）。
fn fake_sse_server(body: &'static str, hold_ms: u64) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().unwrap().port();
    thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            use std::io::{Read, Write};
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf); // 读到请求头即可（不回包也行）
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(body.as_bytes());
            let _ = stream.flush();
            thread::sleep(Duration::from_millis(hold_ms));
        }
    });
    port
}

fn client_for(port: u16) -> AiClient {
    AiClient::new(AiClientConfig {
        base_url: format!("http://127.0.0.1:{}", port),
        api_key: "test-key".to_string(),
        model: "test-model".to_string(),
        timeout_secs: 10,
        max_retries: 0,
        max_tokens: 128,
        is_local: false,
    })
}

#[test]
fn stream_collects_deltas_and_done() {
    let body = "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\
                data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\
                data: {\"choices\":[{\"delta\":{}}]}\n\
                data: [DONE]\n";
    let port = fake_sse_server(body, 50);
    let client = client_for(port);
    let mut events = Vec::new();
    let out = stream_chat(
        &client,
        &[serde_json::json!({"role": "user", "content": "hi"})],
        &CancelFlag::new(),
        |e| events.push(e),
    )
    .expect("stream ok");
    assert_eq!(out.content, "你好");
    assert!(!out.cancelled);
    assert_eq!(
        events,
        vec![
            ChatStreamEvent::Chunk { delta: "你".to_string() },
            ChatStreamEvent::Chunk { delta: "好".to_string() },
        ]
    );
}

#[test]
fn stream_extracts_usage_from_final_chunk() {
    let body = "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\
                data: {\"choices\":[{\"delta\":{}}],\"usage\":{\"total_tokens\":42}}\n\
                data: [DONE]\n";
    let port = fake_sse_server(body, 50);
    let out = stream_chat(&client_for(port), &[], &CancelFlag::new(), |_| {}).expect("ok");
    assert_eq!(out.content, "a");
    assert_eq!(out.usage_json.as_deref(), Some(r#"{"total_tokens":42}"#));
}

#[test]
fn stream_cancels_midway() {
    // 服务端快速吐 5 片；emit 在第一个 Chunk 后置取消标志 →
    // 循环下一轮检查取消 → 提前退出（cancelled=true，内容=首片）
    let body = "data: {\"choices\":[{\"delta\":{\"content\":\"一\"}}]}\n\
                data: {\"choices\":[{\"delta\":{\"content\":\"二\"}}]}\n\
                data: {\"choices\":[{\"delta\":{\"content\":\"三\"}}]}\n\
                data: {\"choices\":[{\"delta\":{\"content\":\"四\"}}]}\n\
                data: {\"choices\":[{\"delta\":{\"content\":\"五\"}}]}\n";
    let port = fake_sse_server(body, 300);
    let flag = CancelFlag::new();
    let _ = flag.clone();
    let mut first = true;
    let out = stream_chat(&client_for(port), &[], &flag, |e| {
        if !first {
            return;
        }
        first = false;
        if let ChatStreamEvent::Chunk { .. } = e {
            flag.cancel();
        }
    })
    .expect("ok");
    assert!(out.cancelled);
    assert_eq!(out.content, "一");
}

#[test]
fn stream_empty_key_is_auth_error() {
    // 不联网：本地端点标记 false + 空密钥 → 直接 Auth 归一（前置校验）
    let client = AiClient::new(AiClientConfig {
        base_url: "http://127.0.0.1:1".to_string(),
        api_key: String::new(),
        model: "m".to_string(),
        timeout_secs: 5,
        max_retries: 0,
        max_tokens: 8,
        is_local: false,
    });
    let err = stream_chat(&client, &[], &CancelFlag::new(), |_| {}).unwrap_err();
    assert_eq!(err.kind(), "auth");
}

#[test]
fn extract_usage_pure() {
    assert_eq!(
        extract_usage(r#"data: {"choices":[],"usage":{"total_tokens":10}}"#).as_deref(),
        Some(r#"{"total_tokens":10}"#)
    );
    assert_eq!(extract_usage(r#"data: {"choices":[{"delta":{"content":"x"}}]}"#), None);
    assert_eq!(extract_usage("event: ping"), None);
    assert_eq!(extract_usage(r#"data: {"usage":null}"#), None);
}

#[test]
fn cancel_flag_independent_of_arc_count() {
    // CancelFlag 为 Arc 包装：克隆共享同一位——多线程取消可观察
    let flag = CancelFlag::new();
    let clone = flag.clone();
    let spawned = Arc::new(AtomicBool::new(false));
    let sp = spawned.clone();
    thread::spawn(move || {
        clone.cancel();
        sp.store(true, Ordering::Relaxed);
    })
    .join()
    .unwrap();
    assert!(flag.is_cancelled());
    assert!(spawned.load(Ordering::Relaxed));
}
