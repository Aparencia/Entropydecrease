//! AI Provider 管理 commands（v0.11.6 M1，BYOK 多端点）。
//!
//! @ai-context: 系统层——只做参数校验、调用 ai_provider/ai_credentials 业务
//!              模块、错误映射；密钥永不回传前端（视图只报存在性与来源）。
//! @ai-context: 测试连接用最小 chat 请求（通用 OpenAI 兼容端点，不依赖
//!              SiliconFlow 余额接口）——Ollama 本地同样可测。
//! @ai-context: 锁序：配置读写在短锁内完成即释放；网络调用（测试连接）不持锁。
//! @ai-context: resolve_default_provider_key 为默认 Provider 密钥统一解析口
//!              （env 优先 > per-provider 凭据 > 旧 default scope 回退），
//!              精修/补充/余额 4 个旧调用点统一改走此口——Provider 面板
//!              保存的密钥对实际 AI 调用生效（Task 4 审查 Important 修复）。

use tauri::State;

use crate::ai_provider::{preset_templates, provider_scope, AiProviderConfig};
use crate::commands::AppState;

/// Provider 视图（前端展示；密钥只暴露存在性与来源——明文红线）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub models: Vec<String>,
    pub default_model: String,
    pub enabled: bool,
    pub fallback_order: Vec<String>,
    pub has_key: bool,
    pub key_source: String,
    pub is_default: bool,
}

/// Provider 创建/更新入参（密钥字段可选：更新时留空=不改）。
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub models: Vec<String>,
    pub default_model: String,
    pub enabled: bool,
    pub fallback_order: Vec<String>,
    pub api_key: Option<String>,
}

/// 预设模板列表（前端"添加 Provider"向导数据）。
#[tauri::command]
pub fn ai_provider_presets() -> Vec<AiProviderView> {
    preset_templates()
        .into_iter()
        .map(|p| to_view(&p, false, false))
        .collect()
}

/// 当前 Provider 列表（含默认标记与密钥存在性）。
#[tauri::command]
pub fn ai_provider_list(state: State<'_, AppState>) -> Result<Vec<AiProviderView>, String> {
    let store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
    let default_id = store.effective_default_id();
    let mut views = Vec::new();
    for p in &store.providers {
        let has_key = state
            .ai_credentials
            .load_key(&provider_scope(&p.id))
            .map(|k| k.is_some())
            .unwrap_or(false);
        views.push(to_view(p, has_key, Some(p.id.as_str()) == default_id.as_deref()));
    }
    Ok(views)
}

/// 添加 Provider（预设模板 id 或自定义）。
#[tauri::command]
pub fn ai_provider_add(state: State<'_, AppState>, input: AiProviderInput) -> Result<AiProviderView, String> {
    let mut provider = resolve_input(&input)?;
    provider.id = input.id.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| {
        format!("p-{}", crate::db_sessions_rows::unix_seconds())
    });
    provider.validate()?;
    let mut store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
    if store.get(&provider.id).is_some() {
        return Err(format!("Provider id 已存在: {}", provider.id));
    }
    if store.providers.is_empty() {
        store.default_provider_id = Some(provider.id.clone());
    }
    if let Some(key) = input.api_key.filter(|k| !k.trim().is_empty()) {
        state.ai_credentials.save_key(&provider_scope(&provider.id), key.trim())?;
    }
    store.providers.push(provider.clone());
    store.save(&state.ai_providers_path)?;
    let has_key = state.ai_credentials.load_key(&provider_scope(&provider.id)).map(|k| k.is_some()).unwrap_or(false);
    Ok(to_view(&provider, has_key, Some(provider.id.as_str()) == store.effective_default_id().as_deref()))
}

/// 更新 Provider（id 必填；api_key 留空=不改密钥）。
#[tauri::command]
pub fn ai_provider_update(state: State<'_, AppState>, id: String, input: AiProviderInput) -> Result<(), String> {
    let mut provider = resolve_input(&input)?;
    provider.id = id;
    provider.validate()?;
    let mut store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
    let slot = store.get_mut(&provider.id).ok_or_else(|| format!("Provider 不存在: {}", provider.id))?;
    *slot = provider;
    if let Some(key) = input.api_key.filter(|k| !k.trim().is_empty()) {
        state.ai_credentials.save_key(&provider_scope(&slot.id), key.trim())?;
    }
    store.save(&state.ai_providers_path)
}

/// 删除 Provider（幂等；删除其凭据；默认 Provider 需先改默认或拒绝）。
#[tauri::command]
pub fn ai_provider_remove(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
    if store.effective_default_id().as_deref() == Some(id.as_str()) {
        return Err("默认 Provider 不能删除——请先设置其他默认".to_string());
    }
    store.providers.retain(|p| p.id != id);
    let _ = state.ai_credentials.clear_key(&provider_scope(&id));
    store.save(&state.ai_providers_path)
}

/// 保存 Provider 密钥（scope 化 DPAPI；留空拒绝）。
#[tauri::command]
pub fn ai_provider_save_key(state: State<'_, AppState>, id: String, api_key: String) -> Result<(), String> {
    let key = api_key.trim().to_string();
    if key.is_empty() {
        return Err("密钥不能为空".to_string());
    }
    if key.chars().count() > 512 {
        return Err("密钥超长（上限 512 字符）".to_string());
    }
    if state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?.get(&id).is_none() {
        return Err(format!("Provider 不存在: {}", id));
    }
    state.ai_credentials.save_key(&provider_scope(&id), &key)
}

/// 清除 Provider 密钥（幂等）。
#[tauri::command]
pub fn ai_provider_clear_key(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.ai_credentials.clear_key(&provider_scope(&id))
}

/// 设置默认 Provider（存在性校验；enabled 才可设默认）。
#[tauri::command]
pub fn ai_set_default_provider(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
    let p = store.get(&id).ok_or_else(|| format!("Provider 不存在: {}", id))?;
    if !p.enabled {
        return Err("已禁用的 Provider 不能设为默认".to_string());
    }
    store.default_provider_id = Some(id);
    store.save(&state.ai_providers_path)
}

/// 一键测试连接（最小 chat 请求验证密钥有效性——通用 OpenAI 兼容端点）。
#[tauri::command]
pub fn ai_provider_test(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let provider = {
        let store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
        store.get(&id).cloned().ok_or_else(|| format!("Provider 不存在: {}", id))?
    };
    if provider.default_model.is_empty() {
        return Err("请先选择默认模型".to_string());
    }
    let api_key = state.ai_credentials.load_key(&provider_scope(&id))?.unwrap_or_default();
    let client = crate::ai_client::AiClient::from_provider(&provider, Some(api_key));
    let reply = client
        .chat_text(
            "你是连通性测试助手。",
            "只回复两个字：正常",
        )
        .map_err(|e| e.to_string())?;
    Ok(reply.chars().take(20).collect())
}

// ────────────────────────────────────────────────────────────
// 内部辅助
// ────────────────────────────────────────────────────────────

/// 解析默认 Provider 密钥（env 优先 > per-provider 凭据——Provider 面板
/// 配置的密钥在此生效；无默认 Provider 回退旧 default scope 兼容迁移前）。
pub fn resolve_default_provider_key(state: &AppState) -> Result<Option<String>, String> {
    let env_key = std::env::var("SILICONFLOW_API_KEY").ok().filter(|k| !k.is_empty());
    if env_key.is_some() {
        return Ok(env_key);
    }
    let default_id = {
        let store = state.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?;
        store.effective_default_id()
    };
    match default_id {
        Some(id) => state.ai_credentials.load_key(&provider_scope(&id)),
        None => state.ai_credentials.load_key("default"),
    }
}

/// 入参 → 配置（kind 字符串解析 + 公共字段映射；id 由调用方决定）。
fn resolve_input(input: &AiProviderInput) -> Result<AiProviderConfig, String> {
    let kind = match input.kind.as_str() {
        "openAiCompat" | "openai-compat" | "" => crate::ai_provider::ProviderKind::OpenAiCompat,
        "ollama" => crate::ai_provider::ProviderKind::Ollama,
        other => return Err(format!("未知 Provider 类型: {}", other)),
    };
    Ok(AiProviderConfig {
        id: String::new(),
        name: input.name.trim().to_string(),
        kind,
        base_url: input.base_url.trim().to_string(),
        models: input.models.iter().map(|m| m.trim().to_string()).filter(|m| !m.is_empty()).collect(),
        default_model: input.default_model.trim().to_string(),
        enabled: input.enabled,
        fallback_order: input.fallback_order.clone(),
    })
}

/// 视图映射（密钥存在性由调用方注入）。
fn to_view(p: &AiProviderConfig, has_key: bool, is_default: bool) -> AiProviderView {
    let key_source = if has_key { "credential" } else { "none" };
    AiProviderView {
        id: p.id.clone(),
        name: p.name.clone(),
        kind: match p.kind {
            crate::ai_provider::ProviderKind::OpenAiCompat => "openAiCompat".to_string(),
            crate::ai_provider::ProviderKind::Ollama => "ollama".to_string(),
        },
        base_url: p.base_url.clone(),
        models: p.models.clone(),
        default_model: p.default_model.clone(),
        enabled: p.enabled,
        fallback_order: p.fallback_order.clone(),
        has_key,
        key_source: key_source.to_string(),
        is_default,
    }
}
