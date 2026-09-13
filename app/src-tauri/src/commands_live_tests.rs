//! 会话启动档位单测（批 7 T19 · 规格 §1 L5 行 34「start_live_session 加 tier」）。
//!
//! @ai-context: 由 commands_live.rs 以 `#[cfg(test)] #[path]` 引入，保持实现文件 ≤300 行
//!              的拆分纪律（AGENTS.md §3；命令层无需 tauri State 即可测纯函数与共享槽）。
//! @ai-context: 主判据 = **档位随 start 生效**（①）：解析出的档位被预置进
//!              `profile_override` 槽——那是 screen worker 首拍消费并 retune 采样器的
//!              唯一通道（与 update_live_profile 同通道，后者是采集态热切换）。
//! @ai-context: 「跨会话记住」的另一半（③）在 video_profile_memory_tests.rs 的
//!              save/load 判据上（新进程 = 重新 load 同一文件）；本文件只测解析优先级。

use super::*;
use crate::video_profile::ProfileMemory;
use crate::video_profile_spec::VisualTier;

/// ① 显式入参优先（用户本次改档 ⇒ 覆盖记忆体）。
#[test]
fn start_tier_explicit_wins_over_memory() {
    let mut memory = ProfileMemory::default();
    memory.remember_tier("零基础化妆教程", VisualTier::Low);
    // Act：显式 rich + 记忆 low
    let resolved = resolve_start_tier(Some("rich"), &memory, "零基础化妆教程");
    // Assert
    assert_eq!(resolved, Some(VisualTier::Rich));
}

/// ①③ 无显式入参 ⇒ 记忆体兜底（新会话读到的档 == 上次选的档）。
#[test]
fn start_tier_falls_back_to_memory() {
    let mut memory = ProfileMemory::default();
    memory.remember_tier("零基础化妆教程 P1", VisualTier::Rich);
    // Act：前端未传（= 用户没改档）→ 走记忆（series 键，P5 同系列）
    let resolved = resolve_start_tier(None, &memory, "零基础化妆教程 P5");
    assert_eq!(resolved, Some(VisualTier::Rich));
    // 负控：无记忆 + 无显式 ⇒ None（**不覆写** ⇒ 既有默认档行为逐字不变）
    assert_eq!(resolve_start_tier(None, &ProfileMemory::default(), "零基础化妆教程"), None);
}

/// 非法显式值不阻断开始（按缺失处理，回落记忆——与 profile 参数同口径）。
#[test]
fn start_tier_invalid_explicit_falls_back() {
    let mut memory = ProfileMemory::default();
    memory.remember_tier("高等数学", VisualTier::Medium);
    assert_eq!(resolve_start_tier(Some("turbo"), &memory, "高等数学"), Some(VisualTier::Medium));
    assert_eq!(resolve_start_tier(Some(""), &ProfileMemory::default(), "高等数学"), None);
}

/// ① 档位随 start 生效：预置覆写槽（worker 首拍消费 ⇒ applied_tier 回读）。
#[test]
fn start_tier_seeds_override_slot() {
    // Arrange：与产物同一构造（LiveSessionManager::new 的槽）
    let manager = crate::live_session::LiveSessionManager::new();
    let slot = manager.profile_override_slot();
    // Act
    let seeded = seed_initial_tier(&slot, Some(VisualTier::Rich));
    // Assert：写入成功 + 槽内恰是「只带 tier」的覆写（form/domain 不受影响）
    assert!(seeded, "解析出档位必须写入槽");
    let taken = slot.lock().unwrap().take().expect("槽内应有覆写");
    assert_eq!(taken.tier, Some(VisualTier::Rich));
    assert_eq!(taken.form, None, "只写档位维——不覆写形态");
    assert_eq!(taken.domain, None, "只写档位维——不覆写领域");
    // None ⇒ 不动槽（既有行为零改动）
    assert!(!seed_initial_tier(&slot, None));
    assert!(slot.lock().unwrap().is_none(), "None 不得写槽");
}

/// 负控：预置的是**未确认的起点档**，不写 tier_override（降档确认槽——
/// 写它会绕过"降档需用户确认"，正是 start 内部按会话复位该槽的同一理由）。
#[test]
fn start_tier_does_not_touch_downgrade_confirm_slot() {
    let manager = crate::live_session::LiveSessionManager::new();
    let _ = seed_initial_tier(&manager.profile_override_slot(), Some(VisualTier::Low));
    assert!(manager.tier_override().lock().unwrap().is_none());
}

/// ① 的**接线面**（V9 类判据的补牙）：start_live_session 必须真的把解析结果写进覆写槽。
///
/// @ai-context: 纯单测只证明「函数本体对」——抓不到「函数写好了但没接线」（本批已知的
///              失效形态：定义在、调用点 0）。故对**剥注释后的源码文本**断言调用点存在；
///              注释里提一句不算接线（与 R8.9 的假阳同源，故先剥注释）。
#[test]
fn start_path_seeds_tier_into_override_slot() {
    // Arrange：剥行注释（含 `//` 的行只保留 `://` 之前的部分——防 URL 误切）
    let code: String = include_str!("commands_live.rs")
        .lines()
        .map(|l| if l.contains("://") { l } else { l.split("//").next().unwrap_or("") })
        .collect::<Vec<_>>()
        .join("\n");
    // Assert：解析结果 → seed_initial_tier（唯一落点）
    assert!(
        code.contains("seed_initial_tier(&override_slot, resolved_tier)"),
        "start_live_session 未接 seed_initial_tier ⇒ 档位不随 start 生效（①的接线面断了）"
    );
    // 且 starter 内部确实先解析档位（防"接了空值"）
    assert!(code.contains("resolve_start_tier(tier.as_deref()"), "档位解析未接入 start 路径");
}

/// 批 7 T19（R-11/§C51.4）记忆键规则：窗口标题优先；未选窗口用会话标题原文。
#[test]
fn memory_key_prefers_window_title() {
    assert_eq!(memory_key_for_start(Some("零基础化妆教程"), "实时课堂"), "零基础化妆教程");
    assert_eq!(memory_key_for_start(None, "实时课堂"), "实时课堂");
}

/// 🔴 批 7 T19（R-11/§C51.4）**未选窗口路径的跨会话判据**：写入 → 重新 load → 读回同一档；
/// 负控：无记忆 ⇒ None（不覆写 ⇒ 既有默认档行为）。
#[test]
fn none_window_path_tier_roundtrip_across_reload() {
    // Arrange：未选窗口（全屏）——键 = 前端传入的占位标题（净化去重之前）
    let key = memory_key_for_start(None, "实时课堂");
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("profile_memory.json");
    let mut memory = ProfileMemory::default();
    memory.remember_tier(&key, VisualTier::Rich);
    memory.save(&path).unwrap();
    // Act：**重新 load**（= 新进程/新会话）→ 走 start 的档位解析
    let reopened = ProfileMemory::load(&path);
    // Assert：新会话读到的档 == 写入的档
    assert_eq!(
        resolve_start_tier(None, &reopened, &key),
        Some(VisualTier::Rich),
        "未选窗口路径的跨会话记忆必须成立（R-11 缺陷点）"
    );
    // 负控：无记忆 ⇒ None（不覆写）
    assert_eq!(resolve_start_tier(None, &ProfileMemory::default(), &key), None);
}

/// 🔴 批 7 T19（R-11/§C51.4）**根因判据**：记忆键必须在 `dedupe_title` **之前**取，且**恰一处**。
///
/// @ai-context: 去重后缀（"(2)" 等）由 `dedupe_title` 逐会话派生 ⇒ 一旦它进键，同源第二次
///              会话就换了键，跨会话记忆必读不回。此判据按**源码顺序**钉住该不变式，并数
///              「`let memory_title` 绑定数 == 1」——防在 dedupe 之后再绑一次同名键把前置键
///              **遮蔽**（R-11 的缺陷形态正是"键取自去重后"）。注释已剥（注释里写一句不算）。
#[test]
fn memory_key_taken_before_dedupe() {
    let code: String = include_str!("commands_live.rs")
        .lines()
        .map(|l| if l.contains("://") { l } else { l.split("//").next().unwrap_or("") })
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(
        code.matches("let memory_title").count(),
        1,
        "记忆键绑定必须恰一处（多于一处 ⇒ 可被后置键遮蔽，R-11 缺陷形态）"
    );
    let key_pos = code.find("let memory_title = memory_key_for_start(").expect("记忆键取值点缺失");
    let dedupe_pos = code.find("dedupe_title(").expect("去重调用点缺失");
    let resolve_pos = code.find("resolve_start_tier(").expect("档位解析调用点缺失");
    assert!(
        key_pos < dedupe_pos,
        "记忆键必须在 dedupe_title 之前取（去重后缀进键 ⇒ 跨会话记忆必读不回，R-11 根因）"
    );
    assert!(dedupe_pos < resolve_pos, "档位解析必须在键确定之后（用同一把键）");
}
