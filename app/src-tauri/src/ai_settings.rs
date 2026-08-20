//! AI 全局设置（REQ-138/140，v0.8.0 M1 使能层）。
//!
//! @ai-context: 授权红线（AGENTS.md §4：AI 调用须用户授权且默认关闭）——
//!              全局开关默认关；内容上传类 AI 调用（M2 精修/M3 补充）须
//!              enabled + authorized 双条件，余额查询/测试连接仅要求密钥
//!              （配置验证类读操作，不涉及内容上传）。
//! @ai-context: 设置持久化 ai_settings.json（含授权状态/端点/模型/阈值，
//!              不含密钥——密钥走 DPAPI 凭据库 ai_credentials.rs，明文红线）。
//!              加载模式沿用 purify_config.rs 先例：缺失/损坏回退内置默认，
//!              不阻断启动；save 由 command 层锁内 read-modify-write。

use serde::{Deserialize, Serialize};

/// 默认端点（SiliconFlow OpenAI 兼容；env SILICONFLOW_BASE_URL 可覆盖）。
pub const DEFAULT_AI_BASE_URL: &str = "https://api.siliconflow.cn/v1";
/// 默认模型（2026-08 选型免费档：¥0/M + MIT 商用；质量档裁决见 v0.8.0 开放问题）。
pub const DEFAULT_AI_MODEL: &str = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B";
/// 低余额提醒阈值（元；余额 < 该值提醒充值——REQ-139）。
pub const DEFAULT_LOW_BALANCE_THRESHOLD: f64 = 1.0;

/// AI 全局设置（serde default = 内置默认；JSON 只写需覆盖字段——partial 覆盖语义）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiSettings {
    /// 全局"AI 功能"开关（默认关——授权红线）
    pub enabled: bool,
    /// 用户是否已同意首次授权确认（上传内容说明：仅文本+最小上下文）
    pub authorized: bool,
    /// 端点（默认 SiliconFlow；env SILICONFLOW_BASE_URL 优先）
    pub base_url: String,
    /// 模型（默认免费档；env SILICONFLOW_MODEL 优先）
    pub model: String,
    /// 低余额提醒阈值（元）
    pub low_balance_threshold: f64,
    /// 成本确认"记住此选择"偏好（REQ-143 基础版；M2 精修消费）
    pub remember_cost_choice: bool,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            authorized: false,
            base_url: DEFAULT_AI_BASE_URL.to_string(),
            model: DEFAULT_AI_MODEL.to_string(),
            low_balance_threshold: DEFAULT_LOW_BALANCE_THRESHOLD,
            remember_cost_choice: false,
        }
    }
}

impl AiSettings {
    /// 从 JSON 构建（缺失字段 = 内置默认）。
    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("ai_settings.json 解析失败: {}", e))
    }

    /// 从数据目录 JSON 加载（缺失/损坏 → 内置默认，不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => Self::from_json(&raw).unwrap_or_else(|e| {
                eprintln!("[AiSettings] 配置加载失败，使用内置默认: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    /// 持久化（command 层锁内调用；失败显式返回——不静默丢配置）。
    pub fn save(&self, path: &std::path::Path) -> Result<(), String> {
        let raw = serde_json::to_string_pretty(self)
            .map_err(|e| format!("ai_settings.json 序列化失败: {}", e))?;
        std::fs::write(path, raw).map_err(|e| format!("ai_settings.json 写入失败: {}", e))
    }

    /// 内容上传类 AI 调用门控（enabled + authorized 双条件——授权红线）。
    ///
    /// @ai-context: 失败文案携带引导（未开启→去设置页开开关；未授权→先同意
    ///              授权说明），供前端弹引导，不静默降级（REQ-140 验收：授权前
    ///              任何 AI 调用不可达）。M1 无消费方（M2 精修/M3 补充采用），
    ///              登记豁免 dead_code（与 ai_guardrails V1.0 预留同模式）。
    #[allow(dead_code)]
    pub fn content_gate(&self) -> Result<(), String> {
        if !self.enabled {
            return Err("AI 功能未开启（设置页全局开关默认关闭）".to_string());
        }
        if !self.authorized {
            return Err("尚未同意 AI 使用授权（仅上传文本，音视频/图像永不出本机）".to_string());
        }
        Ok(())
    }

    /// 非内容类 AI 调用门控（余额查询/测试连接：仅要求开关开启——避免关闭
    /// 状态下误以为功能可用；测试连接为配置验证操作不 gate，见 command 层）。
    /// M1 无消费方（预留；与 content_gate 同登记豁免）。
    #[allow(dead_code)]
    pub fn enabled_gate(&self) -> Result<(), String> {
        if !self.enabled {
            return Err("AI 功能未开启（设置页全局开关默认关闭）".to_string());
        }
        Ok(())
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_settings_tests.rs"]
mod tests;
