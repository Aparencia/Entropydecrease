//! ai_credentials.rs 单测（AAA 模式；凭据库 roundtrip 走内存桩——
//! DPAPI 为系统调用不单测，与 model_downloader 网络路径同口径）。

use crate::ai_credentials::{CredentialStore, MemoryCredentialStore};

fn store() -> MemoryCredentialStore {
    MemoryCredentialStore::default()
}

#[test]
fn roundtrip_save_load() {
    let s = store();
    s.save_key("sk-test-123").expect("保存成功");
    assert_eq!(s.load_key().expect("读取成功").as_deref(), Some("sk-test-123"));
}

#[test]
fn load_empty_is_none() {
    // 未保存 → None（与 DPAPI 文件不存在语义一致）
    let s = store();
    assert_eq!(s.load_key().expect("读取成功"), None);
}

#[test]
fn clear_removes_key() {
    let s = store();
    s.save_key("sk-abc").expect("保存成功");
    s.clear_key().expect("清除成功");
    assert_eq!(s.load_key().expect("读取成功"), None);
    // 幂等：重复清除不报错（文件不存在视为已清除）
    s.clear_key().expect("重复清除成功");
}

#[test]
fn empty_key_rejected() {
    // 空/空白密钥拒绝保存（防御：不写坏凭据）
    let s = store();
    assert!(s.save_key("").is_err());
    assert!(s.save_key("   ").is_err());
    assert_eq!(s.load_key().expect("读取成功"), None);
}

#[test]
fn save_overwrites_previous() {
    let s = store();
    s.save_key("sk-old").expect("保存成功");
    s.save_key("sk-new").expect("覆盖保存成功");
    assert_eq!(s.load_key().expect("读取成功").as_deref(), Some("sk-new"));
}
