//! AI Provider 配置（v0.11.6 M1，多 AI 能力接入基础层）。
//!
//! @ai-context: BYOK 多 Provider：用户自带 Key 配置多个 OpenAI 兼容端点
//!              （SiliconFlow/DeepSeek/OpenRouter/Ollama 本地），任务按默认
//!              Provider + 降级链执行；充值远期留桩（命令空间 ai_quota_*
//!              隔离，本层不带计费语义）。
//! @ai-context: 存储 ai_providers.json（数据目录）；沿用 ai_settings.json 的
//!              "缺失/损坏回退内置默认"加载模式；密钥不在此层（DPAPI
//!              per-provider，ai_credentials.rs）。
//! @ai-context: 旧版（v0.11.5 及之前）单 Provider 配置（ai_settings.json 的
//!              base_url/model + 单密钥）首启自动迁移为 SiliconFlow Provider
//!              ——用户无感，4 处 AiClient::from_settings 调用点零改动。

use serde::{Deserialize, Serialize};

/// Provider 类型（OpenAI 兼容协议覆盖绝大多数云端 + Ollama 本地）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    /// OpenAI 兼容端点（SiliconFlow/DeepSeek/OpenRouter/智谱/自定义…）
    OpenAiCompat,
    /// Ollama 本地推理（OpenAI 兼容端点 /v1/chat/completions——无网降级路径）
    Ollama,
}

/// 单个 Provider 配置。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiProviderConfig {
    /// 唯一 id（生成时 uuid/slug；迁移时固定 "legacy-siliconflow"）
    pub id: String,
    /// 显示名（"SiliconFlow"）
    pub name: String,
    pub kind: ProviderKind,
    /// OpenAI 兼容 base_url（Ollama 为 http://127.0.0.1:11434/v1）
    pub base_url: String,
    /// 可用模型列表（设置页选择用）
    pub models: Vec<String>,
    /// 该 Provider 默认模型
    pub default_model: String,
    pub enabled: bool,
    /// 降级链（本 Provider 失败后依次尝试的 Provider id）
    pub fallback_order: Vec<String>,
}

impl Default for AiProviderConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            kind: ProviderKind::OpenAiCompat,
            base_url: String::new(),
            models: Vec::new(),
            default_model: String::new(),
            enabled: true,
            fallback_order: Vec::new(),
        }
    }
}

impl AiProviderConfig {
    /// 配置校验（纯函数）：id/name 非空、base_url http(s)、模型列表与默认模型非空。
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("Provider id 不能为空".to_string());
        }
        if self.name.trim().is_empty() {
            return Err("Provider 名称不能为空".to_string());
        }
        if !(self.base_url.starts_with("http://") || self.base_url.starts_with("https://")) {
            return Err("端点必须是 http(s):// 开头的合法 URL".to_string());
        }
        if self.models.is_empty() {
            return Err("模型列表不能为空".to_string());
        }
        if self.default_model.trim().is_empty() {
            return Err("默认模型不能为空".to_string());
        }
        if !self.models.iter().any(|m| m == &self.default_model) {
            return Err("默认模型不在模型列表中".to_string());
        }
        Ok(())
    }
}

/// Provider 存储（内存态单点；持久化 ai_providers.json——同 ai_settings 模式）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiProviderStore {
    pub providers: Vec<AiProviderConfig>,
    /// 默认 Provider id（任务无显式指定时使用）
    pub default_provider_id: Option<String>,
}

impl AiProviderStore {
    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("ai_providers.json 解析失败: {}", e))
    }

    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string_pretty(self).map_err(|e| format!("ai_providers.json 序列化失败: {}", e))
    }

    /// 从数据目录加载（缺失/损坏 → 内置默认——不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => Self::from_json(&raw).unwrap_or_else(|e| {
                eprintln!("[AiProvider] 配置加载失败，使用内置默认: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, path: &std::path::Path) -> Result<(), String> {
        let raw = self.to_json()?;
        std::fs::write(path, raw).map_err(|e| format!("ai_providers.json 写入失败: {}", e))
    }

    /// 生效默认 Provider id：显式配置 > 第一个 enabled（幽灵 id 回退）。
    pub fn effective_default_id(&self) -> Option<String> {
        if let Some(id) = &self.default_provider_id {
            if self.providers.iter().any(|p| &p.id == id && p.enabled) {
                return Some(id.clone());
            }
        }
        self.providers.iter().find(|p| p.enabled).map(|p| p.id.clone())
    }

    pub fn get(&self, id: &str) -> Option<&AiProviderConfig> {
        self.providers.iter().find(|p| p.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut AiProviderConfig> {
        self.providers.iter_mut().find(|p| p.id == id)
    }
}

/// 内置预设模板（编译期捆绑；用户"添加 Provider"时从模板起步可自定义）。
pub fn preset_templates() -> Vec<AiProviderConfig> {
    let mk = |id: &str, name: &str, base_url: &str, models: &[&str], default: &str| AiProviderConfig {
        id: id.to_string(),
        name: name.to_string(),
        kind: ProviderKind::OpenAiCompat,
        base_url: base_url.to_string(),
        models: models.iter().map(|s| s.to_string()).collect(),
        default_model: default.to_string(),
        enabled: true,
        fallback_order: Vec::new(),
    };
    vec![
        mk(
            "siliconflow",
            "SiliconFlow",
            "https://api.siliconflow.cn/v1",
            &["deepseek-ai/DeepSeek-R1-0528-Qwen3-8B", "deepseek-ai/DeepSeek-V3.2"],
            "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
        ),
        mk(
            "deepseek",
            "DeepSeek",
            "https://api.deepseek.com/v1",
            &["deepseek-chat", "deepseek-reasoner"],
            "deepseek-chat",
        ),
        mk(
            "openrouter",
            "OpenRouter",
            "https://openrouter.ai/api/v1",
            &["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "deepseek/deepseek-chat"],
            "openai/gpt-4o-mini",
        ),
        AiProviderConfig {
            id: "ollama".to_string(),
            name: "Ollama（本地）".to_string(),
            kind: ProviderKind::Ollama,
            base_url: "http://127.0.0.1:11434/v1".to_string(),
            models: vec!["qwen2.5:7b".to_string()],
            default_model: "qwen2.5:7b".to_string(),
            enabled: false,
            fallback_order: Vec::new(),
        },
    ]
}

/// 旧配置迁移（首启）：旧 ai_settings 的 base_url/model → SiliconFlow Provider。
///
/// @ai-context: 迁移幂等——ai_providers.json 已存在时不触发（调用方判断）；
///              密钥迁移在 command 层（旧凭据条目 → provider:<id> 新条目）。
pub fn migrate_from_legacy(legacy: &crate::ai_settings::AiSettings) -> (Vec<AiProviderConfig>, Option<String>) {
    let mut p = AiProviderConfig {
        id: "legacy-siliconflow".to_string(),
        name: "SiliconFlow".to_string(),
        base_url: legacy.base_url.clone(),
        default_model: legacy.model.clone(),
        models: vec![legacy.model.clone()],
        ..Default::default()
    };
    if p.validate().is_err() {
        // 旧配置非法 → 回退预设 SiliconFlow（保可用不崩）
        p = preset_templates().remove(0);
        p.id = "legacy-siliconflow".to_string();
    }
    let default_id = p.id.clone();
    (vec![p], Some(default_id))
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_provider_tests.rs"]
mod tests;