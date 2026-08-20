//! ai_client.rs 单测（AAA 模式；payload/解析纯函数——网络路径不单测）。

use crate::ai_client::{
    build_chat_payload, chat_completions_url, extract_content, parse_json_object, AiClient,
    AiClientConfig, AiClientError,
};
use crate::ai_settings::AiSettings;

#[test]
fn chat_url_preserves_v1_segment() {
    // 审查回归（2026-08-21）：/v1 不得被 trim——默认端点 + 自定义端点均保留
    assert_eq!(
        chat_completions_url("https://api.siliconflow.cn/v1"),
        "https://api.siliconflow.cn/v1/chat/completions"
    );
    assert_eq!(
        chat_completions_url("https://api.siliconflow.cn/v1/"),
        "https://api.siliconflow.cn/v1/chat/completions"
    );
    assert_eq!(
        chat_completions_url("https://custom.example.com/v1"),
        "https://custom.example.com/v1/chat/completions"
    );
    // 用户配置裸主机（无 /v1）时按原样拼接（端点兜底由设置页提示约束）
    assert_eq!(
        chat_completions_url("https://custom.example.com"),
        "https://custom.example.com/chat/completions"
    );
}

#[test]
fn payload_has_expected_shape() {
    // temperature=0 + json_object + system/user 消息
    let p = build_chat_payload("acme/model", "sys", "usr");
    assert_eq!(p["model"], "acme/model");
    assert_eq!(p["messages"][0]["role"], "system");
    assert_eq!(p["messages"][0]["content"], "sys");
    assert_eq!(p["messages"][1]["content"], "usr");
    assert_eq!(p["temperature"], 0);
    assert_eq!(p["response_format"]["type"], "json_object");
}

#[test]
fn payload_r1_disables_think() {
    // R1 系推理模型带 no_think=true（保 JSON 稳定）；非 R1 不带
    let r1 = build_chat_payload("deepseek-ai/DeepSeek-R1-0528-Qwen3-8B", "s", "u");
    assert_eq!(r1["no_think"], true);
    let other = build_chat_payload("qwen/qwen3", "s", "u");
    assert!(other.get("no_think").is_none());
}

#[test]
fn extract_content_from_valid_body() {
    let body = r#"{"choices":[{"message":{"content":"{\"ok\":true}"}}]}"#;
    assert_eq!(extract_content(body).expect("提取成功"), r#"{"ok":true}"#);
}

#[test]
fn extract_content_missing_is_error() {
    assert!(extract_content("{}").is_err());
    assert!(extract_content("not json").is_err());
}

#[test]
fn parse_json_object_strips_fences() {
    // 推理模型偶发 ```json 围栏包裹——剥围栏后解析
    let wrapped = "```json\n{\"decisions\":[]}\n```";
    let v = parse_json_object(wrapped).expect("剥围栏解析");
    assert_eq!(v["decisions"], serde_json::json!([]));
    let plain = r#"{"a":1}"#;
    assert_eq!(parse_json_object(plain).expect("直接解析")["a"], 1);
}

#[test]
fn parse_json_object_invalid_is_parse_error() {
    match parse_json_object("not json at all") {
        Err(AiClientError::Parse(_)) => {}
        other => panic!("期望 Parse 错误，实际 {:?}", other.map(|_| ())),
    }
}

#[test]
fn from_settings_resolves_defaults() {
    // 无 env/凭据 → 设置值；密钥为空
    let s = AiSettings::default();
    let c = AiClient::from_settings(&s, None).config;
    assert_eq!(c.base_url, s.base_url);
    assert_eq!(c.model, s.model);
    assert!(c.api_key.is_empty());
    assert_eq!(c.timeout_secs, 60);
    assert_eq!(c.max_retries, 2);
}

#[test]
fn from_settings_uses_stored_key_when_no_env() {
    // 凭据库密钥生效（无 env 时）
    let s = AiSettings::default();
    let c = AiClient::from_settings(&s, Some("sk-stored".to_string())).config;
    assert_eq!(c.api_key, "sk-stored");
}

#[test]
fn chat_json_without_key_is_auth_error() {
    // 无密钥 → Auth 错误（明确引导，不发起请求）
    let client = AiClient::new(AiClientConfig {
        base_url: "https://example.com/v1".to_string(),
        api_key: "".to_string(),
        model: "m".to_string(),
        timeout_secs: 5,
        max_retries: 0,
    });
    match client.chat_json("sys", "usr") {
        Err(AiClientError::Auth(_)) => {}
        other => panic!("期望 Auth 错误，实际 {:?}", other.map(|_| ())),
    }
}
