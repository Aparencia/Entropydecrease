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
