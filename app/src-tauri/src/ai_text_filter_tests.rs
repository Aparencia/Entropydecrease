//! AI 文本复核适配器单测（REQ-085 / v0.6.0 M1）。
//!
//! @ai-context: AAA 模式；payload/解析纯函数全覆盖（提示词模板回归、围栏剥离、
//!              no_think 开关、非法响应）；网络路径不单测（与 model_downloader 同口径）。

use super::*;
use crate::ai_protocol::{TextFilterAction, TextFilterSegment};

fn config() -> AiTextFilterConfig {
    AiTextFilterConfig {
        base_url: "https://api.example.com/v1".into(),
        api_key: "test-key".into(),
        model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B".into(),
        enabled: true,
        timeout_secs: 30,
        max_retries: 2,
        batch_size: 30,
        prompt: TextFilterPrompt::bundled(),
    }
}

fn request() -> TextFilterRequest {
    TextFilterRequest {
        segments: vec![TextFilterSegment {
            segment_id: 1,
            text: "所以这个公式".into(),
            prev: Some("我们来看".into()),
            next: Some("非常重要".into()),
            hint: Some("truncated".into()),
        }],
    }
}

#[test]
fn bundled_prompt_template_parses() {
    // Act：编译期捆绑模板可解析且含六类规则
    let prompt = TextFilterPrompt::bundled();
    // Assert：模板回归——规则数/关键字段不漂移
    assert!(prompt.version >= 1);
    assert!(prompt.rules.len() >= 6, "六类删除标准应齐全，实得 {}", prompt.rules.len());
    assert!(prompt.system.contains("保守原则"));
    assert!(prompt.output_format.contains("decisions"));
    assert!(!prompt.few_shot.is_empty());
}

#[test]
fn system_prompt_includes_rules_and_few_shot() {
    // Act
    let s = build_system_prompt(&config().prompt);
    // Assert：规则与 few-shot 样本都进入提示词
    assert!(s.contains("口头禅"));
    assert!(s.contains("截断半句"));
    assert!(s.contains("示例输入"));
    assert!(s.contains("merge_with"));
}

#[test]
fn payload_has_zero_temperature_and_json_mode() {
    // Act：共享 AiClient 构建 payload（REQ-138 抽取后本模块复用）
    let cfg = config();
    let system = build_system_prompt(&cfg.prompt);
    let user = serde_json::to_string(&request().segments).unwrap();
    let payload = crate::ai_client::build_chat_payload(&cfg.model, &system, &user);
    // Assert
    assert_eq!(payload["temperature"], 0);
    assert_eq!(payload["response_format"]["type"], "json_object");
    assert_eq!(payload["model"], "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B");
    // R1 系 → no_think 开启（2026-08 选型注意点：关闭思考标签保 JSON 稳定）
    assert_eq!(payload["no_think"], true);
    // 用户消息含段文本与上下文
    let user_msg = payload["messages"][1]["content"].as_str().unwrap();
    assert!(user_msg.contains("所以这个公式"));
    assert!(user_msg.contains("我们来看"));
}

#[test]
fn non_r1_model_no_think_absent() {
    // Arrange：非推理模型（Qwen3-30B 付费档）
    let model = "Qwen/Qwen3-30B-A3B-Instruct-2507".to_string();
    // Act
    let payload = crate::ai_client::build_chat_payload(&model, "sys", "usr");
    // Assert：不注入 no_think（未知参数可能被严格端点拒绝）
    assert!(payload.get("no_think").is_none());
}

#[test]
fn parse_response_plain_json() {
    // Arrange
    let raw = r#"{"decisions":[{"segment_id":1,"action":"keep","confidence":0.9,"reason":"技术保留","merge_with":null}]}"#;
    // Act
    let resp = parse_response(raw).unwrap();
    // Assert
    assert_eq!(resp.decisions.len(), 1);
    assert_eq!(resp.decisions[0].action, TextFilterAction::Keep);
    assert_eq!(resp.decisions[0].segment_id, 1);
}

#[test]
fn parse_response_strips_code_fences() {
    // Arrange：推理模型偶发代码块包裹
    let raw = "```json\n{\"decisions\":[{\"segment_id\":2,\"action\":\"delete\",\"confidence\":0.8,\"reason\":\"口头禅\",\"merge_with\":null}]}\n```";
    // Act
    let resp = parse_response(raw).unwrap();
    // Assert
    assert_eq!(resp.decisions[0].segment_id, 2);
    assert_eq!(resp.decisions[0].action, TextFilterAction::Delete);
}

#[test]
fn parse_response_rejects_invalid() {
    // Act & Assert：非法 JSON / 缺字段 / 非法 action 全部 Err（回退纯规则）
    assert!(parse_response("{not json").is_err());
    assert!(parse_response(r#"{"decisions":[]"#).is_err());
    assert!(parse_response(r#"{"decisions":[{"segment_id":1,"action":"explode","confidence":1.0,"reason":"x","merge_with":null}]}"#).is_err());
    assert!(parse_response("").is_err());
}

#[test]
fn extract_content_from_response_body() {
    // Arrange（共享 AiClient 的响应提取——REQ-138 抽取后同一函数）
    let body = r#"{"choices":[{"message":{"content":"{\"decisions\":[]}"}}]}"#;
    // Act
    let content = crate::ai_client::extract_content(body).unwrap();
    // Assert
    assert_eq!(content, r#"{"decisions":[]}"#);
    // 缺 content → Err
    assert!(crate::ai_client::extract_content(r#"{"choices":[{"message":{}}]}"#).is_err());
    assert!(crate::ai_client::extract_content("not json").is_err());
}

#[test]
fn env_config_defaults_and_enable_sequential() {
    // Arrange：清空相关环境变量（防宿主机泄漏/并行测试竞争影响断言——
    // 本测试顺序执行 defaults→enabled 两态，末尾清理）
    let keys = [
        "SILICONFLOW_API_KEY",
        "SILICONFLOW_BASE_URL",
        "AI_TEXT_FILTER_MODEL",
        "AI_TEXT_FILTER_ENABLED",
        "AI_TEXT_FILTER_TIMEOUT_SECS",
        "AI_TEXT_FILTER_RETRIES",
        "AI_TEXT_FILTER_BATCH",
    ];
    let saved: Vec<(String, Option<String>)> =
        keys.iter().map(|k| (k.to_string(), std::env::var(k).ok())).collect();
    for k in &keys {
        std::env::remove_var(k);
    }
    // Act ①：无环境变量 → 默认值
    let cfg = AiTextFilterConfig::from_env();
    // Assert ①：授权默认关（密钥空 → enabled=false）；默认端点/模型/批量
    assert!(!cfg.enabled, "授权默认关——AI 调用须显式开启");
    assert!(cfg.api_key.is_empty());
    assert!(cfg.base_url.contains("siliconflow"));
    assert_eq!(cfg.model, DEFAULT_MODEL);
    assert_eq!(cfg.batch_size, 30);
    assert_eq!(cfg.timeout_secs, 60);
    // Act ②：显式注入（模拟用户授权开启 + 模型切换）
    std::env::set_var("SILICONFLOW_API_KEY", "sk-test");
    std::env::set_var("AI_TEXT_FILTER_ENABLED", "1");
    std::env::set_var("AI_TEXT_FILTER_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507");
    let cfg = AiTextFilterConfig::from_env();
    // Assert ②：开关/密钥/模型生效
    assert!(cfg.enabled);
    assert_eq!(cfg.api_key, "sk-test");
    assert_eq!(cfg.model, "Qwen/Qwen3-30B-A3B-Instruct-2507");
    // 清理（还原宿主环境，防污染其他测试）
    for (k, v) in saved {
        match v {
            Some(val) => std::env::set_var(k, val),
            None => std::env::remove_var(k),
        }
    }
}

#[test]
fn review_empty_request_ok() {
    // Act：空请求直接返回空判定（不发网络）
    let resp = AiTextFilterAdapter::new(config()).review(&TextFilterRequest { segments: vec![] }).unwrap();
    // Assert
    assert!(resp.decisions.is_empty());
}
