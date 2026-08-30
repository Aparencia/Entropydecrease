//! ai_settings.rs 单测（AAA 模式：Arrange/Act/Assert）。
//!
//! @ai-context: 覆盖：默认值（授权红线默认关）、JSON partial 覆盖语义、
//!              损坏文件回退默认、持久化 roundtrip、双门控（content/enabled）
//!              边界（未开启/未授权/双条件满足）。

use std::path::PathBuf;

use crate::ai_settings::{AiSettings, DEFAULT_AI_MODEL};

fn tmp_settings_file(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("ai_settings_tests");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

#[test]
fn default_is_disabled_and_unauthorized() {
    // 授权红线：默认必须关闭且未授权
    let s = AiSettings::default();
    assert!(!s.enabled, "全局开关默认必须关闭");
    assert!(!s.authorized, "授权默认必须未同意");
    // v0.12.0 M5：图片上传最敏感——vision 画面理解默认关（隐私红线）
    assert!(!s.vision_refine_enabled, "图片理解默认必须关闭");
}

#[test]
fn partial_json_keeps_builtin_defaults() {
    // 只写 enabled 的 JSON → 其余字段 = 内置默认（partial 覆盖语义）
    let s = AiSettings::from_json(r#"{"enabled":true}"#).expect("合法 JSON");
    assert!(s.enabled);
    assert!(!s.authorized);
    assert_eq!(s.model, DEFAULT_AI_MODEL);
    assert!(s.low_balance_threshold > 0.0);
}

#[test]
fn corrupt_json_falls_back_to_default() {
    // 损坏 JSON → 回退内置默认，不 panic（不阻断启动）
    let s = AiSettings::from_json("{ not json !!!").unwrap_or_else(|_| AiSettings::default());
    assert_eq!(s, AiSettings::default());
}

#[test]
fn save_load_roundtrip() {
    // 持久化 roundtrip：enabled/authorized/端点/模型/阈值/记住选择全保真
    let path = tmp_settings_file("roundtrip.json");
    let _ = std::fs::remove_file(&path);
    let s = AiSettings {
        enabled: true,
        authorized: true,
        base_url: "https://example.com/v1".to_string(),
        model: "acme/model-1".to_string(),
        low_balance_threshold: 5.0,
        remember_cost_choice: true,
        // v0.12.0 M5：vision 画面理解默认关——持久化 roundtrip 保真
        vision_refine_enabled: true,
    };
    s.save(&path).expect("保存成功");
    let loaded = AiSettings::load(&path);
    assert_eq!(loaded, s);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn content_gate_requires_enabled_and_authorized() {
    // 双条件门控：缺一不可（授权红线验收：授权前任何 AI 调用不可达）
    let s = AiSettings::default();
    assert!(s.content_gate().is_err(), "默认状态内容调用必须被拦截");
    let mut s2 = AiSettings { enabled: true, ..AiSettings::default() };
    assert!(s2.content_gate().is_err(), "开启但未授权必须被拦截");
    s2.authorized = true;
    assert!(s2.content_gate().is_ok(), "双条件满足放行");
}

#[test]
fn enabled_gate_only_checks_switch() {
    // 非内容类门控只查开关（余额/测试连接不要求内容授权）
    let s = AiSettings::default();
    assert!(s.enabled_gate().is_err());
    let s2 = AiSettings { enabled: true, ..AiSettings::default() };
    assert!(s2.enabled_gate().is_ok());
}
