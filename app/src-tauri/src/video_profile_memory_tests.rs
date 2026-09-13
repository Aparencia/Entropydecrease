//! 画面档记忆通道单测（批 7 T19 · 规格 §1 L5 行 34「记忆加 tier 字段」）。
//!
//! @ai-context: 由 video_profile_memory.rs 以 `#[cfg(test)] #[path]` 引入，保持
//!              实现文件 ≤300 行（AGENTS.md §3）。
//! @ai-context: 主判据 = **跨会话记住**（§11-8 的实质）：写入 ⇒ save ⇒ **重新 load
//!              同一文件**（= 新进程的语义）⇒ 同标题/同系列读回同一档。真机
//!              「关闭并重开会话」本批不可达（C6.4），本文件是它的机器等价形态。
//! @ai-context: AAA 模式；只用 tempfile（不触碰真实数据目录，AGENTS.md §3.7）。

use super::*;
use crate::video_profile_spec::VisualTier;

/// 跨会话记住（§11-8 的具名断言）：save → 重新 load → lookup_tier 返回同一档。
#[test]
fn tier_survives_reload_same_title() {
    // Arrange：写档 → 落盘
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("profile_memory.json");
    let mut memory = ProfileMemory::default();
    memory.remember_tier("零基础化妆教程", VisualTier::Rich);
    memory.save(&path).unwrap();
    // Act：**重新 load**（= 新进程）——旧进程的内存态不参与
    let reopened = ProfileMemory::load(&path);
    // Assert：新会话读到的档 == 上次选的档
    assert_eq!(reopened.lookup_tier("零基础化妆教程"), Some(VisualTier::Rich));
    // 负控：同库未记过的标题不得命中（防"恒返回某档"的假绿）
    assert_eq!(reopened.lookup_tier("未记过的标题"), None);
}

/// 跨会话 + 系列键：P1 选高档 ⇒ 重开进程后 P5 仍读回高档（同系列各集共享）。
#[test]
fn tier_survives_reload_across_series_episodes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("profile_memory.json");
    let mut memory = ProfileMemory::default();
    memory.remember_tier("零基础化妆教程 P1", VisualTier::Rich);
    memory.save(&path).unwrap();
    // Assert：系列条目键已是系列名（剥序号）
    let reopened = ProfileMemory::load(&path);
    assert!(reopened.tier_entries[0].is_series, "前置条件：系列键标记");
    assert_eq!(reopened.lookup_tier("零基础化妆教程 P5"), Some(VisualTier::Rich));
}

/// 旧 JSON 零迁移：不含 tier_entries 的旧库 → load 不失败 + lookup_tier 返回 None。
#[test]
fn tier_old_json_without_channel_loads() {
    // Arrange：v0.13.6 及更早的记忆库形状（无 tier_entries；条目缺 is_series）
    let raw = r#"{"entries":[{"keyword":"网课","kind":"lecture"}]}"#;
    // Act
    let memory: ProfileMemory = serde_json::from_str(raw).unwrap();
    // Assert：新字段走 serde 缺省（空通道）——不阻断启动、不误命中
    assert!(memory.tier_entries.is_empty(), "缺省空通道");
    assert_eq!(memory.lookup_tier("网课"), None, "旧库无档位记忆");
    assert_eq!(memory.lookup("网课"), Some(ProfileKind::Lecture), "kind 通道零回归");
}

/// 通道隔离：tier-only 条目不污染 kind/form 两条既有读取（分离通道的理由）。
#[test]
fn tier_channel_does_not_pollute_kind_or_form() {
    let mut memory = ProfileMemory::default();
    memory.remember_tier("网课-数学", VisualTier::Rich);
    // Assert：只记了档位 ⇒ legacy kind 与 form 均无命中
    assert_eq!(memory.lookup("网课-数学"), None);
    assert_eq!(memory.lookup_form("网课-数学"), None);
    assert_eq!(memory.lookup_tier("网课-数学"), Some(VisualTier::Rich));
}

/// 空键拒绝（不记悬挂条目）；同键覆盖（不追加重复条目）。
#[test]
fn tier_empty_key_rejected_and_same_key_overwrites() {
    let mut memory = ProfileMemory::default();
    memory.remember_tier("   ", VisualTier::Low);
    assert!(memory.tier_entries.is_empty(), "空键不入库");
    memory.remember_tier("高等数学", VisualTier::Low);
    memory.remember_tier("高等数学", VisualTier::Rich);
    assert_eq!(memory.tier_entries.len(), 1, "同键覆盖不追加重");
    assert_eq!(memory.lookup_tier("高等数学"), Some(VisualTier::Rich));
}

/// 最长关键词优先（与 lookup/lookup_domain 同口径）。
#[test]
fn tier_longest_keyword_wins() {
    let mut memory = ProfileMemory::default();
    memory.remember_tier("网课", VisualTier::Low);
    memory.remember_tier("网课-数学", VisualTier::Rich);
    assert_eq!(memory.lookup_tier("网课-数学 第一章"), Some(VisualTier::Rich));
}
