//! ai_provider.rs 单测（AAA 模式）。
//!
//! @ai-context: 覆盖：预设模板完整性（4 Provider、DeepSeek 首位 + vision 默认）、
//!              配置校验（合法/非法 URL、空模型、默认模型不在列表/空白）、JSON
//!              roundtrip（顺序与默认保持）、幽灵 id 回退（含全禁用边界）、旧版
//!              单 Provider 配置迁移（DeepSeek——v0.12.0 M4 默认链，含非法配置
//!              仍产出合法 Provider）。

use crate::ai_provider::*;

#[test]
fn preset_templates_cover_four_providers() {
    let presets = preset_templates();
    assert_eq!(presets.len(), 4);
    assert!(presets.iter().any(|p| p.kind == ProviderKind::Ollama));
    // v0.12.0 M4：DeepSeek 提首位（effective_default_id 取第一个 enabled → 默认链）
    assert_eq!(presets[0].id, "deepseek");
    // 2026-09-11（DeepSeek-V4.1-Flash）：现役模型名——旧名不得再进预设
    assert_eq!(presets[0].default_model, "deepseek-flash");
    assert!(presets[0].models.iter().any(|m| m == "deepseek-flash"));
    assert!(presets[0].models.iter().any(|m| m == "deepseek-v4-pro"));
    for retired in ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"] {
        assert!(
            !presets[0].models.iter().any(|m| m == retired),
            "退役模型名 {} 不得留在预设",
            retired
        );
    }
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
fn migrate_from_legacy_creates_deepseek() {
    // v0.12.0 M4：迁移目标由 SiliconFlow 改为 DeepSeek 默认链——legacy 配置
    // （旧 SiliconFlow 链路）不再沿用，直接生成 DeepSeek 官方端点 + 现役默认模型。
    let s = crate::ai_settings::AiSettings {
        base_url: "https://api.siliconflow.cn/v1".to_string(),
        model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B".to_string(),
        ..Default::default()
    };
    let (providers, default_id) = migrate_from_legacy(&s);
    assert_eq!(providers.len(), 1);
    assert_eq!(providers[0].name, "DeepSeek");
    assert_eq!(providers[0].base_url, "https://api.deepseek.com/v1");
    assert_eq!(providers[0].default_model, "deepseek-flash");
    assert!(providers[0].models.iter().any(|m| m == "deepseek-flash"));
    assert_eq!(providers[0].id, "legacy-deepseek");
    assert_eq!(default_id, Some(providers[0].id.clone()));
}

#[test]
fn migrate_from_legacy_always_produces_valid_deepseek() {
    // 旧配置非法 → 迁移仍产出合法 DeepSeek 默认 Provider（保可用不崩；
    // 旧 SiliconFlow 链路已废除，不再回退旧端点）。
    let s = crate::ai_settings::AiSettings {
        base_url: "ftp://bad".to_string(),
        model: String::new(),
        ..Default::default()
    };
    let (providers, default_id) = migrate_from_legacy(&s);
    assert_eq!(providers.len(), 1);
    assert_eq!(providers[0].id, "legacy-deepseek");
    assert!(providers[0].validate().is_ok());
    assert_eq!(providers[0].default_model, "deepseek-flash");
    assert_eq!(default_id, Some("legacy-deepseek".to_string()));
}

/// v0.12.0 M4：既有安装默认链升级——旧 SiliconFlow 链默认 → DeepSeek 默认。
#[test]
fn upgrade_existing_siliconflow_default_to_deepseek() {
    let mut store = AiProviderStore::default();
    let sf = preset_templates().into_iter().find(|p| p.id == "siliconflow").unwrap();
    store.providers.push(sf);
    store.default_provider_id = Some("siliconflow".to_string());
    // Act
    assert!(upgrade_existing_default_to_deepseek(&mut store));
    // Assert：DeepSeek 插入首位并设默认；旧 Provider 保留（密钥/回退不受影响）
    assert_eq!(store.default_provider_id.as_deref(), Some("deepseek"));
    assert_eq!(store.providers[0].id, "deepseek");
    assert!(store.get("siliconflow").is_some(), "旧 Provider 必须保留");
}

/// 已有 DeepSeek → 不重复插入（幂等——用户删除后不再误加由守卫承担）。
#[test]
fn upgrade_skips_when_deepseek_present() {
    let mut store = AiProviderStore::default();
    let ds = preset_templates().into_iter().find(|p| p.id == "deepseek").unwrap();
    let sf = preset_templates().into_iter().find(|p| p.id == "siliconflow").unwrap();
    store.providers.push(ds);
    store.providers.push(sf);
    store.default_provider_id = Some("siliconflow".to_string());
    let before = store.clone();
    // Act & Assert
    assert!(!upgrade_existing_default_to_deepseek(&mut store));
    assert_eq!(store, before, "已含 DeepSeek 时不得改动");
}

/// 用户显式设其他默认（OpenRouter/自定义）→ 不覆盖用户选择。
#[test]
fn upgrade_skips_custom_default() {
    let mut store = AiProviderStore::default();
    let or = preset_templates().into_iter().find(|p| p.id == "openrouter").unwrap();
    store.providers.push(or);
    store.default_provider_id = Some("openrouter".to_string());
    // Act & Assert
    assert!(!upgrade_existing_default_to_deepseek(&mut store));
    assert_eq!(store.default_provider_id.as_deref(), Some("openrouter"));
}

/// 默认未显式设置（None）→ 不触碰（尊重 first-enabled 语义）。
#[test]
fn upgrade_skips_unset_default() {
    let mut store = AiProviderStore::default();
    let sf = preset_templates().into_iter().find(|p| p.id == "siliconflow").unwrap();
    store.providers.push(sf);
    store.default_provider_id = None;
    // Act & Assert
    assert!(!upgrade_existing_default_to_deepseek(&mut store));
}

// ────────────────────────────────────────────────────────────
// 2026-09-11（DeepSeek V4.1）：既有配置模型名归一
// ────────────────────────────────────────────────────────────

#[test]
fn current_deepseek_model_maps_retired_names() {
    assert_eq!(current_deepseek_model("deepseek-chat"), Some("deepseek-flash"));
    assert_eq!(current_deepseek_model("deepseek-reasoner"), Some("deepseek-flash"));
    assert_eq!(current_deepseek_model("deepseek-v4-flash"), Some("deepseek-flash"));
    assert_eq!(
        current_deepseek_model("deepseek-v4-flash-vision-exp"),
        Some("deepseek-flash")
    );
    // 大小写/空白容错；现役名与第三方同名条目不动
    assert_eq!(current_deepseek_model(" DeepSeek-V4-Flash "), Some("deepseek-flash"));
    assert_eq!(current_deepseek_model("deepseek-flash"), None);
    assert_eq!(current_deepseek_model("deepseek-v4-pro"), None);
    assert_eq!(current_deepseek_model("deepseek/deepseek-chat"), None);
}

/// 真机取证配置（用户 ai_providers.json）：旧名 + 旧默认 → 归一到现役名。
#[test]
fn normalize_rewrites_real_world_deepseek_config() {
    // Arrange：2026-09-11 真机读到的实际存储内容
    let mut store = AiProviderStore::default();
    store.providers.push(AiProviderConfig {
        id: "deepseek".to_string(),
        name: "DeepSeek".to_string(),
        kind: ProviderKind::OpenAiCompat,
        base_url: "https://api.deepseek.com/v1".to_string(),
        models: vec!["deepseek-v4-flash".to_string(), "deepseek-v4-pro".to_string()],
        default_model: "deepseek-v4-flash".to_string(),
        enabled: true,
        fallback_order: Vec::new(),
    });
    store.default_provider_id = Some("deepseek".to_string());
    // Act
    let changed = normalize_retired_deepseek_models(&mut store);
    // Assert
    assert!(changed);
    let p = store.get("deepseek").unwrap();
    assert_eq!(p.default_model, "deepseek-flash");
    assert_eq!(p.models, vec!["deepseek-flash".to_string(), "deepseek-v4-pro".to_string()]);
    assert!(p.validate().is_ok(), "归一后必须仍满足 validate 不变量");
    // 幂等：再次归一不再变更
    assert!(!normalize_retired_deepseek_models(&mut store));
}

/// 归一按**端点**收紧：第三方同名条目（OpenRouter/SiliconFlow）零改动。
#[test]
fn normalize_leaves_third_party_providers_untouched() {
    let mut store = AiProviderStore::default();
    store.providers.push(AiProviderConfig {
        id: "openrouter".to_string(),
        name: "OpenRouter".to_string(),
        kind: ProviderKind::OpenAiCompat,
        base_url: "https://openrouter.ai/api/v1".to_string(),
        models: vec!["deepseek/deepseek-chat".to_string()],
        default_model: "deepseek/deepseek-chat".to_string(),
        enabled: true,
        fallback_order: Vec::new(),
    });
    let before = store.clone();
    // Act & Assert
    assert!(!normalize_retired_deepseek_models(&mut store));
    assert_eq!(store, before, "非 DeepSeek 官方端点不得改写");
}

/// 多旧名折叠为同一现役名（去重）+ 默认模型落回列表（不变量防御）。
#[test]
fn normalize_dedups_and_keeps_default_in_list() {
    let mut store = AiProviderStore::default();
    store.providers.push(AiProviderConfig {
        id: "ds".to_string(),
        name: "DeepSeek".to_string(),
        kind: ProviderKind::OpenAiCompat,
        base_url: "https://api.deepseek.com".to_string(),
        models: vec!["deepseek-chat".to_string(), "deepseek-reasoner".to_string()],
        default_model: "deepseek-reasoner".to_string(),
        enabled: true,
        fallback_order: Vec::new(),
    });
    // Act
    assert!(normalize_retired_deepseek_models(&mut store));
    // Assert
    let p = store.get("ds").unwrap();
    assert_eq!(p.models, vec!["deepseek-flash".to_string()]);
    assert_eq!(p.default_model, "deepseek-flash");
    assert!(p.validate().is_ok());
}