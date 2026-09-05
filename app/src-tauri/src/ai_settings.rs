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

use crate::ai_strategy::RefineStrategyPrefs;

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
    /// 精修时启用画面理解（v0.12.0 M5）：开启后 AI 精修请求附带屏卡图
    /// （content 数组多模态，deepseek-v4-flash-vision-exp 视觉提取画面要点）。
    /// 图片上传最敏感——独立闸门；默认关（关闭则精修纯文本，现有行为零变化）。
    /// 仅视频会话生效；图文会话 OCR 已足够，不触发 vision。
    pub vision_refine_enabled: bool,
    /// 精修产出策略偏好（v0.17.0 REQ-245）：默认档位 + 逐维覆盖——
    /// 全局默认（任务级覆盖优先）；serde default：旧 JSON 零迁移回填标准档
    pub refine_strategy: RefineStrategyPrefs,
    /// v0.18.2（REQ-254）：目标 AI（规划师）独立闸门——内容门控之外的
    /// 专用开关，默认关（与全局 enabled 独立：目标规划是上传类调用，
    /// 双闸门 = content_gate + 本开关）。
    pub goal_plan_enabled: bool,
    /// v0.18.2（REQ-254）：目标规划预算档位（light/standard/deep；默认标准）。
    pub goal_plan_tier: String,
    /// v0.19.1（REQ-260）：学习库问答生成独立闸门——命中片段列表恒可用
    /// （本地零成本零上传），生成=最小片段上云 → content_gate + 本开关双闸门，
    /// 默认关（ADR-029 决策 4/治理 §9）。
    pub kb_qa_enabled: bool,
    /// v0.19.1（REQ-260）：学习库问答片段预算档位（light/standard/deep；
    /// 默认 standard——budget_allocator 档位硬顶复用）。
    pub kb_qa_tier: String,
    /// v0.20.2（REQ-270）：可选 LLM 文本校对独立闸门——content_gate 之外的
    /// 专用开关（默认关）；仅文本上云，语音不出本机红线（建议制·人类裁决）。
    pub proofread_enabled: bool,
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
            vision_refine_enabled: false,
            refine_strategy: RefineStrategyPrefs::default(),
            goal_plan_enabled: false,
            goal_plan_tier: "standard".to_string(),
            kb_qa_enabled: false,
            kb_qa_tier: "standard".to_string(),
            proofread_enabled: false,
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
    ///              任何 AI 调用不可达）。由 M2 精修 / M3 补充命令消费。
    pub fn content_gate(&self) -> Result<(), String> {
        if !self.enabled {
            return Err("AI 功能未开启（设置页全局开关默认关闭）".to_string());
        }
        if !self.authorized {
            return Err("尚未同意 AI 使用授权（仅上传文本，音视频/图像永不出本机）".to_string());
        }
        Ok(())
    }

    /// 目标规划双闸门（v0.18.2 REQ-254）：content_gate + 目标 AI 专用开关。
    ///
    /// @ai-context: 目标规划=内容上传类调用（最小检索片段上云），在全局
    ///              授权红线之上再设独立开关（默认关）——"本地优先 + 用户
    ///              知情"；失败文案引导设置页「目标 AI」区，不静默。
    pub fn goal_plan_gate(&self) -> Result<(), String> {
        self.content_gate()?;
        if !self.goal_plan_enabled {
            return Err("目标 AI 规划未开启（设置→目标 AI 段打开开关；关闭时按规则草案正常规划，零影响）".to_string());
        }
        Ok(())
    }

    /// 学习库问答生成双闸门（v0.19.1 REQ-260）：content_gate + kb_qa 开关。
    ///
    /// @ai-context: 学习库问答检索在本地完成（命中列表恒可用——不受本闸门
    ///              约束）；生成才上传**最小命中片段** → 在授权红线之上再设
    ///              独立开关（默认关）。失败文案引导设置页「学习库」段。
    pub fn kb_qa_gate(&self) -> Result<(), String> {
        self.content_gate()?;
        if !self.kb_qa_enabled {
            return Err("学习库问答生成未开启（设置→AI 服务→学习库段打开开关；关闭时命中片段列表照常可用，零影响）".to_string());
        }
        Ok(())
    }

    /// 文本校对双闸门（v0.20.2 REQ-270）：content_gate + proofread 开关。
    ///
    /// @ai-context: 校对=逐句文本上云（语音/画面永不出本机）——在授权红线之上
    ///              再设独立开关（默认关）；每次运行仍需命令层 authorized 确认。
    ///              失败文案引导设置页「AI 服务」段开关，不静默。
    pub fn proofread_gate(&self) -> Result<(), String> {
        self.content_gate()?;
        if !self.proofread_enabled {
            return Err("文本校对未开启（设置→AI 服务→文本校对段打开开关；关闭时转写零影响）".to_string());
        }
        Ok(())
    }

    /// 非内容类 AI 调用门控（余额查询/测试连接：仅要求开关开启——避免关闭
    /// 状态下误以为功能可用；测试连接为配置验证操作不 gate，见 command 层）。
    /// 当前无消费方（预留——若未来余额查询/测试连接要求开启开关时启用），
    /// 登记豁免 dead_code（与 ai_guardrails V1.0 预留同模式）。
    #[allow(dead_code)]
    pub fn enabled_gate(&self) -> Result<(), String> {
        if !self.enabled {
            return Err("AI 功能未开启（设置页全局开关默认关闭）".to_string());
        }
        Ok(())
    }
}

/// 任务级画面理解解析（REQ-284，v0.19.7）：本次覆写优先，缺省跟随全局——
/// 覆写不写回全局（单向同步；"设为默认"由命令层显式调 ai_set_vision_refine）。
pub fn resolve_vision_refine(task_override: Option<bool>, global_enabled: bool) -> bool {
    task_override.unwrap_or(global_enabled)
}

#[cfg(test)]
mod resolve_tests {
    use super::resolve_vision_refine;

    #[test]
    fn override_wins_when_present() {
        assert!(resolve_vision_refine(Some(true), false), "本次开覆盖全局关");
        assert!(!resolve_vision_refine(Some(false), true), "本次关覆盖全局开");
    }

    #[test]
    fn missing_override_follows_global() {
        assert!(resolve_vision_refine(None, true));
        assert!(!resolve_vision_refine(None, false));
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_settings_tests.rs"]
mod tests;
