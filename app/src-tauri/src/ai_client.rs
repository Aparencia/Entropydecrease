//! 共享 AI client（REQ-138，v0.8.0 M1 使能层；够用抽象，非平台化）。
//!
//! @ai-context: base_url/api_key/model 配置聚合 + chat/completions 请求模板 +
//!              超时/指数退避重试 + 响应提取/JSON 解析 + 错误归一——
//!              失败原因四类（未授权/网络/余额/配额，REQ-145 任务失败映射
//!              的基础）：401/403→Auth、402→Balance、429→Quota、
//!              5xx/传输→Server/Network、解析失败→Parse。
//! @ai-context: 既有 ai_text_filter.rs（REQ-085 文本复核）与 M2/M3 新增的
//!              ai_note_refine.rs/ai_enrich.rs 共用本 client；审计/配额/缓存
//!              挂钩由 command 层完成（现有模式：锁内 read-modify-write，
//!              网络调用不持全局锁——防 300s 超时阻塞其他 AI 命令）。
//! @ai-context: 网络路径不单测（与 model_downloader 同口径）；payload 构建/
//!              响应提取/JSON 解析为纯函数可单测。
//! @ai-context: v0.11.6 M1 多 Provider 化：from_provider（BYOK Provider 直接
//!              构建）+ from_settings_with_store（默认 Provider 接管 base_url/
//!              model，无 Provider 配置回退旧字段——兼容迁移前状态）+
//!              is_fallbackable/fallback_provider_ids（降级链纯函数：
//!              Network/Server/Quota 瞬态可降级，Auth/Balance/Parse 归因
//!              用户/响应不降级；实际 fallback 调用由任务层接线）。

use crate::ai_provider::{AiProviderConfig, AiProviderStore};
use crate::ai_settings::AiSettings;

/// 单请求超时默认（秒；env SILICONFLOW_TIMEOUT_SECS 可覆盖）。
///
/// @ai-context: 300s——2026-08-21 真机排查：DeepSeek 长输出实测 20k token
///              需 ~110s，60s 默认会把长生成切断（响应体截断 → JSON 解析
///              EOF → 精修 invalid 失败），按 5 倍余量上调。
pub const DEFAULT_TIMEOUT_SECS: u64 = 300;
/// 重试次数默认（429/5xx/传输错误；env SILICONFLOW_RETRIES 可覆盖）。
pub const DEFAULT_MAX_RETRIES: u32 = 2;
/// 输出 token 上限默认（env SILICONFLOW_MAX_TOKENS 可覆盖）。
///
/// @ai-context: 20000——2026-08-21 真机排查：DeepSeek 官方不传 max_tokens 时
///              默认 8192 token 硬切（finish_reason=length，JSON 截断 →
///              Parse EOF）；精修单片 ≤8000 字输入 → 结构化输出最坏
///              ~15k token，20000 给足余量。其他提供商若拒绝超限值，
///              用 env 调小（OpenAI 兼容 clamp/报错行为不一）。
pub const DEFAULT_MAX_TOKENS: u32 = 20000;
/// max_tokens env 覆盖键。
const MAX_TOKENS_ENV: &str = "SILICONFLOW_MAX_TOKENS";

/// 共享 client 配置（resolve 聚合：环境变量 > 设置 > 内置默认）。
#[derive(Debug, Clone, PartialEq)]
pub struct AiClientConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub timeout_secs: u64,
    pub max_retries: u32,
    pub max_tokens: u32,
    /// 本地端点（Ollama 等免密钥推理；空密钥不触发 Auth 检查——本地优先叙事）
    pub is_local: bool,
}

/// 归一化 AI 错误（REQ-145 失败原因四类 + 服务端/解析补充）。
#[derive(Debug, Clone, PartialEq)]
pub enum AiClientError {
    /// 未授权/密钥无效（HTTP 401/403）
    Auth(String),
    /// 网络/传输错误
    Network(String),
    /// 余额不足（HTTP 402——SiliconFlow 余额不足语义）
    Balance(String),
    /// 配额/限流（HTTP 429——每日配额耗尽/请求过频）
    Quota(String),
    /// 服务端错误（HTTP 5xx）
    Server(String),
    /// 响应解析/结构非法
    Parse(String),
}

impl std::fmt::Display for AiClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiClientError::Auth(m) => write!(f, "未授权: {}", m),
            AiClientError::Network(m) => write!(f, "网络错误: {}", m),
            AiClientError::Balance(m) => write!(f, "余额不足: {}", m),
            AiClientError::Quota(m) => write!(f, "配额受限: {}", m),
            AiClientError::Server(m) => write!(f, "服务端错误: {}", m),
            AiClientError::Parse(m) => write!(f, "响应解析失败: {}", m),
        }
    }
}

impl AiClientError {
    /// 是否可触发 Provider 降级（Network/Server/Quota 瞬态；Auth/Balance/
    /// Parse 归因用户或响应——不降级，错误原样上抛引导）。
    pub fn is_fallbackable(&self) -> bool {
        matches!(
            self,
            AiClientError::Network(_) | AiClientError::Server(_) | AiClientError::Quota(_)
        )
    }
}

/// 共享 AI client（阻塞调用——command 层 spawn_blocking 包裹）。
#[derive(Debug, Clone)]
pub struct AiClient {
    pub config: AiClientConfig,
}

impl AiClient {
    /// 从 AI 设置 + 凭据解析（优先级：环境变量 > 设置 > 内置默认）。
    ///
    /// @ai-context: 密钥解析在 command 层完成（env SILICONFLOW_API_KEY 优先，
    ///              否则凭据库 stored_key）——本函数只聚合；base_url/model
    ///              的 env 覆盖（SILICONFLOW_BASE_URL/SILICONFLOW_MODEL）保留
    ///              开发路径（AGENTS.md 环境隔离铁律）。
    pub fn from_settings(settings: &AiSettings, stored_key: Option<String>) -> Self {
        let base_url = std::env::var("SILICONFLOW_BASE_URL")
            .unwrap_or_else(|_| settings.base_url.clone());
        let model = std::env::var("SILICONFLOW_MODEL").unwrap_or_else(|_| settings.model.clone());
        let api_key = std::env::var("SILICONFLOW_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())
            .or(stored_key.filter(|k| !k.is_empty()))
            .unwrap_or_default();
        Self::new(AiClientConfig {
            base_url,
            api_key,
            model,
            timeout_secs: env_parse("SILICONFLOW_TIMEOUT_SECS", DEFAULT_TIMEOUT_SECS),
            max_retries: env_parse("SILICONFLOW_RETRIES", DEFAULT_MAX_RETRIES as u64) as u32,
            max_tokens: env_parse(MAX_TOKENS_ENV, DEFAULT_MAX_TOKENS as u64) as u32,
            is_local: false,
        })
    }

    pub fn new(config: AiClientConfig) -> Self {
        Self { config }
    }

    /// 从 Provider 配置构建（M1：BYOK 多 Provider 入口；密钥由 command 层
    /// 按 scope 解析注入——env 优先，否则 per-provider 凭据）。
    pub fn from_provider(provider: &AiProviderConfig, api_key: Option<String>) -> Self {
        Self::new(AiClientConfig {
            base_url: provider.base_url.clone(),
            api_key: api_key.unwrap_or_default(),
            model: provider.default_model.clone(),
            timeout_secs: env_parse("SILICONFLOW_TIMEOUT_SECS", DEFAULT_TIMEOUT_SECS),
            max_retries: env_parse("SILICONFLOW_RETRIES", DEFAULT_MAX_RETRIES as u64) as u32,
            max_tokens: env_parse(MAX_TOKENS_ENV, DEFAULT_MAX_TOKENS as u64) as u32,
            // Why: Ollama 本地端点无需密钥；空密钥不触发 Auth 检查——本地优先叙事
            is_local: provider.kind == crate::ai_provider::ProviderKind::Ollama,
        })
    }

    /// 旧入口升级：从设置 + Provider 存储解析（默认 Provider 接管
    /// base_url/model；无 Provider 配置时回退旧字段——兼容迁移前状态）。
    pub fn from_settings_with_store(
        settings: &AiSettings,
        stored_key: Option<String>,
        store: &AiProviderStore,
    ) -> Self {
        if let Some(id) = store.effective_default_id() {
            if let Some(p) = store.get(&id) {
                return Self::from_provider(p, stored_key);
            }
        }
        Self::from_settings(settings, stored_key)
    }

    /// chat/completions 请求 → 原始 assistant 文本（未 parse；各适配器自行解析）。
    ///
    /// @ai-context: 供需要类型级解析的适配器使用（ai_text_filter 的
    ///              parse_response 做 TextFilterResponse 反序列化）；
    ///              chat_json = chat_text + parse_json_object 的组合。
    pub fn chat_text(&self, system: &str, user: &str) -> Result<String, AiClientError> {
        if !self.config.is_local && self.config.api_key.trim().is_empty() {
            return Err(AiClientError::Auth("未配置 API 密钥（设置页保存或配置环境变量）".to_string()));
        }
        let payload = build_chat_payload(&self.config.model, system, user, self.config.max_tokens);
        let url = chat_completions_url(&self.config.base_url);
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(self.config.timeout_secs.max(5)))
            .build();
        let mut last_err = AiClientError::Network("未发起请求".to_string());
        for attempt in 0..=self.config.max_retries {
            if attempt > 0 {
                let backoff = (500u64 << attempt.min(4)).min(8000);
                std::thread::sleep(std::time::Duration::from_millis(backoff));
            }
            let resp = agent
                .post(&url)
                .set("Content-Type", "application/json")
                .set("Authorization", &format!("Bearer {}", self.config.api_key.trim()))
                .send_json(payload.clone());
            match resp {
                Ok(resp) => {
                    let body = resp
                        .into_string()
                        .map_err(|e| AiClientError::Network(format!("读取响应失败: {}", e)))?;
                    return extract_content(&body);
                }
                // 401/403 拆分（2026-08-21 真机 unauthorized 排查）：401=密钥
                // 无效（换密钥），403=账号无权限/模型未开通（换模型或开权限）——
                // 合并时用户无法区分该修密钥还是该换模型
                Err(ureq::Error::Status(401, _)) => {
                    return Err(AiClientError::Auth(
                        "API 密钥无效（HTTP 401）——请检查设置页密钥或环境变量 SILICONFLOW_API_KEY".to_string(),
                    ));
                }
                Err(ureq::Error::Status(403, _)) => {
                    return Err(AiClientError::Auth(
                        "API 密钥无权限（HTTP 403）——账号未开通该模型或额度受限".to_string(),
                    ));
                }
                Err(ureq::Error::Status(402, _)) => {
                    return Err(AiClientError::Balance("账户余额不足（请充值或切换免费档模型）".to_string()));
                }
                Err(ureq::Error::Status(429, _)) => {
                    last_err = AiClientError::Quota("请求过频或配额耗尽（HTTP 429）".to_string());
                    if attempt == self.config.max_retries {
                        break;
                    }
                }
                Err(ureq::Error::Status(code, _)) if code >= 500 => {
                    last_err = AiClientError::Server(format!("服务端错误 HTTP {}", code));
                    if attempt == self.config.max_retries {
                        break;
                    }
                }
                Err(ureq::Error::Status(code, _)) => {
                    return Err(AiClientError::Network(format!(
                        "请求被拒绝 HTTP {}（不重试——4xx 非瞬态）",
                        code
                    )));
                }
                Err(e) => {
                    last_err = AiClientError::Network(format!("传输错误: {}", e));
                    if attempt == self.config.max_retries {
                        break;
                    }
                }
            }
        }
        Err(last_err)
    }

    /// chat/completions 请求（response_format=json_object）→ 解析后的 JSON 对象。
    ///
    /// @ai-context: 重试仅针对 429/5xx/传输错误（幂等读操作）；401/402/403
    ///              不重试直接归一错误；解析失败（非 JSON/结构非法）→ Parse。
    /// @ai-context: 由 M2 ai_note_refine / M3 ai_note_enrich 适配器消费
    ///              （chat_json = chat_text + parse_json_object 组合）。
    pub fn chat_json(&self, system: &str, user: &str) -> Result<serde_json::Value, AiClientError> {
        let raw = self.chat_text(system, user)?;
        parse_json_object(&raw)
    }
}

/// chat/completions 端点 URL（纯函数可单测：只修剪尾斜杠）。
///
/// @ai-context: 审查修复（2026-08-21）：**不得** trim "/v1"——base_url 默认含
///              /v1（OpenAI 兼容端点约定 https://api.siliconflow.cn/v1），
///              trim_end_matches("/v1") 会把 /v1 一并删掉 → 请求打到缺 /v1
///              的路径 404，测试连接/余额/复核/精修/补充全部网络调用失败。
pub fn chat_completions_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

/// 构建 chat/completions payload（纯函数可单测；temperature=0 + json_object +
/// max_tokens 显式上限）。
///
/// @ai-context: R1 系推理模型带 no_think=true 关闭思考标签（保 JSON 输出
///              稳定——2026-08 实测选型注意点，与 ai_text_filter 同款）。
/// @ai-context: max_tokens 显式传值（2026-08-21 真机排查）：DeepSeek 官方
///              缺省 8192 token 硬切 → JSON 截断；调用方经 AiClientConfig
///              注入（env SILICONFLOW_MAX_TOKENS 可覆盖）。
pub fn build_chat_payload(model: &str, system: &str, user: &str, max_tokens: u32) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"}
    });
    if model.to_lowercase().contains("r1") {
        body["no_think"] = serde_json::json!(true);
    }
    body
}

/// 从 chat/completions 响应体提取 assistant 文本（纯函数）。
pub fn extract_content(body: &str) -> Result<String, AiClientError> {
    let v: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| AiClientError::Parse(format!("响应 JSON 解析失败: {}", e)))?;
    v["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AiClientError::Parse("响应缺少 choices[0].message.content".to_string()))
}

/// 解析模型输出 → JSON 对象（剥 ```json 围栏；纯函数）。
///
/// @ai-context: 推理模型偶发用代码块包裹 JSON——先剥围栏再 parse；
///              解析失败 → Parse 错误（调用方回退本地结果，不丢不假）。
///              由 chat_json 消费（M2/M3 适配器链）。
pub fn parse_json_object(raw: &str) -> Result<serde_json::Value, AiClientError> {
    let trimmed = raw.trim();
    let stripped = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.strip_suffix("```").unwrap_or(s))
        .unwrap_or(trimmed)
        .trim();
    serde_json::from_str(stripped).map_err(|e| AiClientError::Parse(format!("JSON 解析失败: {}", e)))
}

/// 环境变量数字解析（缺省/非法 → 默认值）。
fn env_parse(key: &str, default: u64) -> u64 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

/// 降级链 Provider id 序列（纯函数）：默认 Provider + 其 fallback_order 中
/// 存在且启用的 id（去重；M1 简单版：只解析顺序，实际 fallback 调用由
/// 任务层接线——最多 fallback 一次）。
pub fn fallback_provider_ids(store: &AiProviderStore, primary: &AiProviderConfig) -> Vec<String> {
    let mut ids = vec![primary.id.clone()];
    for id in &primary.fallback_order {
        if id != &primary.id
            && store.get(id).map(|p| p.enabled).unwrap_or(false)
            && !ids.contains(id)
        {
            ids.push(id.clone());
        }
    }
    ids
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_client_tests.rs"]
mod tests;
