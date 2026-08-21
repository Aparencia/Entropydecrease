//! 画面价值档位检测测试（REQ-189 / v0.9.0 M2）。
//!
//! @ai-context: AAA 模式；覆盖三信号投票矩阵（framework-v2 §2.2 检测规则表）、
//!              升降档裁决（升档静默/降档确认）、重评窗口聚合（短视频 2 分钟定档）。

use super::*;
use crate::video_profile_spec::VisualTier;

#[test]
fn vote_no_signal_keeps_placeholder() {
    // Arrange：无任何观测
    let s = TierSignals::default();
    // Act
    let v = vote_tier(&s);
    // Assert：不产档（None）——保持现状不乱动
    assert_eq!(v.tier, None);
    assert_eq!(v.votes, 0);
    assert!(v.needs_confirmation);
}

#[test]
fn vote_animation_tutorial_medium() {
    // Arrange：会话 33 类动画科普——高帧切换（动画）+ 间歇文字卡 + 图文混排
    let s = TierSignals {
        frame_switch_rate: Some(30.0), // 高 → 中档票
        ocr_density: Some(0.3),        // 间歇文字卡 → 中档票
        region_composition: Some(0.25), // 图文混排 → 中档票
    };
    // Act
    let v = vote_tier(&s);
    // Assert：三票全中档 → 中档高置信，无需确认
    assert_eq!(v.tier, Some(VisualTier::Medium));
    assert_eq!(v.votes, 3);
    assert!((v.confidence - 1.0).abs() < 1e-6);
    assert!(!v.needs_confirmation);
}

#[test]
fn vote_whiteboard_rich() {
    // Arrange：板书——中高帧切换（书写翻页）+ 持续满屏文字 + 结构区占比高
    let s = TierSignals {
        frame_switch_rate: Some(10.0), // 中高 → 高档票
        ocr_density: Some(0.8),        // 满屏 → 高档票
        region_composition: Some(0.6), // 结构区高 → 高档票
    };
    // Act/Assert：三票全高档
    let v = vote_tier(&s);
    assert_eq!(v.tier, Some(VisualTier::Rich));
    assert_eq!(v.votes, 3);
    assert!(!v.needs_confirmation);
}

#[test]
fn vote_talking_head_low() {
    // Arrange：口播——低帧切换 + 字幕为主（小面积文字）+ 几乎无区域
    let s = TierSignals {
        frame_switch_rate: Some(1.0), // 低 → 低档票
        ocr_density: Some(0.05),      // 字幕区小面积 → 低档票
        region_composition: Some(0.0), // 几乎无区域 → 低档票
    };
    // Act/Assert：三票全低档
    let v = vote_tier(&s);
    assert_eq!(v.tier, Some(VisualTier::Low));
    assert_eq!(v.votes, 3);
    assert!(!v.needs_confirmation);
}

#[test]
fn vote_pure_audio_none() {
    // Arrange：纯音频——无画面切换 + 零文字
    let s = TierSignals {
        frame_switch_rate: Some(0.0), // 0 次/分：<5 → 低档票
        ocr_density: Some(0.0),       // 零文字 → 无档票
        region_composition: None,
    };
    // Act：无档 vs 低档平票（各 1 票）
    let v = vote_tier(&s);
    // Assert：平票需确认；平票取**最高档**（保守不丢信息——降档有确认门禁）
    assert_eq!(v.tier, Some(VisualTier::Low));
    assert!(v.needs_confirmation);
}

#[test]
fn vote_conflict_requires_confirmation() {
    // Arrange：信号冲突——高切换（中档票）+ 满屏文字（高档票），无第三信号
    let s = TierSignals {
        frame_switch_rate: Some(30.0), // 中档票
        ocr_density: Some(0.9),        // 高档票
        region_composition: None,
    };
    // Act
    let v = vote_tier(&s);
    // Assert：平票需确认（两票各 1）；取高档（保守）
    assert!(v.needs_confirmation);
    assert_eq!(v.tier, Some(VisualTier::Rich));
}

#[test]
fn vote_single_signal_requires_confirmation() {
    // Arrange：仅一个信号（帧切换率中高）
    let s = TierSignals {
        frame_switch_rate: Some(10.0),
        ocr_density: None,
        region_composition: None,
    };
    // Act
    let v = vote_tier(&s);
    // Assert：单信号支持不足两票 → 需确认（不凭单一信号定档）
    assert_eq!(v.tier, Some(VisualTier::Rich));
    assert!(v.needs_confirmation);
}

// ── 升降档裁决（升档静默、降档确认）──

#[test]
fn upgrade_is_silent() {
    // Arrange/Act/Assert：低→中、中→高、低→高 全部静默
    assert_eq!(
        decide_change(Some(VisualTier::Low), Some(VisualTier::Medium)),
        TierChange::UpgradeSilent
    );
    assert_eq!(
        decide_change(Some(VisualTier::Medium), Some(VisualTier::Rich)),
        TierChange::UpgradeSilent
    );
    // 无档（纯音频）→ 有档也升档静默（播客/直播误判恢复）
    assert_eq!(
        decide_change(Some(VisualTier::None), Some(VisualTier::Low)),
        TierChange::UpgradeSilent
    );
}

#[test]
fn downgrade_requires_confirmation() {
    // Arrange/Act/Assert：高→中、中→低、高→低 全部需确认
    assert_eq!(
        decide_change(Some(VisualTier::Rich), Some(VisualTier::Medium)),
        TierChange::DowngradeConfirm
    );
    assert_eq!(
        decide_change(Some(VisualTier::Medium), Some(VisualTier::Low)),
        TierChange::DowngradeConfirm
    );
    assert_eq!(
        decide_change(Some(VisualTier::Rich), Some(VisualTier::Low)),
        TierChange::DowngradeConfirm
    );
}

#[test]
fn same_tier_no_change() {
    // Arrange/Act/Assert：同档不变；无票（None）不变
    assert_eq!(
        decide_change(Some(VisualTier::Medium), Some(VisualTier::Medium)),
        TierChange::None
    );
    assert_eq!(decide_change(None, Some(VisualTier::Medium)), TierChange::None);
    assert_eq!(decide_change(Some(VisualTier::Medium), None), TierChange::None);
    assert_eq!(decide_change(None, None), TierChange::None);
}

// ── 重评窗口聚合（会话中每 2-3 分钟；短视频 2 分钟内定档）──

/// 构造动画科普观测序列（窗口 150s：切换帧 + 间歇文字卡 + 图文混排结构）。
fn observe_animation(obs: &mut TierObserver, start: u64) {
    for secs in (start..start + 150).step_by(10) {
        // 每 10s 一组：3 帧中 1 帧有文字卡（面积 0.3）、1 帧结构区
        obs.observe(secs, true, Some(0.3), true);
        obs.observe(secs + 1, true, None, false);
        obs.observe(secs + 2, true, None, false);
    }
}

#[test]
fn observer_settles_medium_for_animation_within_window() {
    // Arrange：2.5 分钟窗口内动画科普观测（高切换 + 间歇文字 + 图文混排）
    let mut obs = TierObserver::new(0);
    // Act：模拟窗口观测（最后一次 observe 在窗口到期时刻，触发结算）
    observe_animation(&mut obs, 0);
    obs.observe(150, false, None, false); // 窗口到期帧 → settle
    // Assert：切换率高（45 次/2.5min=18/分→高档票 中高？）——核对信号：
    //   切换 45 次/2.5min = 18/分 → ≤20 → 高档票；文字面积 0.3 → 中档票；
    //   结构 15/46 ≈ 0.33 → 中档票 → 平票（高 1 / 中 2）→ 中档胜出
    assert_eq!(obs.current_tier(), Some(VisualTier::Medium));
}

#[test]
fn observer_slides_window_for_long_video() {
    // Arrange：长视频——片头动画（中档）→ 正片板书（高档）
    let mut obs = TierObserver::new(0);
    // Act：第一窗口（0-150s）动画观测 → 结算中档
    observe_animation(&mut obs, 0);
    obs.observe(150, false, None, false); // 窗口 1 到期 → settle（中档）
    assert_eq!(obs.current_tier(), Some(VisualTier::Medium));
    // 第二窗口（150-300s）板书观测（满屏文字面积 0.8 + 结构区）
    for secs in (150..300).step_by(10) {
        obs.observe(secs, true, Some(0.8), true);
        obs.observe(secs + 1, true, Some(0.8), true);
        obs.observe(secs + 2, false, Some(0.8), true);
    }
    obs.observe(300, false, None, false); // 窗口 2 到期 → settle
    // Assert：窗口滑动重评 → 升档高档（满屏文字 + 结构区高频 → 高票全中）
    assert_eq!(obs.current_tier(), Some(VisualTier::Rich));
}

#[test]
fn observer_no_observation_keeps_placeholder() {
    // Arrange：无任何观测（画面链未跑——OCR 短路等）
    let mut obs = TierObserver::new(0);
    // Act：窗口到期（无信号帧——不切换、无文字、无结构）
    obs.observe(150, false, None, false);
    // Assert：信号不足不产档（保持 None——上层用默认中档占位）
    assert_eq!(obs.current_tier(), None);
}

#[test]
fn observer_low_density_keeps_low_tier() {
    // Arrange：口播会话——低切换 + 字幕为主（小面积文字）
    let mut obs = TierObserver::new(0);
    // Act：150s 窗口内字幕观测（每 10s 一组：无切换、字幕面积 0.05）
    for secs in (0..150).step_by(10) {
        obs.observe(secs, false, Some(0.05), false);
        obs.observe(secs + 1, false, Some(0.05), false);
        obs.observe(secs + 2, false, Some(0.05), false);
    }
    obs.observe(150, false, None, false); // 窗口到期 → settle
    // Assert：无切换（低档票缺失——帧切换率 None 不投）+ 字幕面积 0.05（低档票）
    //   + 无结构（None）→ 单票低档需确认；首次定档取低档（口播语义）
    assert_eq!(obs.current_tier(), Some(VisualTier::Low));
}

#[test]
fn tier_vote_json_roundtrip() {
    // Arrange
    let v = TierVote { tier: Some(VisualTier::Medium), votes: 3, confidence: 1.0, needs_confirmation: false };
    // Act：JSON roundtrip（事件 payload 传输用）
    let raw = serde_json::to_string(&v).unwrap();
    let back: TierVote = serde_json::from_str(&raw).unwrap();
    // Assert：字段无损
    assert_eq!(back, v);
}
