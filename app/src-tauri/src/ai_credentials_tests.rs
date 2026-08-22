//! ai_credentials.rs 单测（AAA 模式；凭据库 roundtrip 走内存桩——
//! DPAPI 为系统调用不单测，与 model_downloader 网络路径同口径）。

use crate::ai_credentials::{CredentialStore, MemoryCredentialStore};

fn store() -> MemoryCredentialStore {
    MemoryCredentialStore::default()
}

/// 默认 scope（与 command 层调用一致——旧测试全部走 "default" 条目）。
const DEFAULT_SCOPE: &str = "default";

#[test]
fn roundtrip_save_load() {
    let s = store();
    s.save_key(DEFAULT_SCOPE, "sk-test-123").expect("保存成功");
    assert_eq!(s.load_key(DEFAULT_SCOPE).expect("读取成功").as_deref(), Some("sk-test-123"));
}

#[test]
fn load_empty_is_none() {
    // 未保存 → None（与 DPAPI 文件不存在语义一致）
    let s = store();
    assert_eq!(s.load_key(DEFAULT_SCOPE).expect("读取成功"), None);
}

#[test]
fn clear_removes_key() {
    let s = store();
    s.save_key(DEFAULT_SCOPE, "sk-abc").expect("保存成功");
    s.clear_key(DEFAULT_SCOPE).expect("清除成功");
    assert_eq!(s.load_key(DEFAULT_SCOPE).expect("读取成功"), None);
    // 幂等：重复清除不报错（文件不存在视为已清除）
    s.clear_key(DEFAULT_SCOPE).expect("重复清除成功");
}

#[test]
fn empty_key_rejected() {
    // 空/空白密钥拒绝保存（防御：不写坏凭据）
    let s = store();
    assert!(s.save_key(DEFAULT_SCOPE, "").is_err());
    assert!(s.save_key(DEFAULT_SCOPE, "   ").is_err());
    assert_eq!(s.load_key(DEFAULT_SCOPE).expect("读取成功"), None);
}

#[test]
fn save_overwrites_previous() {
    let s = store();
    s.save_key(DEFAULT_SCOPE, "sk-old").expect("保存成功");
    s.save_key(DEFAULT_SCOPE, "sk-new").expect("覆盖保存成功");
    assert_eq!(s.load_key(DEFAULT_SCOPE).expect("读取成功").as_deref(), Some("sk-new"));
}

#[test]
fn scoped_store_isolates_keys_by_scope() {
    let store = crate::ai_credentials::MemoryCredentialStore::default();
    store.save_key("default", "sk-a").unwrap();
    store.save_key("provider:p1", "sk-b").unwrap();
    assert_eq!(store.load_key("default").unwrap().as_deref(), Some("sk-a"));
    assert_eq!(store.load_key("provider:p1").unwrap().as_deref(), Some("sk-b"));
    store.clear_key("provider:p1").unwrap();
    assert_eq!(store.load_key("provider:p1").unwrap(), None);
    assert_eq!(store.load_key("default").unwrap().as_deref(), Some("sk-a"));
}
