//! 空闲降频状态机单测（REQ-073 / v0.6.0 M5）。
//!
//! @ai-context: AAA 模式；合成信号序列覆盖状态迁移全路径（Active→Pending→
//!              Idle→唤醒）、唤醒时序无竞态（信号瞬时生效）、探针语义。

use super::*;

fn governor() -> IdleGovernor {
    IdleGovernor::new(IdleGovernorConfig::default())
}

#[test]
fn silence_without_change_enters_idle_gradually() {
    // Arrange：静音 + 无画面变化（空闲从首个无信号拍起算）
    let mut g = governor();
    // Act：推进 11 拍（空闲满 10s）
    let mut now = 0u64;
    for _ in 0..11 {
        now += 1_000;
        g.observe(false, false, now);
    }
    // Assert：10s 后进入 IdlePending（未确认降频）
    assert_eq!(g.state(), IdleState::IdlePending);
    assert!(!g.is_idle());
    // 再推进 5s → Idle
    for _ in 0..5 {
        now += 1_000;
        g.observe(false, false, now);
    }
    assert_eq!(g.state(), IdleState::Idle);
    assert!(g.is_idle());
    assert_eq!(g.idle_since_ms(), now);
}

#[test]
fn speech_wakes_immediately() {
    // Arrange：进入 Idle
    let mut g = governor();
    let mut now = 0u64;
    for _ in 0..20 {
        now += 1_000;
        g.observe(false, false, now);
    }
    assert!(g.is_idle());
    // Act：语音恢复（下一拍）
    now += 1_000;
    let state = g.observe(true, false, now);
    // Assert：瞬时唤醒（无去抖延迟——默认 0）
    assert_eq!(state, IdleState::Active);
    assert!(!g.is_idle());
    assert_eq!(g.idle_since_ms(), 0);
}

#[test]
fn frame_change_wakes_immediately() {
    // Arrange：进入 Idle
    let mut g = governor();
    let mut now = 0u64;
    for _ in 0..20 {
        now += 1_000;
        g.observe(false, false, now);
    }
    // Act：画面变化（视频恢复，无声）
    now += 1_000;
    let state = g.observe(false, true, now);
    // Assert：唤醒（画面变化信号足够）
    assert_eq!(state, IdleState::Active);
}

#[test]
fn brief_signal_resets_idle_progress() {
    // Arrange：静音 5s（未到 10s）→ 一次语音 → 计时重置
    let mut g = governor();
    let mut now = 0u64;
    for _ in 0..5 {
        now += 1_000;
        g.observe(false, false, now);
    }
    assert_eq!(g.state(), IdleState::Active, "5s 未达阈值保持活跃");
    // Act：语音打断
    now += 1_000;
    g.observe(true, false, now);
    // Assert：活跃证据刷新（since_ms 重置）——再静音 10s 才进 Pending
    for _ in 0..9 {
        now += 1_000;
        g.observe(false, false, now);
    }
    assert_eq!(g.state(), IdleState::Active, "语音后静音 9s 不应进入 Pending");
    g.observe(false, false, now + 1_000);
    assert_eq!(g.state(), IdleState::IdlePending);
}

#[test]
fn active_signals_keep_active() {
    // Arrange：持续语音（无静音累积）
    let mut g = governor();
    let mut now = 0u64;
    for _ in 0..100 {
        now += 1_000;
        g.observe(true, false, now);
    }
    // Assert：永不进入降频
    assert_eq!(g.state(), IdleState::Active);
    assert!(!g.is_idle());
}

#[test]
fn wake_then_reidle_cycle() {
    // Arrange：完整周期——Idle → 唤醒 → 再次 Idle
    let mut g = governor();
    let mut now = 0u64;
    for _ in 0..20 {
        now += 1_000;
        g.observe(false, false, now);
    }
    assert!(g.is_idle());
    // 唤醒
    g.observe(true, false, now + 1_000);
    assert!(!g.is_idle());
    // 再次进入 Idle（15s）
    let mut now2 = now + 2_000;
    for _ in 0..15 {
        g.observe(false, false, now2);
        now2 += 1_000;
    }
    assert!(g.is_idle(), "唤醒后再次空闲应重新降频");
}

#[test]
fn wake_debounce_holds_state() {
    // Arrange：去抖 3s（信号需连续 3s 才唤醒——防单拍噪声唤醒）
    let cfg = IdleGovernorConfig { wake_debounce_ms: 3_000, ..Default::default() };
    let mut g = IdleGovernor::new(cfg);
    let mut now = 0u64;
    for _ in 0..20 {
        now += 1_000;
        g.observe(false, false, now);
    }
    assert!(g.is_idle());
    // Act：单拍语音（< 3s）
    g.observe(true, false, now + 1_000);
    assert!(g.is_idle(), "去抖期内单拍信号不唤醒");
    // 持续语音：+2s/+3s 仍未达 3s 连续时长
    g.observe(true, false, now + 2_000);
    g.observe(true, false, now + 3_000);
    assert!(g.is_idle(), "连续 2s 仍不足 3s 去抖");
    // 第 4 拍（距串起点 3s）→ 唤醒
    g.observe(true, false, now + 4_000);
    assert!(!g.is_idle(), "信号连续达去抖时长应唤醒");
}
