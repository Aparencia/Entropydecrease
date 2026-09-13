//! ai_credentials.rs 单测（AAA 模式；凭据库 roundtrip 走内存桩——
//! DPAPI 为系统调用不单测，与 model_downloader 网络路径同口径）。
//!
//! @ai-context: 2026-09-13 批 8 T25（用户裁决 U2 = c）：遗留槽 "default" 不再是
//!              合法槽位 ⇒ 原「全部走 default 条目」的用例改用**合法** per-provider
//!              槽（语义不变：roundtrip/覆盖/幂等/空值拒绝），并新增两组判据：
//!              ① **写/读/清三路全拒**（V1）；② **旧数据仍在**（V2——物理层键与值
//!              可读 + 旧 blob 文件字节不变）。测试串全为**虚构值**，不含任何真密钥。

#[cfg(target_os = "windows")]
use std::path::PathBuf;

use crate::ai_credentials::{CredentialStore, MemoryCredentialStore, LEGACY_DEFAULT_SCOPE};

fn store() -> MemoryCredentialStore {
    MemoryCredentialStore::default()
}

/// 合法槽位（per-provider；旧测试走 "default" 条目，U2 = c 后该槽已废弃）。
const TEST_SCOPE: &str = "provider:test";

#[test]
fn roundtrip_save_load() {
    let s = store();
    s.save_key(TEST_SCOPE, "sk-test-123").expect("保存成功");
    assert_eq!(s.load_key(TEST_SCOPE).expect("读取成功").as_deref(), Some("sk-test-123"));
}

#[test]
fn load_empty_is_none() {
    // 未保存 → None（与 DPAPI 文件不存在语义一致）
    let s = store();
    assert_eq!(s.load_key(TEST_SCOPE).expect("读取成功"), None);
}

#[test]
fn clear_removes_key() {
    let s = store();
    s.save_key(TEST_SCOPE, "sk-abc").expect("保存成功");
    s.clear_key(TEST_SCOPE).expect("清除成功");
    assert_eq!(s.load_key(TEST_SCOPE).expect("读取成功"), None);
    // 幂等：重复清除不报错（文件不存在视为已清除）
    s.clear_key(TEST_SCOPE).expect("重复清除成功");
}

#[test]
fn empty_key_rejected() {
    // 空/空白密钥拒绝保存（防御：不写坏凭据）
    let s = store();
    assert!(s.save_key(TEST_SCOPE, "").is_err());
    assert!(s.save_key(TEST_SCOPE, "   ").is_err());
    assert_eq!(s.load_key(TEST_SCOPE).expect("读取成功"), None);
}

#[test]
fn save_overwrites_previous() {
    let s = store();
    s.save_key(TEST_SCOPE, "sk-old").expect("保存成功");
    s.save_key(TEST_SCOPE, "sk-new").expect("覆盖保存成功");
    assert_eq!(s.load_key(TEST_SCOPE).expect("读取成功").as_deref(), Some("sk-new"));
}

#[test]
fn scoped_store_isolates_keys_by_scope() {
    let store = crate::ai_credentials::MemoryCredentialStore::default();
    store.save_key("provider:p1", "sk-a").unwrap();
    store.save_key("provider:p2", "sk-b").unwrap();
    assert_eq!(store.load_key("provider:p1").unwrap().as_deref(), Some("sk-a"));
    assert_eq!(store.load_key("provider:p2").unwrap().as_deref(), Some("sk-b"));
    store.clear_key("provider:p1").unwrap();
    assert_eq!(store.load_key("provider:p1").unwrap(), None);
    assert_eq!(store.load_key("provider:p2").unwrap().as_deref(), Some("sk-b"), "清一个槽不得动另一个");
}

// ────────────────────────────────────────────────────────────
// U2 = c 判据（V1：遗留槽不再是合法槽位——写/读/清三路全拒）
// ────────────────────────────────────────────────────────────

#[test]
fn legacy_default_slot_write_is_rejected() {
    // Arrange：合法槽位先写一条（证明拒绝不是"整个库坏了"）
    let s = store();
    s.save_key(TEST_SCOPE, "sk-live-fixture").expect("合法槽位可写");
    // Act
    let err = s.save_key(LEGACY_DEFAULT_SCOPE, "sk-legacy-fixture").expect_err("遗留槽必须拒绝写入");
    // Assert：具名断言——拒绝**且**报的是遗留槽
    assert!(
        err.contains(LEGACY_DEFAULT_SCOPE),
        "拒绝理由必须点名遗留槽，实得: {}",
        err
    );
    assert_eq!(s.read_legacy_default_for_tests(), None, "被拒的写入不得落进存储");
}

#[test]
fn legacy_default_slot_read_is_rejected() {
    // V1 的「读取不再把它当合法值」：连原始读取都拒绝（显式 Err，不是静默 None）
    let s = store();
    s.seed_legacy_default_for_tests("sk-legacy-fixture");
    assert!(s.load_key(LEGACY_DEFAULT_SCOPE).is_err(), "遗留槽读取必须显式拒绝");
}

#[test]
fn legacy_default_slot_clear_is_rejected() {
    // (ii) 的代码级防线：删不掉 ⇒ 没有任何 API 能抹除旧数据
    let s = store();
    s.seed_legacy_default_for_tests("sk-legacy-fixture");
    assert!(s.clear_key(LEGACY_DEFAULT_SCOPE).is_err(), "遗留槽清除必须显式拒绝");
}

// ────────────────────────────────────────────────────────────
// U2 = c 判据（V2：旧数据仍在——物理层键与值可读 / 旧 blob 字节不变）
// ────────────────────────────────────────────────────────────

#[test]
fn legacy_default_slot_value_survives_code_removal() {
    // Arrange：旧版本写下的遗留槽数据（只能落物理层——槽位 API 已关门）
    const LEGACY_VALUE: &str = "sk-legacy-fixture-value";
    let s = store();
    s.seed_legacy_default_for_tests(LEGACY_VALUE);
    // Act：走一圈现存**可达**的操作（合法槽位读写清）+ **尝试**抹除旧槽
    //（守卫若缺失，这一步会真的把旧数据删掉 ⇒ 下面的判据才咬得住）
    s.save_key("provider:p1", "sk-p1-fixture").expect("合法槽位可写");
    let erase_attempt = s.clear_key(LEGACY_DEFAULT_SCOPE);
    s.clear_key("provider:p1").expect("合法槽位可清");
    // Assert ①（本判据的**具名**红点）：旧键与旧值**都还在**
    //（键与值都可读 ⇒ 没有任何 DELETE / 覆盖写动过它）
    assert_eq!(
        s.read_legacy_default_for_tests().as_deref(),
        Some(LEGACY_VALUE),
        "已存数据必须仍在（本次不抹除任何已存数据）"
    );
    // Assert ②：那次尝试是**被显式拒绝**的（不是静默成功、也不是静默失败）
    assert!(erase_attempt.is_err(), "旧槽清除必须被拒绝（具名错误）");
}

/// 旧凭据 blob 的**物理文件**：合法槽位操作一律不得碰它（字节级对拍）。
#[cfg(target_os = "windows")]
#[test]
fn legacy_blob_file_untouched_by_legal_slot_ops() {
    // Arrange：造一个"数据目录"，旧 blob 落哨兵字节（不调 DPAPI——只做文件 I/O）
    const SENTINEL: &[u8] = b"legacy-blob-fixture-bytes";
    let dir = std::env::temp_dir().join(format!("ed-t25-legacy-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("建临时目录");
    let legacy_path: PathBuf = dir.join("ai_credentials.bin");
    std::fs::write(&legacy_path, SENTINEL).expect("写旧 blob 哨兵");
    let store = crate::ai_credentials::DpapiCredentialStore { path: legacy_path.clone() };
    // Act：合法槽位操作 + 对旧槽的三种尝试（全拒）
    assert_eq!(store.load_key("provider:p1").expect("合法槽位读取"), None);
    store.clear_key("provider:p1").expect("合法槽位清除幂等");
    assert!(store.save_key(LEGACY_DEFAULT_SCOPE, "x").is_err(), "旧槽写入被拒");
    assert!(store.load_key(LEGACY_DEFAULT_SCOPE).is_err(), "旧槽读取被拒");
    assert!(store.clear_key(LEGACY_DEFAULT_SCOPE).is_err(), "旧槽清除被拒");
    // Assert：旧 blob 文件仍在且**字节不变**（物理键未被删/未被覆写）
    let after = std::fs::read(&legacy_path).expect("旧 blob 文件必须仍在");
    assert_eq!(after, SENTINEL, "旧凭据文件字节必须原样保留（不删、不覆写）");
    std::fs::remove_dir_all(&dir).ok();
}
