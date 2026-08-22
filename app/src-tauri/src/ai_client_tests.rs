//! ai_client.rs 单测（AAA 模式；payload/解析纯函数——网络路径不单测）。

use std::sync::Mutex;

use crate::ai_client::{
    build_chat_payload, chat_completions_url, extract_content, fallback_provider_ids, parse_json_object,
    AiClient, AiClientConfig, AiClientError,
};
use crate::ai_provider::{preset_templates, AiProviderStore};
use crate::ai_settings::AiSettings;

/// env 操作互斥（防并行测试互相覆盖 SILICONFLOW_*——与 ai_cost_tests 同模式）。
static ENV_LOCK: Mutex<()> = Mutex::new(());

/// 在锁内执行 env 敏感操作（清除后执行闭包；保存/还原宿主环境）。
fn with_env_locked(f: impl FnOnce()) {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let keys = [
        "SILICONFLOW_API_KEY",
        "SILICONFLOW_BASE_URL",
        "SILICONFLOW_MODEL",
        "SILICONFLOW_TIMEOUT_SECS",
        "SILICONFLOW_RETRIES",
        "SILICONFLOW_MAX_TOKENS",
    ];
    let saved: Vec<(String, Option<String>)> =
        keys.iter().map(|k| (k.to_string(), std::env::var(k).ok())).collect();
    // 清除所有相关 env（防宿主机泄漏干扰测试——闭包内 env 操作纯净）
    for k in &keys {
        std::env::remove_var(k);
    }
    f();
    for (k, v) in saved {
        match v {
            Some(val) => std::env::set_var(k, val),
            None => std::env::remove_var(k),
        }
    }
}

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
    // temperature=0 + json_object + max_tokens 显式上限 + system/user 消息
    let p = build_chat_payload("acme/model", "sys", "usr", 20000);
    assert_eq!(p["model"], "acme/model");
    assert_eq!(p["messages"][0]["role"], "system");
    assert_eq!(p["messages"][0]["content"], "sys");
    assert_eq!(p["messages"][1]["content"], "usr");
    assert_eq!(p["temperature"], 0);
    assert_eq!(p["max_tokens"], 20000);
    assert_eq!(p["response_format"]["type"], "json_object");
}

#[test]
fn payload_r1_disables_think() {
    // R1 系推理模型带 no_think=true（保 JSON 稳定）；非 R1 不带
    let r1 = build_chat_payload("deepseek-ai/DeepSeek-R1-0528-Qwen3-8B", "s", "u", 20000);
    assert_eq!(r1["no_think"], true);
    let other = build_chat_payload("qwen/qwen3", "s", "u", 20000);
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
    // 测试隔离（与 ai_cost_tests 同模式）：锁内清除/还原宿主环境变量
    with_env_locked(|| {
        // Act：无 env/凭据 → 设置值；密钥为空
        let s = AiSettings::default();
        let c = AiClient::from_settings(&s, None).config;
        // Assert：2026-08-21 真机排查后默认值——长生成超时 300s + 输出上限 20000 token
        assert_eq!(c.base_url, s.base_url);
        assert_eq!(c.model, s.model);
        assert!(c.api_key.is_empty());
        assert_eq!(c.timeout_secs, 300);
        assert_eq!(c.max_retries, 2);
        assert_eq!(c.max_tokens, 20000);
        // env 覆盖 max_tokens（锁内顺序执行，无并行竞争）
        std::env::set_var("SILICONFLOW_MAX_TOKENS", "4096");
        let c2 = AiClient::from_settings(&AiSettings::default(), None).config;
        assert_eq!(c2.max_tokens, 4096);
    });
}

#[test]
fn from_settings_uses_stored_key_when_no_env() {
    // 测试隔离（与 ai_cost_tests 同模式）：锁内清除宿主泄漏的 SILICONFLOW_API_KEY
    // （本机 User 级已设真实密钥）——无 env 才验证凭据库密钥
    with_env_locked(|| {
        // 凭据库密钥生效（无 env 时）
        let s = AiSettings::default();
        let c = AiClient::from_settings(&s, Some("sk-stored".to_string())).config;
        assert_eq!(c.api_key, "sk-stored");
    });
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
        max_tokens: 20000,
    });
    match client.chat_json("sys", "usr") {
        Err(AiClientError::Auth(_)) => {}
        other => panic!("期望 Auth 错误，实际 {:?}", other.map(|_| ())),
    }
}

// ---- v0.11.6 M1：Provider 化 + 降级链（Task 3 纯函数层）----

#[test]
fn from_provider_builds_config_from_provider() {
    let mut p = preset_templates().remove(0);
    p.id = "p1".to_string();
    let client = AiClient::from_provider(&p, Some("sk-p1".to_string()));
    assert_eq!(client.config.base_url, p.base_url);
    assert_eq!(client.config.model, p.default_model);
    assert_eq!(client.config.api_key, "sk-p1");
}

#[test]
fn from_settings_resolves_default_provider_when_set() {
    let mut store = AiProviderStore::default();
    let mut p = preset_templates().remove(0);
    p.id = "prov-a".to_string();
    p.default_model = "model-a".to_string();
    store.providers.push(p);
    store.default_provider_id = Some("prov-a".to_string());
    let client = AiClient::from_settings_with_store(
        &crate::ai_settings::AiSettings::default(),
        Some("sk-x".to_string()),
        &store,
    );
    assert_eq!(client.config.model, "model-a");
    assert_eq!(client.config.base_url, "https://api.siliconflow.cn/v1");
}

#[test]
fn from_settings_falls_back_to_legacy_fields_without_store() {
    // 测试隔离：宿主可能已设 SILICONFLOW_MODEL——锁内清除后走旧字段解析
    with_env_locked(|| {
        let client = AiClient::from_settings_with_store(
            &crate::ai_settings::AiSettings::default(),
            Some("sk-x".to_string()),
            &AiProviderStore::default(),
        );
        // 空 store → 回退旧字段解析（兼容迁移前状态）
        assert_eq!(client.config.model, crate::ai_settings::DEFAULT_AI_MODEL);
    });
}

#[test]
fn fallback_chain_skips_auth_balance_errors() {
    use crate::ai_client::AiClientError;
    assert!(AiClientError::Network("x".into()).is_fallbackable());
    assert!(AiClientError::Server("x".into()).is_fallbackable());
    assert!(AiClientError::Quota("x".into()).is_fallbackable());
    assert!(!AiClientError::Auth("x".into()).is_fallbackable());
    assert!(!AiClientError::Balance("x".into()).is_fallbackable());
    assert!(!AiClientError::Parse("x".into()).is_fallbackable());
}

#[test]
fn fallback_chain_order_resolves_provider_sequence() {
    let mut store = AiProviderStore::default();
    let mk = |id: &str| {
        let mut p = preset_templates().remove(0);
        p.id = id.to_string();
        p
    };
    store.providers.push(mk("a"));
    store.providers.push(mk("b"));
    store.providers.push(mk("c"));
    store.default_provider_id = Some("a".to_string());
    let mut a = store.get("a").unwrap().clone();
    a.fallback_order = vec!["b".to_string(), "ghost".to_string(), "c".to_string()];
    let ids = fallback_provider_ids(&store, &a);
    assert_eq!(ids, vec!["a".to_string(), "b".to_string(), "c".to_string()]);
}
