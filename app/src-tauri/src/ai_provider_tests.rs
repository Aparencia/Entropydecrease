//! ai_provider.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：预设模板完整性（4 Provider）、配置校验（合法/非法 URL、
//!              空模型、默认模型不在列表/空白）、JSON roundtrip（顺序与默认
//!              保持）、幽灵 id 回退（含全禁用边界）、旧版单 Provider 配置
//!              迁移（SiliconFlow，含非法配置回退预设）。

use crate::ai_provider::*;

#[test]
fn preset_templates_cover_four_providers() {
    let presets = preset_templates();
    assert_eq!(presets.len(), 4);
    assert!(presets.iter().any(|p| p.kind == ProviderKind::Ollama));
    let sf = presets.iter().find(|p| p.name == "SiliconFlow").unwrap();
    assert!(sf.base_url.starts_with("https://"));
    assert!(!sf.models.is_empty());
    assert!(!sf.default_model.is_empty());
}

#[test]
fn provider_validate_accepts_valid_config() {
    let mut p = preset_templates().remove(0);
    p.id = "p1".to_string();
    assert!(p.validate().is_ok());
}

#[test]
fn provider_validate_rejects_bad_url_and_empty_model() {
    let mut p = preset_templates().remove(0);
    p.id = "p1".to_string();
    p.base_url = "ftp://bad".to_string();
    assert!(p.validate().is_err());
    p.base_url = "https://ok".to_string();
    p.models.clear();
    assert!(p.validate().is_err());
    p.models = vec!["m".to_string()];
    p.default_model = "not-in-list".to_string();
    assert!(p.validate().is_err());
    p.default_model = "  ".to_string();
    assert!(p.validate().is_err());
}

#[test]
fn store_roundtrip_keeps_order_and_default() {
    let mut store = AiProviderStore::default();
    let mut a = preset_templates().remove(0);
    a.id = "a".to_string();
    let mut b = preset_templates().remove(1);
    b.id = "b".to_string();
    store.providers.push(a.clone());
    store.providers.push(b.clone());
    store.default_provider_id = Some("b".to_string());
    let json = store.to_json().unwrap();
    let back = AiProviderStore::from_json(&json).unwrap();
    assert_eq!(back.providers.len(), 2);
    assert_eq!(back.default_provider_id.as_deref(), Some("b"));
    assert_eq!(back.providers[0].id, "a");
}

#[test]
fn store_ghost_default_falls_back_to_first_enabled() {
    let mut store = AiProviderStore::default();
    let mut a = preset_templates().remove(0);
    a.id = "a".to_string();
    store.providers.push(a);
    store.default_provider_id = Some("ghost".to_string());
    assert_eq!(store.effective_default_id(), Some("a".to_string()));
    // 全部禁用 → 无生效默认
    store.providers[0].enabled = false;
    assert_eq!(store.effective_default_id(), None);
}

#[test]
fn migrate_from_legacy_creates_siliconflow() {
    let s = crate::ai_settings::AiSettings {
        base_url: "https://api.siliconflow.cn/v1".to_string(),
        model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B".to_string(),
        ..Default::default()
    };
    let (providers, default_id) = migrate_from_legacy(&s);
    assert_eq!(providers.len(), 1);
    assert_eq!(providers[0].name, "SiliconFlow");
    assert_eq!(providers[0].base_url, s.base_url);
    assert_eq!(providers[0].default_model, s.model);
    assert_eq!(default_id, Some(providers[0].id.clone()));
}

#[test]
fn migrate_from_legacy_falls_back_on_invalid_config() {
    let s = crate::ai_settings::AiSettings {
        base_url: "ftp://bad".to_string(),
        model: String::new(),
        ..Default::default()
    };
    let (providers, default_id) = migrate_from_legacy(&s);
    assert_eq!(providers.len(), 1);
    assert_eq!(providers[0].id, "legacy-siliconflow");
    assert!(providers[0].validate().is_ok());
    assert_eq!(default_id, Some("legacy-siliconflow".to_string()));
}