//! commands_ai_providers.rs 单测：默认密钥解析内核（**不得回落遗留槽**）。
//!
//! @ai-context: 2026-09-13 批 8 T25（用户裁决 U2 = c）：批 1 删掉旧 IPC 之后
//!              仍留着的 `load_key("default")` 读兜底在本次移除。本文件用内存桩
//!              钉死「无默认 Provider = 无从解析（None）」，并给两条正控（合法槽
//!              照常解析、env 优先级不变）——防把「不回落」实现成「永不解析」。
//!              密钥值全为**虚构测试串**（不入库任何真实密钥）。

use crate::ai_credentials::{CredentialStore, MemoryCredentialStore};
use crate::commands_ai_providers::resolve_default_key;

/// 只有遗留槽有密钥的凭据库（= 旧版本写完、又未走启动迁移的真机形态）。
///
/// 槽位 API 已拒绝遗留槽（U2 = c）⇒ 只能直接落物理层造这个前置状态。
fn store_with_legacy_only(legacy_value: &str) -> MemoryCredentialStore {
    let s = MemoryCredentialStore::default();
    s.seed_legacy_default_for_tests(legacy_value);
    s
}

#[test]
fn no_default_provider_does_not_fall_back_to_legacy_slot() {
    // Arrange：旧版本只写过遗留槽；当前没有任何 Provider（default_id = None）
    let s = store_with_legacy_only("sk-legacy-fixture-not-a-real-key");
    // Act
    let resolved = resolve_default_key(None, None, &s).expect("无默认 Provider 不报错");
    // Assert：**不回落**——遗留槽不是合法槽位，解析结果必须是 None
    assert_eq!(
        resolved, None,
        "无默认 Provider 时不得回落遗留 default 槽（U2 = c：读路径已移除）"
    );
}

#[test]
fn default_provider_slot_still_resolves() {
    // 正控：合法槽位照常解析（防「不回落」被实现成「永不解析」）
    let s = MemoryCredentialStore::default();
    s.save_key("provider:p1", "sk-provider-fixture").expect("保存合法槽位");
    let resolved = resolve_default_key(None, Some("p1"), &s).expect("解析默认 Provider 槽");
    assert_eq!(resolved.as_deref(), Some("sk-provider-fixture"), "合法 provider 槽必须照常解析");
}

#[test]
fn env_key_wins_over_default_provider_slot() {
    // 正控：env 优先级不变（U2 只动遗留槽，不动优先级）
    let s = MemoryCredentialStore::default();
    s.save_key("provider:p1", "sk-provider-fixture").expect("保存合法槽位");
    let resolved = resolve_default_key(Some("sk-env-fixture".to_string()), Some("p1"), &s).expect("解析");
    assert_eq!(resolved.as_deref(), Some("sk-env-fixture"), "env 密钥优先于 per-provider 槽");
}

#[test]
fn missing_provider_slot_yields_none() {
    // 边界：默认 Provider 存在但其槽位无密钥 ⇒ None（不再有任何兜底来源）
    let s = MemoryCredentialStore::default();
    s.save_key("provider:other", "sk-other-fixture").expect("保存另一槽位");
    let resolved = resolve_default_key(None, Some("p1"), &s).expect("解析");
    assert_eq!(resolved, None, "默认 Provider 无密钥时不得从其他槽位借用");
}
