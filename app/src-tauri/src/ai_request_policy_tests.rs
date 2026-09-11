//! ai_request_policy.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖 DeepSeek V4.1 适配批的三个纯函数面：JSON 前置条件判定、
//!              错误体提取（含真机抓到的 400 原文）、端点判定（防前缀混淆的
//!              域名伪装）、思考模式策略落体（不误伤第三方端点）。

use crate::ai_request_policy::*;

// ────────────────────────────────────────────────────────────
// JSON 前置条件
// ────────────────────────────────────────────────────────────

#[test]
fn json_hint_needed_when_neither_side_mentions_json() {
    // Arrange：探活提示词（真机 400 触发点）
    let system = "你是连通性测试助手。";
    let user = "只回复两个字：正常";
    // Act & Assert
    assert!(json_hint_needed(system, user));
}

#[test]
fn json_hint_not_needed_when_prompt_mentions_json() {
    assert!(!json_hint_needed("只输出 JSON：{\"a\":1}", "文本"));
    assert!(!json_hint_needed("你是助手。", "以 json 数组回答"));
    // 大小写不敏感（真机实测 "JSON" 同样满足 DeepSeek 前置条件）
    assert!(!json_hint_needed("输出 JSON", "x"));
    assert!(!json_hint_needed("输出 Json", "x"));
}

// ────────────────────────────────────────────────────────────
// 错误体提取
// ────────────────────────────────────────────────────────────

/// 真机 400 原文（2026-09-11 探针抓取：response_format 缺 json 字样）。
#[test]
fn extract_api_error_reads_deepseek_invalid_request() {
    let body = r#"{"error":{"message":"Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}"#;
    // Act
    let msg = extract_api_error(body).expect("必须提取到 error.message");
    // Assert
    assert!(msg.starts_with("Prompt must contain the word 'json'"));
    assert!(!msg.contains("invalid_request_error"), "只取 message，不塞整包 JSON");
}

#[test]
fn extract_api_error_handles_alt_shapes_and_raw_body() {
    // error 为字符串
    assert_eq!(
        extract_api_error(r#"{"error":"Model Not Exist"}"#).as_deref(),
        Some("Model Not Exist")
    );
    // 仅 message
    assert_eq!(
        extract_api_error(r#"{"message":"rate limited"}"#).as_deref(),
        Some("rate limited")
    );
    // 非 JSON 原文（网关 HTML/纯文本）——回退原文且压空白
    assert_eq!(
        extract_api_error("  <html>\n  502 Bad Gateway  </html> ").as_deref(),
        Some("<html> 502 Bad Gateway </html>")
    );
    // 空体 / 空 JSON 对象 → None（不产出空文案）
    assert_eq!(extract_api_error(""), None);
    assert_eq!(extract_api_error("   "), None);
    assert_eq!(extract_api_error("{}"), None);
}

#[test]
fn extract_api_error_clips_long_body_on_char_boundary() {
    // Arrange：超长中文体（char 边界敏感——按字节切会 panic）
    let body = "错".repeat(500);
    // Act
    let msg = extract_api_error(&body).unwrap();
    // Assert：300 字符 + 省略号
    assert_eq!(msg.chars().count(), 301);
    assert!(msg.ends_with('…'));
}

// ────────────────────────────────────────────────────────────
// 端点判定
// ────────────────────────────────────────────────────────────

#[test]
fn is_deepseek_endpoint_accepts_official_forms() {
    assert!(is_deepseek_endpoint("https://api.deepseek.com/v1"));
    assert!(is_deepseek_endpoint("https://api.deepseek.com"));
    assert!(is_deepseek_endpoint("https://api.deepseek.com/v1/"));
    assert!(is_deepseek_endpoint("http://API.DeepSeek.com:443/v1"));
    assert!(is_deepseek_endpoint("  https://api.deepseek.com/v1  "));
}

/// 防域名伪装：前缀/后缀相似域名不得命中（策略字段只发给官方端点）。
#[test]
fn is_deepseek_endpoint_rejects_lookalikes_and_others() {
    assert!(!is_deepseek_endpoint("https://api.deepseek.com.evil.com/v1"));
    assert!(!is_deepseek_endpoint("https://notapi.deepseek.com/v1"));
    assert!(!is_deepseek_endpoint("https://api.deepseek.cn/v1"));
    assert!(!is_deepseek_endpoint("https://api.siliconflow.cn/v1"));
    assert!(!is_deepseek_endpoint("https://openrouter.ai/api/v1"));
    assert!(!is_deepseek_endpoint("http://127.0.0.1:11434/v1"));
    assert!(!is_deepseek_endpoint(""));
}

// ────────────────────────────────────────────────────────────
// 思考模式策略
// ────────────────────────────────────────────────────────────

#[test]
fn thinking_disabled_applied_on_official_endpoint() {
    // Arrange
    let mut body = serde_json::json!({"model": "deepseek-flash"});
    // Act
    apply_thinking_policy(&mut body, "https://api.deepseek.com/v1", ThinkingPolicy::Disabled);
    // Assert
    assert_eq!(body["thinking"]["type"], "disabled");
}

#[test]
fn thinking_policy_leaves_other_cases_untouched() {
    // ProviderDefault：交回 provider（AI 对话路径——保留推理能力）
    let mut chat = serde_json::json!({"model": "deepseek-flash"});
    apply_thinking_policy(&mut chat, "https://api.deepseek.com/v1", ThinkingPolicy::ProviderDefault);
    assert!(chat.get("thinking").is_none());

    // 第三方端点：绝不注入 DeepSeek 专有字段
    let mut third = serde_json::json!({"model": "deepseek-ai/DeepSeek-V3.2"});
    apply_thinking_policy(&mut third, "https://api.siliconflow.cn/v1", ThinkingPolicy::Disabled);
    assert!(third.get("thinking").is_none());

    // 调用方已显式设置 → 不覆盖（尊重上层意志）
    let mut explicit = serde_json::json!({"thinking": {"type": "enabled"}});
    apply_thinking_policy(&mut explicit, "https://api.deepseek.com/v1", ThinkingPolicy::Disabled);
    assert_eq!(explicit["thinking"]["type"], "enabled");
}

#[test]
fn thinking_policy_default_is_disabled() {
    // 结构化任务默认关闭（成本/输出预算可预期）；env 覆盖走 AI_THINKING
    assert_eq!(ThinkingPolicy::default(), ThinkingPolicy::Disabled);
    assert_ne!(ThinkingPolicy::default(), ThinkingPolicy::ProviderDefault);
}
