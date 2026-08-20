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
//!              网络调用不持全局锁——防 60s 超时阻塞其他 AI 命令）。
//! @ai-context: 网络路径不单测（与 model_downloader 同口径）；payload 构建/
//!              响应提取/JSON 解析为纯函数可单测。

use crate::ai_settings::AiSettings;

/// 单请求超时默认（秒；env SILICONFLOW_TIMEOUT_SECS 可覆盖）。
pub const DEFAULT_TIMEOUT_SECS: u64 = 60;
/// 重试次数默认（429/5xx/传输错误；env SILICONFLOW_RETRIES 可覆盖）。
pub const DEFAULT_MAX_RETRIES: u32 = 2;

/// 共享 client 配置（resolve 聚合：环境变量 > 设置 > 内置默认）。
#[derive(Debug, Clone, PartialEq)]
pub struct AiClientConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub timeout_secs: u64,
    pub max_retries: u32,
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
        })
    }

    pub fn new(config: AiClientConfig) -> Self {
        Self { config }
    }

    /// chat/completions 请求 → 原始 assistant 文本（未 parse；各适配器自行解析）。
    ///
    /// @ai-context: 供需要类型级解析的适配器使用（ai_text_filter 的
    ///              parse_response 做 TextFilterResponse 反序列化）；
    ///              chat_json = chat_text + parse_json_object 的组合。
    pub fn chat_text(&self, system: &str, user: &str) -> Result<String, AiClientError> {
        if self.config.api_key.trim().is_empty() {
            return Err(AiClientError::Auth("未配置 API 密钥（设置页保存或配置环境变量）".to_string()));
        }
        let payload = build_chat_payload(&self.config.model, system, user);
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
                Err(ureq::Error::Status(401 | 403, _)) => {
                    return Err(AiClientError::Auth("API 密钥无效或无权限（请检查设置页密钥）".to_string()));
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

/// 构建 chat/completions payload（纯函数可单测；temperature=0 + json_object）。
///
/// @ai-context: R1 系推理模型带 no_think=true 关闭思考标签（保 JSON 输出
///              稳定——2026-08 实测选型注意点，与 ai_text_filter 同款）。
pub fn build_chat_payload(model: &str, system: &str, user: &str) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        "temperature": 0,
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

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_client_tests.rs"]
mod tests;
