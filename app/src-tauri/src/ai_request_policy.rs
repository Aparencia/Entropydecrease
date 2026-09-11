//! 请求级 Provider 策略（2026-09-11：DeepSeek V4.1 适配批）。
//!
//! @ai-context: 上游 2026-09-10 发布 DeepSeek-V4.1-Flash 后，三类约束从
//!              "文档约定"变成"硬失败/隐形成本"，本模块把它们收敛为纯函数，
//!              供 ai_client（非流式）与 ai_note_refine（流式）共用：
//!              ① `response_format=json_object` 要求提示词含 "json" 字样，
//!                 否则 HTTP 400 invalid_request_error——探活提示词（"只回复
//!                 两个字：正常"）正踩此坑（真机错误体见知识卡
//!                 docs/knowledge/bugs/2026-09-11-deepseek-json-object-400.md）；
//!              ② 4xx 响应体带 `error.message`（"Model Not Exist" 等），
//!                 不透出则 UI 只剩 "HTTP 400（4xx 非瞬态）"，用户无法定位；
//!              ③ V4 家族默认开启思考模式（effort=high），结构化提取任务是
//!                 严格 JSON 输出，思考既烧输出 token（真机实测 96→172 token）
//!                 又挤占 max_tokens 预算（思考吃满则 content 为空 → Parse 失败），
//!                 故结构化路径按端点收紧为 disabled；AI 对话保留 provider 默认。
//! @ai-context: 端点判定按 host 收紧到 api.deepseek.com——`thinking` 是
//!              DeepSeek 专有字段，发给严格校验的第三方兼容端点会直接 400
//!              （宁可少做不可误伤；自定义 DeepSeek 代理走 provider 默认）。
//! @ai-context: 网络路径不单测（与 model_downloader 同口径）；本模块全为纯
//!              函数/纯策略，单测覆盖见 ai_request_policy_tests.rs。

/// 思考模式策略（仅对 DeepSeek 官方端点生效）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ThinkingPolicy {
    /// 交给 provider 默认（V4 家族 = 开启，effort=high）——AI 对话路径使用
    ProviderDefault,
    /// 显式关闭（结构化 JSON 任务默认——成本/时延/输出预算可预期）
    #[default]
    Disabled,
}

/// 策略 env 覆盖键（`AI_THINKING=auto|enabled` → provider 默认；
/// `disabled`/缺省 → 关闭；非法值按缺省）。
///
/// @ai-context: AGENTS.md §3 环境隔离——质量优先的用户可 `AI_THINKING=enabled`
///              让结构化任务也走思考模式（成本与 max_tokens 占用随之上升）。
const THINKING_ENV_KEY: &str = "AI_THINKING";

impl ThinkingPolicy {
    /// 从环境变量解析（非法/缺省 → Disabled）。
    pub fn from_env() -> Self {
        match std::env::var(THINKING_ENV_KEY) {
            Ok(v) if matches!(v.trim().to_ascii_lowercase().as_str(), "auto" | "enabled" | "on" | "default") => {
                Self::ProviderDefault
            }
            _ => Self::Disabled,
        }
    }
}

/// JSON 前置条件兜底文案（提示词未含 "json" 时追加到 system）。
///
/// @ai-context: 只补一句格式要求，不改写既有提示词语义——既有模板
///              （text_filter/note_refine/note_enrich/goal_plan/proofread）
///              均已含 "只输出 JSON"，本兜底只为"未来新增提示词忘了写 json"
///              这一可预见的失误兜底（400 是硬失败，代价不对称）。
pub const JSON_PRECONDITION_HINT: &str = "\n\n输出格式要求：必须输出合法 JSON。";

/// 提示词是否缺少 json_object 前置条件（纯函数：system/user 均不含 "json"
/// 才算缺失；大小写不敏感——实测 "JSON" 同样被 DeepSeek 接受）。
pub fn json_hint_needed(system: &str, user: &str) -> bool {
    !contains_json(system) && !contains_json(user)
}

/// 大小写不敏感的 "json" 检测。
fn contains_json(text: &str) -> bool {
    text.to_ascii_lowercase().contains("json")
}

/// 从错误响应体提取可读原因（纯函数；无可用信息 → None）。
///
/// @ai-context: 识别三种常见结构：`{"error":{"message":".."}}`（DeepSeek/
///              OpenAI）、`{"error":".."}`、`{"message":".."}`；**非 JSON**
///              （网关 HTML/纯文本）回退原文（截断到 300 字符、空白压成单
///              空格）——宁可粗也不要丢，用户拿到的错误必须能直接搜。
///              合法 JSON 但无 message（`{}` 等）→ None：不把空壳当原因。
pub fn extract_api_error(body: &str) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }
    let message = match serde_json::from_str::<serde_json::Value>(trimmed) {
        Ok(v) => v["error"]["message"]
            .as_str()
            .or_else(|| v["error"].as_str())
            .or_else(|| v["message"].as_str())
            .map(|s| s.to_string())?,
        Err(_) => trimmed.to_string(),
    };
    let one_line = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.is_empty() {
        return None;
    }
    Some(clip_chars(&one_line, 300))
}

/// 截断到 max 字符（char 边界安全；超长补省略号）。
fn clip_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

/// 是否 DeepSeek 官方端点（纯函数：取 host 比对，忽略端口/路径/大小写）。
///
/// @ai-context: 只认 api.deepseek.com（含 /v1 与根路径两种写法）——DeepSeek
///              官方 base_url 为 https://api.deepseek.com，/v1 亦可用（真机
///              实测两条路径均 200）。
pub fn is_deepseek_endpoint(base_url: &str) -> bool {
    let rest = base_url
        .trim()
        .strip_prefix("https://")
        .or_else(|| base_url.trim().strip_prefix("http://"))
        .unwrap_or(base_url.trim());
    let host_port = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host_port.split('@').next_back().unwrap_or(host_port);
    let host = host.split(':').next().unwrap_or(host);
    host.eq_ignore_ascii_case("api.deepseek.com")
}

/// 把思考模式策略落到请求体（纯函数；调用方已显式设置 `thinking` 时不覆盖）。
///
/// @ai-context: 非 DeepSeek 端点或 ProviderDefault 策略 → 原样返回（零副作用）。
pub fn apply_thinking_policy(body: &mut serde_json::Value, base_url: &str, policy: ThinkingPolicy) {
    if policy != ThinkingPolicy::Disabled || !is_deepseek_endpoint(base_url) {
        return;
    }
    if let Some(obj) = body.as_object_mut() {
        if obj.contains_key("thinking") {
            return;
        }
        obj.insert(
            "thinking".to_string(),
            serde_json::json!({"type": "disabled"}),
        );
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_request_policy_tests.rs"]
mod tests;
