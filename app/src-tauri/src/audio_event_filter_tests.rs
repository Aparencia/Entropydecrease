//! 音频事件过滤单测（REQ-105 / v0.7.0 M1，M14）。
//!
//! @ai-context: AAA 模式；合成样本（正弦波/噪声调制）不依赖真实模型/音频
//!              文件（testing.md §2 Mock 隔离）；覆盖：通知音命中、语音不
//!              命中（时长/ZCR 两路）、语音中间短音不误杀、长音不命中、
//!              JSON 配置 roundtrip/缺失默认/校准生效、空输入防御。

use super::*;

/// 合成纯音（正弦波 + 线性包络）。amp=峰值幅度，dur=时长(s)。
///
/// @ai-context: 包络（前 10% 淡入/后 10% 淡出）模拟通知音，防首尾咔哒声；
///              包络只改幅度不改符号翻转频率 → ZCR 仍恒定（纯音特征）。
fn synth_tone(sample_rate: u32, freq: f32, dur_secs: f32, amp: f32) -> Vec<f32> {
    let n = (sample_rate as f32 * dur_secs) as usize;
    let fade = 0.1 * dur_secs;
    (0..n)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            let env = (t / fade).min(1.0).min((dur_secs - t) / fade).max(0.0);
            (2.0 * std::f32::consts::PI * freq * t).sin() * amp * env
        })
        .collect()
}

/// 合成语音样噪声（白噪声突发 + 静音间隔交替——模拟语音有声/无声能量起伏）。
///
/// @ai-context: 振幅调制不改变噪声的过零率（ZCR 尺度不变），故用"突发+间隔"
///              结构制造窗口间 ZCR 波动（0.5 ↔ 0），保证 ZCR 稳定性判据
///              能区分语音与纯音——这是检测器的判别核心。
fn synth_speech(sample_rate: u32, dur_secs: f32, amp: f32) -> Vec<f32> {
    let n = (sample_rate as f32 * dur_secs) as usize;
    let burst = sample_rate as usize / 20; // 50ms 白噪声突发
    let gap = burst / 2; // 25ms 静音间隔
    let mut state: u32 = 0xDEAD_BEEF; // LCG 伪随机（确定性；无 rand 依赖）
    let mut out = Vec::with_capacity(n);
    let mut i = 0;
    while i < n {
        let blen = burst.min(n - i);
        for _ in 0..blen {
            state = state.wrapping_mul(1664525).wrapping_add(1013904223);
            let v = ((state >> 8) as f32 / (1 << 24) as f32) * 2.0 - 1.0;
            out.push(v * amp);
        }
        i += blen;
        let glen = gap.min(n - i);
        out.extend(std::iter::repeat_n(0.0f32, glen));
        i += glen;
    }
    out
}

#[test]
fn notification_tone_after_silence_suppressed() {
    // Arrange：2 块静音前置 + 0.3s 880Hz 通知音（正弦波 + 包络）
    let sr: u32 = 16_000;
    let silent_block = vec![0.0f32; (sr / 5) as usize]; // 200ms 静音块
    let tone = synth_tone(sr, 880.0, 0.3, 0.3);
    let mut filter = AudioEventFilter::default();
    // Act：先喂 2 块静音，再喂通知音
    let d1 = filter.observe(&silent_block, sr, true);
    let d2 = filter.observe(&silent_block, sr, true);
    let d3 = filter.observe(&tone, sr, false);
    // Assert：静音块不 suppress；通知音命中且 suppress，计数累计
    assert!(!d1.should_suppress && !d2.should_suppress);
    assert!(d3.is_fixed_tone);
    assert!(d3.should_suppress);
    assert_eq!(filter.suppressed_count, 1);
}

// ── 审查 H4 修复（v0.7.0 新增代码审查）：跨块通知音延续抑制 ──

#[test]
fn multi_block_tone_suppressed_across_blocks() {
    // Arrange：0.8s 通知音 = 4 块（200ms/块）——跨块延续场景
    let sr: u32 = 16_000;
    let silent_block = vec![0.0f32; (sr / 5) as usize];
    let mut filter = AudioEventFilter::default();
    filter.observe(&silent_block, sr, true);
    filter.observe(&silent_block, sr, true);
    // Act：同一音的 4 个 200ms 块依次喂入（每块单独检测）
    let mut suppressed_blocks = 0;
    for _ in 0..4 {
        let block = synth_tone(sr, 880.0, 0.2, 0.3);
        let d = filter.observe(&block, sr, false);
        if d.should_suppress {
            suppressed_blocks += 1;
        }
    }
    // Assert：全部 4 块都抑制（H4 修复前仅首块抑制、延续块泄漏进 ASR）
    assert_eq!(suppressed_blocks, 4, "跨块通知音应全部抑制");
}

#[test]
fn suppressing_resets_on_speech_block() {
    // Arrange：通知音抑制后出现语音块 → 抑制态复位（不误杀后续语音）
    let sr: u32 = 16_000;
    let silent_block = vec![0.0f32; (sr / 5) as usize];
    let mut filter = AudioEventFilter::default();
    filter.observe(&silent_block, sr, true);
    filter.observe(&silent_block, sr, true);
    let tone = synth_tone(sr, 880.0, 0.2, 0.3);
    assert!(filter.observe(&tone, sr, false).should_suppress);
    // Act：语音块（噪声调制，非固定音）
    let speech_block = synth_speech(sr, 0.2, 0.3);
    let d = filter.observe(&speech_block, sr, false);
    // Assert：语音块不被抑制（非固定音）+ 抑制态复位
    assert!(!d.should_suppress);
    // 后续再出现通知音需重新满足前置静音（不因旧抑制态误判）
    let d2 = filter.observe(&tone, sr, false);
    assert!(!d2.should_suppress, "语音后通知音应重新判定（前置静音不足）");
}

#[test]
fn continuous_speech_not_fixed_tone() {
    // Arrange：噪声调制 2s（模拟连续语音）
    let sr: u32 = 16_000;
    let speech = synth_speech(sr, 2.0, 0.3);
    // Act & Assert：时长 >0.8s → 不判固定音
    assert!(!is_fixed_tone_pattern(&speech, sr));
}

#[test]
fn short_speech_like_noise_not_fixed_tone() {
    // Arrange：0.3s 噪声调制（时长/能量均符合，但 ZCR 窗口间不稳定）
    let sr: u32 = 16_000;
    let speech = synth_speech(sr, 0.3, 0.3);
    // Act & Assert：ZCR 不稳定 → 不判固定音（ZCR 判据独立生效）
    assert!(!is_fixed_tone_pattern(&speech, sr));
}

#[test]
fn short_tone_in_speech_not_suppressed() {
    // Arrange：语音块（非静音）后紧跟通知音——前置非静音
    let sr: u32 = 16_000;
    let mut filter = AudioEventFilter::default();
    let speech_block = synth_speech(sr, 0.3, 0.3);
    let tone = synth_tone(sr, 880.0, 0.3, 0.3);
    // Act：喂语音块（非静音），再喂通知音
    let _ = filter.observe(&speech_block, sr, false);
    let d = filter.observe(&tone, sr, false);
    // Assert：固定音命中但不 suppress（防误杀真实语音），计数不累计
    assert!(d.is_fixed_tone);
    assert!(!d.should_suppress);
    assert_eq!(filter.suppressed_count, 0);
}

#[test]
fn long_pure_tone_not_fixed_tone() {
    // Arrange：1.0s 纯音（>0.8s 时长上限）
    let sr: u32 = 16_000;
    let tone = synth_tone(sr, 880.0, 1.0, 0.3);
    // Act & Assert：时长超限 → 不判固定音
    assert!(!is_fixed_tone_pattern(&tone, sr));
}

#[test]
fn empty_and_zero_rate_inputs_safe() {
    // Act & Assert：空输入/采样率 0 → false（防御性，不 panic）
    assert!(!is_fixed_tone_pattern(&[], 16_000));
    assert!(!is_fixed_tone_pattern(&[0.0, 0.0], 0));
}

#[test]
fn disabled_filter_never_suppresses() {
    // Arrange：禁用过滤器（enabled=false）
    let sr: u32 = 16_000;
    let mut filter = AudioEventFilter { enabled: false, ..AudioEventFilter::default() };
    let silent_block = vec![0.0f32; (sr / 5) as usize];
    let tone = synth_tone(sr, 880.0, 0.3, 0.3);
    // Act：静音前置后喂通知音
    let _ = filter.observe(&silent_block, sr, true);
    let _ = filter.observe(&silent_block, sr, true);
    let d = filter.observe(&tone, sr, false);
    // Assert：不判固定音、不 suppress
    assert!(!d.is_fixed_tone);
    assert!(!d.should_suppress);
    assert_eq!(filter.suppressed_count, 0);
}

#[test]
fn json_config_roundtrip() {
    // Arrange：默认配置
    let cfg = AudioEventFilterConfig::default();
    // Act：序列化 → 解析
    let json = serde_json::to_string(&cfg).unwrap();
    let parsed = load_pattern_config(&json);
    // Assert：roundtrip 一致
    assert_eq!(parsed, cfg);
}

#[test]
fn json_config_missing_fields_use_defaults() {
    // Act：部分 JSON（只给时长；JSON 键与 Rust 字段同名 snake_case）
    let cfg = load_pattern_config(r#"{"max_duration_secs": 1.2}"#);
    // Assert：缺失字段用默认
    assert_eq!(cfg.max_duration_secs, 1.2);
    assert_eq!(cfg.rms_threshold, RMS_THRESHOLD);
    assert_eq!(cfg.zcr_stability_ratio, ZCR_STABILITY_RATIO);
}

#[test]
fn json_config_calibration_lowers_detection_threshold() {
    // Arrange：默认阈值下安静的短音不命中（RMS≈0.02 < 0.08）
    let sr: u32 = 16_000;
    let quiet_tone = synth_tone(sr, 880.0, 0.3, 0.03);
    assert!(!is_fixed_tone_pattern(&quiet_tone, sr));
    // Act：JSON 校准降低 rms_threshold → 该音命中并 suppress
    let cfg = load_pattern_config(r#"{"rms_threshold": 0.01}"#);
    let mut filter = AudioEventFilter::with_config(cfg);
    let silent_block = vec![0.0f32; (sr / 5) as usize];
    let _ = filter.observe(&silent_block, sr, true);
    let _ = filter.observe(&silent_block, sr, true);
    let d = filter.observe(&quiet_tone, sr, false);
    // Assert：可校准配置生效
    assert!(d.is_fixed_tone);
    assert!(d.should_suppress);
    assert_eq!(filter.suppressed_count, 1);
}

#[test]
fn invalid_json_falls_back_to_defaults() {
    // Act & Assert：损坏 JSON → 默认配置（防御性不阻断）
    let cfg = load_pattern_config("{not json");
    assert_eq!(cfg, AudioEventFilterConfig::default());
}
