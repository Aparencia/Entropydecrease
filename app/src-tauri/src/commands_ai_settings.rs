//! AI 使能层 commands（REQ-138/139/140，v0.8.0 M1）。
//!
//! @ai-context: 系统层（AGENTS.md §6）——只做参数校验、调用业务模块
//!              （ai_settings/ai_credentials/ai_balance/ai_client/
//!              ai_guardrails）、错误映射。
//! @ai-context: 密钥解析优先级：环境变量 SILICONFLOW_API_KEY > 凭据库（DPAPI）；
//!              密钥**永不回传前端**（视图只报存在性与来源——明文红线）。
//! @ai-context: 授权红线：内容上传类调用（M2 精修/M3 补充）消费
//!              content_gate（enabled+authorized 双条件）；余额查询/测试连接
//!              为配置验证读操作不 gate（但审计记录——AI 调用轨迹可见化）。
//! @ai-context: 锁序：设置读写在短锁内完成即释放；网络调用（余额）不持锁。

use tauri::State;

use crate::ai_balance::{low_balance_warning, AiBalance, AiBalanceAdapter};
use crate::ai_guardrails::AiAuditEntry;
use crate::ai_settings::AiSettings;
use crate::commands::AppState;
/// 密钥最大长度（防超长字符串污染凭据文件；真实密钥远小于此）。
const API_KEY_MAX_CHARS: usize = 512;

/// 设置视图（前端展示；密钥只暴露存在性与来源，绝不回传明文——明文红线）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsView {
    pub enabled: bool,
    pub authorized: bool,
    pub base_url: String,
    pub model: String,
    pub low_balance_threshold: f64,
    pub remember_cost_choice: bool,
    /// 精修时启用画面理解（v0.12.0 M5——默认关，图片上传最敏感独立闸门）
    pub vision_refine_enabled: bool,
    /// 精修产出策略偏好（v0.17.0 REQ-245：默认档位 + 逐维覆盖）
    pub refine_strategy: crate::ai_strategy::RefineStrategyPrefs,
    /// v0.18.2（REQ-254）：目标 AI（规划师）独立开关——默认关（双闸门之二）
    pub goal_plan_enabled: bool,
    /// v0.18.2（REQ-254）：目标规划预算档位（light/standard/deep——默认标准）
    pub goal_plan_tier: String,
    /// 是否已配置密钥（env 或凭据库）
    pub has_key: bool,
    /// 密钥来源：credential | env | none
    pub key_source: String,
}

/// 余额视图（余额快照 + 低余额提醒文案）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceView {
    pub balance: AiBalance,
    pub low_balance_warning: Option<String>,
}

/// 读取设置视图（密钥解析：env > 凭据库；只报存在性）。
#[tauri::command]
pub fn ai_get_settings(state: State<'_, AppState>) -> Result<AiSettingsView, String> {
    let s = snapshot_settings(&state)?;
    let env_key = env_api_key();
    // v0.11.6 M1 code-review 修复：统一走 default_provider_ready（Ollama 本地
    // 无需密钥视为已就绪；env 优先展示语义保留）
    let (has_key, key_source) = if env_key.is_some() {
        (true, "env".to_string())
    } else if crate::commands_ai_providers::default_provider_ready(&state)? {
        (true, "credential".to_string())
    } else {
        (false, "none".to_string())
    };
    Ok(AiSettingsView {
        enabled: s.enabled,
        authorized: s.authorized,
        base_url: s.base_url,
        model: s.model,
        low_balance_threshold: s.low_balance_threshold,
        remember_cost_choice: s.remember_cost_choice,
        vision_refine_enabled: s.vision_refine_enabled,
        refine_strategy: s.refine_strategy.clone(),
        goal_plan_enabled: s.goal_plan_enabled,
        goal_plan_tier: s.goal_plan_tier.clone(),
        has_key,
        key_source,
    })
}

/// 保存密钥到凭据库（Windows DPAPI 加密文件；明文红线——不落 SQLite/明文）。
#[tauri::command]
pub fn ai_save_key(state: State<'_, AppState>, api_key: String) -> Result<(), String> {
    let key = api_key.trim().to_string();
    if key.is_empty() {
        return Err("密钥不能为空".to_string());
    }
    if key.chars().count() > API_KEY_MAX_CHARS {
        return Err(format!("密钥超长（上限 {} 字符）", API_KEY_MAX_CHARS));
    }
    state.ai_credentials.save_key("default", &key)
}

/// 清除凭据库密钥（文件不存在视为已清除——幂等）。
#[tauri::command]
pub fn ai_clear_key(state: State<'_, AppState>) -> Result<(), String> {
    state.ai_credentials.clear_key("default")
}

/// v0.18.2（REQ-254）：目标 AI 设置（read-modify-write 最小面——
/// 不覆盖其他设置字段；档位白名单 light/standard/deep）。
#[tauri::command]
pub fn ai_set_goal_plan(
    state: State<'_, AppState>,
    enabled: bool,
    tier: Option<String>,
) -> Result<(), String> {
    let tier = tier.unwrap_or_else(|| "standard".to_string());
    if !matches!(tier.as_str(), "light" | "standard" | "deep") {
        return Err(format!("不支持的预算档位: {}（支持: light/standard/deep）", tier));
    }
    let mut s = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?;
    s.goal_plan_enabled = enabled;
    s.goal_plan_tier = tier;
    s.save(&state.ai_settings_path).map_err(|e| e.to_string())
}

/// 更新 AI 设置（白名单校验后持久化；command 层锁内 read-modify-write）。
///
/// @ai-context: 校验：端点非空且 http(s) 前缀、模型非空、低余额阈值 ∈ (0, 1e6]；
///              非法值整体拒绝（不部分写入——防半配置态）。
#[tauri::command]
pub fn ai_update_settings(state: State<'_, AppState>, settings: AiSettings) -> Result<(), String> {
    let base_url = settings.base_url.trim().to_string();
    if base_url.is_empty() || !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
        return Err("端点必须是 http(s):// 开头的合法 URL".to_string());
    }
    let model = settings.model.trim().to_string();
    if model.is_empty() {
        return Err("模型不能为空".to_string());
    }
    if !(settings.low_balance_threshold > 0.0 && settings.low_balance_threshold <= 1_000_000.0) {
        return Err("低余额阈值必须在 0 到 1000000 之间".to_string());
    }
    let mut lock = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?;
    lock.base_url = base_url;
    lock.model = model;
    lock.low_balance_threshold = settings.low_balance_threshold;
    lock.remember_cost_choice = settings.remember_cost_choice;
    lock.save(&state.ai_settings_path)
}

/// 授权确认（首次使用授权对话框同意/撤回；持久化——重启仍生效）。
#[tauri::command]
pub fn ai_set_authorized(state: State<'_, AppState>, authorized: bool) -> Result<(), String> {
    let mut lock = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?;
    lock.authorized = authorized;
    lock.save(&state.ai_settings_path)
}

/// 开启/关闭全局 AI 开关（授权红线：默认关；开启时前端弹授权说明）。
#[tauri::command]
pub fn ai_set_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let mut lock = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?;
    lock.enabled = enabled;
    lock.save(&state.ai_settings_path)
}

/// 开启/关闭"精修时画面理解"（v0.12.0 M5——图片上传最敏感，独立闸门默认关）。
///
/// @ai-context: 仅影响 AI 音视频会话精修是否随请求上传屏卡图；开启不等于自动
///              上传——仍需全局 enabled + authorized（content_gate 门控）。
#[tauri::command]
pub fn ai_set_vision_refine(state: State<'_, AppState>, refine_enabled: bool) -> Result<(), String> {
    let mut lock = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?;
    lock.vision_refine_enabled = refine_enabled;
    lock.save(&state.ai_settings_path)
}

/// 保存精修产出策略偏好（v0.17.0 REQ-245：设置页默认档位 + 逐维覆盖——
/// 发起点任务级覆盖优先于此；非法值在 resolve 层回退，本命令只存原值）。
#[tauri::command]
pub fn ai_set_refine_strategy(
    state: State<'_, AppState>,
    prefs: crate::ai_strategy::RefineStrategyPrefs,
) -> Result<(), String> {
    let mut lock = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?;
    lock.refine_strategy = prefs;
    lock.save(&state.ai_settings_path)
}

/// 一键测试连接（REQ-138：调余额接口验证密钥有效性——错误密钥明确报错）。
///
/// @ai-context: 配置验证类读操作，不 gate 授权；401/403 → 明确"密钥无效"
///              提示（AiBalanceAdapter 归一）；无密钥 → 引导配置。
#[tauri::command]
pub fn ai_test_connection(state: State<'_, AppState>) -> Result<AiBalance, String> {
    let adapter = balance_adapter(&state)?;
    let balance = adapter.fetch()?;
    // 测试连接也留审计痕迹（AI 调用轨迹可见化）
    push_audit(&state, "test-connection", "ok");
    Ok(balance)
}

/// 查询余额（REQ-139：实时可查 + 低余额提醒 + 审计记录）。
#[tauri::command]
pub fn ai_get_balance(state: State<'_, AppState>) -> Result<BalanceView, String> {
    let adapter = balance_adapter(&state)?;
    match adapter.fetch() {
        Ok(balance) => {
            let threshold = snapshot_settings(&state)?.low_balance_threshold;
            // 先计算提醒再组装视图（结构体字段求值顺序不定——borrow/move 冲突）
            let warning = low_balance_warning(&balance, threshold);
            push_audit(&state, "balance-query", "ok");
            Ok(BalanceView {
                balance,
                low_balance_warning: warning,
            })
        }
        Err(e) => {
            push_audit(&state, "balance-query", "error");
            Err(e)
        }
    }
}

/// 审计列表（REQ-140：REQ-085 AiAuditEntry 缓冲可见化——时间/类型/结果）。
#[tauri::command]
pub fn ai_audit_list(state: State<'_, AppState>) -> Result<Vec<AiAuditEntry>, String> {
    state
        .ai_guardrails
        .lock()
        .map(|g| g.audit.clone())
        .map_err(|e| format!("护栏状态锁中毒: {}", e))
}

/// 清空审计缓冲（幂等）。
#[tauri::command]
pub fn ai_audit_clear(state: State<'_, AppState>) -> Result<(), String> {
    state
        .ai_guardrails
        .lock()
        .map(|mut g| {
            g.audit.clear();
        })
        .map_err(|e| format!("护栏状态锁中毒: {}", e))
}

// ────────────────────────────────────────────────────────────
// 内部辅助（配置解析/审计/快照）
// ────────────────────────────────────────────────────────────

/// 环境变量密钥（开发路径；优先于凭据库）。
fn env_api_key() -> Option<String> {
    std::env::var("SILICONFLOW_API_KEY").ok().filter(|k| !k.is_empty())
}

/// 设置快照（短锁读取即释放）。
fn snapshot_settings(state: &AppState) -> Result<AiSettings, String> {
    state
        .ai_settings
        .lock()
        .map(|s| s.clone())
        .map_err(|e| format!("AI 设置锁中毒: {}", e))
}

/// 余额适配器（密钥解析：env 优先 > 默认 Provider 凭据——统一解析口 M1）。
fn balance_adapter(state: &AppState) -> Result<AiBalanceAdapter, String> {
    let s = snapshot_settings(state)?;
    let api_key = crate::commands_ai_providers::resolve_default_provider_key(state)?.unwrap_or_default();
    let store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?.clone();
    let cfg = crate::ai_client::AiClient::from_settings_with_store(&s, Some(api_key), &store).config;
    Ok(AiBalanceAdapter {
        base_url: cfg.base_url,
        api_key: cfg.api_key,
        timeout_secs: cfg.timeout_secs,
        max_retries: cfg.max_retries,
    })
}

/// 审计记录（上传摘要不含原文——隐私；结果 ok/error）。
fn push_audit(state: &AppState, summary: &str, result: &str) {
    let now = crate::db_sessions_rows::unix_seconds();
    if let Ok(mut g) = state.ai_guardrails.lock() {
        g.push_audit(AiAuditEntry {
            at_unix: now,
            upload_summary: summary.to_string(),
            result: result.to_string(),
        });
    }
}
