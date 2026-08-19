//! VAD 阈值自适应单测（REQ-069 / v0.6.0 M4）。
//!
//! @ai-context: AAA 模式；合成音量变化样本（安静→语音→安静）验证阈值跟随
//!              噪声底、语音不误判静音、平滑限幅、关闭开关零回归。

use super::*;

const BASE: f32 = 0.005;

#[test]
fn disabled_returns_base_threshold_always() {
    // Arrange：关闭开关
    let mut vad = AdaptiveVad::new(AdaptiveVadConfig { enabled: false });
    // Act：任意能量输入
    let t1 = vad.next_threshold(0.1, BASE);
    let t2 = vad.next_threshold(0.0001, BASE);
    // Assert：恒为基础阈值（零回归）
    assert_eq!(t1, BASE);
    assert_eq!(t2, BASE);
}

#[test]
fn threshold_tracks_noise_floor_after_silence() {
    // Arrange：安静环境（低噪声 0.0008）
    let mut vad = AdaptiveVad::new(AdaptiveVadConfig::default());
    // Act：喂 200 块安静能量
    for _ in 0..200 {
        vad.next_threshold(0.0008, BASE);
    }
    // Assert：阈值收敛到噪声底 × 3（≈0.0024 + 下限兜底）——低于基础阈值 0.005
    let t = vad.current_threshold();
    assert!(t > 0.0015 && t < 0.005, "安静环境阈值应低于固定阈值，实得 {}", t);
}

#[test]
fn loud_environment_raises_threshold() {
    // Arrange：高噪声环境（0.02——风扇/空调）
    let mut vad = AdaptiveVad::new(AdaptiveVadConfig::default());
    // Act：喂 200 块
    for _ in 0..200 {
        vad.next_threshold(0.02, BASE);
    }
    // Assert：阈值 ≈ 0.06（0.02×3）——高于固定阈值（防噪声被当语音）
    let t = vad.current_threshold();
    assert!(t > 0.03 && t < 0.08, "高噪声阈值应高于固定阈值，实得 {}", t);
}

#[test]
fn speech_blocks_not_misclassified_as_silence() {
    // Arrange：安静噪声底 0.001 + 语音 0.1——自适应阈值远低于语音 RMS
    let mut vad = AdaptiveVad::new(AdaptiveVadConfig::default());
    for _ in 0..200 {
        vad.next_threshold(0.001, BASE);
    }
    let threshold = vad.current_threshold();
    // Act & Assert：语音 RMS 0.1 远高于阈值 → 不误判静音
    assert!(0.1 > threshold, "语音不得被误判静音（阈值 {}）", threshold);
    // 语音期间继续喂：P10 抗语音污染——阈值不抬升到语音量级（不下降）
    let before = threshold;
    for _ in 0..50 {
        vad.next_threshold(0.1, BASE);
    }
    let after = vad.current_threshold();
    assert!(after < 0.05, "语音能量不应把阈值拉到语音量级（实得 {}）", after);
    assert!(after >= before - 1e-4, "语音块不得拉低噪声底估计（{} vs {}）", after, before);
}

#[test]
fn threshold_change_is_smooth() {
    // Arrange：环境骤变（安静 → 大声）
    let mut vad = AdaptiveVad::new(AdaptiveVadConfig::default());
    for _ in 0..100 {
        vad.next_threshold(0.001, BASE);
    }
    let before = vad.current_threshold();
    // Act：单块大声（突发噪声）
    vad.next_threshold(0.5, BASE);
    let after = vad.current_threshold();
    // Assert：单块变化 ≤ 20% 相对步长（防误切）
    let ratio = (after - before).abs() / before.max(1e-6);
    assert!(ratio <= MAX_STEP_RATIO + 0.01, "单块变化应限幅，实得 {}", ratio);
}

#[test]
fn empty_history_uses_base() {
    // Act & Assert：首块（历史空）→ 预热期恒返回基础阈值（不 panic、不误建噪声底）
    let mut vad = AdaptiveVad::new(AdaptiveVadConfig::default());
    let t = vad.next_threshold(0.01, BASE);
    assert_eq!(t, BASE, "预热期应恒返回基础阈值");
    assert!(vad.current_threshold() > 0.0);
}

#[test]
fn percentile_basic() {
    // Act & Assert：P10 分位数（升序 1..5 的 10% ≈ 第 0 位）
    let mut v = VecDeque::new();
    for i in 1..=5 {
        v.push_back(i as f32);
    }
    assert_eq!(percentile(&v, 0.10), 1.0);
    assert_eq!(percentile(&v, 1.0), 5.0);
    assert_eq!(percentile(&VecDeque::new(), 0.5), 0.0);
}
