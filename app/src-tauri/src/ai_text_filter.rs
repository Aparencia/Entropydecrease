//! AI 文本复核适配器（REQ-085 / v0.6.0 M1）。
//!
//! @ai-context: 规则层判不了的边界段 → 云端付费模型三态判定（keep/delete/merge）。
//!              默认档 SiliconFlow OpenAI 兼容端点；模型名/端点/密钥全部
//!              环境变量注入（AGENTS.md 环境隔离铁律），模型切换零代码改动。
//! @ai-context: 默认模型 deepseek-ai/DeepSeek-R1-0528-Qwen3-8B（2026-08 实测
//!              选型：¥0/M 免费 + MIT 许可商用）；R1 系推理模型带 no_think
//!              参数关闭思考标签（保 JSON 输出稳定）。
//! @ai-context: 防御链：temperature=0 + response_format=json_object；超时 +
//!              指数退避重试（429/5xx/传输错误）；非法响应 parse 失败 →
//!              Err → 调用方回退纯规则结果原样输出（不丢不假，本地优先铁律）。
//! @ai-context: 提示词模板 prompts/text_filter.json 编译期捆绑（include_str），
//!              可校准（改文件重建即生效）；纯 payload/解析函数可单测，
//!              网络路径不单测（与 model_downloader 同口径）。

use serde::{Deserialize, Serialize};

use crate::ai_protocol::{TextFilterRequest, TextFilterResponse};

/// 默认端点（SiliconFlow OpenAI 兼容；环境变量可覆盖）。
const DEFAULT_BASE_URL: &str = "https://api.siliconflow.cn/v1";
/// 默认模型（2026-08 选型：免费 + MIT 商用；备选 Qwen3-30B-A3B/GLM-4-32B 走配置切换）。
const DEFAULT_MODEL: &str = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B";

/// 适配器配置（环境变量注入；from_env 聚合，测试直接构造）。
#[derive(Debug, Clone, PartialEq)]
pub struct AiTextFilterConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    /// 全局开关（AI_TEXT_FILTER_ENABLED=1/true 且密钥非空；默认关——授权红线）
    pub enabled: bool,
    /// 单请求超时（秒）
    pub timeout_secs: u64,
    /// 重试次数（429/5xx/传输错误；指数退避）
    pub max_retries: u32,
    /// 输出 token 上限（2026-08-21 真机排查：缺省时 DeepSeek 8192 硬切
    /// JSON 截断——与共享 client 同默认；AI_TEXT_FILTER_MAX_TOKENS 覆盖）
    pub max_tokens: u32,
    /// 批量上限（段/请求；超量分批）
    pub batch_size: usize,
    pub prompt: TextFilterPrompt,
}

/// 提示词模板（prompts/text_filter.json 结构）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextFilterPrompt {
    pub version: u32,
    pub system: String,
    pub rules: Vec<PromptRule>,
    pub few_shot: Vec<PromptExample>,
    pub output_format: String,
}

/// 单条判定标准。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PromptRule {
    pub name: String,
    pub description: String,
}

/// few-shot 样本（输入 → 期望输出 JSON 字符串）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PromptExample {
    pub input: String,
    pub output: String,
}

impl TextFilterPrompt {
    /// 编译期捆绑模板（改 prompts/text_filter.json 重建即生效）。
    ///
    /// @ai-context: 解析失败视为开发期错误——回退内置最小提示词（保可用不崩）。
    pub fn bundled() -> Self {
        let raw = include_str!("../prompts/text_filter.json");
        serde_json::from_str(raw).unwrap_or_else(|e| {
            eprintln!("[TextFilter] 提示词模板解析失败，使用内置兜底: {}", e);
            Self::fallback()
        })
    }

    /// 内置最小提示词（模板损坏时的兜底；不阻断复核功能）。
    fn fallback() -> Self {
        Self {
            version: 1,
            system: "你是课堂笔记文本复核助手。保守原则：不确定就 keep（confidence≤0.6）。\
                     技术术语/数字/专名即使片段也保留。只判定，不改写。"
                .to_string(),
            rules: vec![
                PromptRule {
                    name: "口头禅".into(),
                    description: "整段填充词无信息 → delete".into(),
                },
                PromptRule {
                    name: "截断半句".into(),
                    description: "与相邻段拼接才完整 → merge(prev|next)；否则 delete".into(),
                },
            ],
            few_shot: vec![],
            output_format: "只输出 JSON：{\"decisions\":[{\"segment_id\":..,\"action\":\"keep|delete|merge\",\"confidence\":..,\"reason\":\"..\",\"merge_with\":\"prev|next|null\"}]}"
                .to_string(),
        }
    }
}

impl AiTextFilterConfig {
    /// 从环境变量聚合（全部可注入；缺省走默认值，授权默认关）。
    pub fn from_env() -> Self {
        let api_key = std::env::var("SILICONFLOW_API_KEY").unwrap_or_default();
        let enabled = !api_key.is_empty()
            && matches!(
                std::env::var("AI_TEXT_FILTER_ENABLED").as_deref(),
                Ok("1") | Ok("true") | Ok("TRUE")
            );
        Self {
            base_url: std::env::var("SILICONFLOW_BASE_URL")
                .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string()),
            api_key,
            model: std::env::var("AI_TEXT_FILTER_MODEL")
                .unwrap_or_else(|_| DEFAULT_MODEL.to_string()),
            enabled,
            timeout_secs: env_parse("AI_TEXT_FILTER_TIMEOUT_SECS", 60),
            max_retries: env_parse("AI_TEXT_FILTER_RETRIES", 2) as u32,
            max_tokens: env_parse(
                "AI_TEXT_FILTER_MAX_TOKENS",
                crate::ai_client::DEFAULT_MAX_TOKENS as u64,
            ) as u32,
            batch_size: (env_parse("AI_TEXT_FILTER_BATCH", 30) as usize).clamp(1, 100),
            prompt: TextFilterPrompt::bundled(),
        }
    }
}

/// 环境变量数字解析（缺省/非法 → 默认值）。
fn env_parse(key: &str, default: u64) -> u64 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

/// 适配器（默认 SiliconFlow；mock 走 AiMockAdapter::review_text，本类只管云端）。
#[derive(Debug, Clone)]
pub struct AiTextFilterAdapter {
    pub config: AiTextFilterConfig,
}

impl AiTextFilterAdapter {
    pub fn new(config: AiTextFilterConfig) -> Self {
        Self { config }
    }

    /// 批量三态判定（阻塞调用——command 层 spawn_blocking 包裹）。
    ///
    /// @ai-context: 重试/超时/错误归一（401/402/403/429/5xx/传输）走共享
    ///              AiClient（v0.8.0 M1 REQ-138 抽取——ai_text_filter 与
    ///              ai_note_refine/ai_enrich 共用同一 client 模板）；响应先
    ///              结构解析再返回（request_ids 级强校验由 command 层做——
    ///              本层无 ids 上下文）。
    pub fn review(&self, request: &TextFilterRequest) -> Result<TextFilterResponse, String> {
        if request.segments.is_empty() {
            return Ok(TextFilterResponse { decisions: Vec::new() });
        }
        let system = build_system_prompt(&self.config.prompt);
        let user = serde_json::to_string(&request.segments).unwrap_or_else(|_| "[]".to_string());
        let client = crate::ai_client::AiClient::new(crate::ai_client::AiClientConfig {
            base_url: self.config.base_url.clone(),
            api_key: self.config.api_key.clone(),
            model: self.config.model.clone(),
            timeout_secs: self.config.timeout_secs,
            max_retries: self.config.max_retries,
            // 2026-08-21 真机排查：显式输出上限（缺省时 DeepSeek 8192 token
            // 硬切 JSON 截断）——与共享 client 同默认，env 可覆盖
            max_tokens: self.config.max_tokens,
            is_local: false,
        });
        let raw = client
            .chat_text(&system, &user)
            .map_err(|e| format!("AI 复核失败（回退纯规则）: {}", e))?;
        parse_response(&raw)
    }
}

/// 组装 system 提示词（模板 system + 规则 + few-shot + 输出约束）。
pub fn build_system_prompt(prompt: &TextFilterPrompt) -> String {
    let mut s = prompt.system.clone();
    for rule in &prompt.rules {
        s.push_str(&format!("\n- [{}] {}", rule.name, rule.description));
    }
    for ex in &prompt.few_shot {
        s.push_str(&format!("\n示例输入: {}\n示例输出: {}", ex.input, ex.output));
    }
    s.push_str(&format!("\n{}", prompt.output_format));
    s
}

/// 解析模型输出 → 结构化判定（剥代码块围栏；强校验在 command 层带 ids 做）。
///
/// @ai-context: chat/completions 传输/提取走共享 AiClient::chat_text
///              （REQ-138 抽取），本函数只做 TextFilterResponse 类型级解析。
pub fn parse_response(raw: &str) -> Result<TextFilterResponse, String> {
    let trimmed = raw.trim();
    // 剥 ```json ... ``` / ``` ... ``` 围栏（推理模型偶发包裹）
    let stripped = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.strip_suffix("```").unwrap_or(s))
        .unwrap_or(trimmed)
        .trim();
    serde_json::from_str(stripped).map_err(|e| format!("判定 JSON 解析失败: {}", e))
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_text_filter_tests.rs"]
mod tests;
