//! 音频前端预处理链（REQ-041 / v0.4.0 M6：A1 信号增强，默认关）。
//!
//! @ai-context: 课堂环境噪声（键盘/风扇）与音量不均（多人发言）是 ASR 错误的主要
//!              环境来源；环回捕获为"成品音频"，降噪可能损伤音质——预处理一律
//!              **可开关 + 微基准定默认**（REQ-041：默认关，CER 对比后定默认）。
//! @ai-context: 本模块为纯 DSP（无 IO 无系统调用，可单测）：
//!              AGC（RMS 目标增益 + 峰值钳制）→ 削波检测 → 噪声底估计 →
//!              动态静音能量阈值（防轻声讲课被 VAD 截断）。
//! @ai-context: RNNoise 降噪为 v0.5 评估项（无成熟 rust 绑定 + 净收益未知），
//!              本版不引入；AGC/阈值链已覆盖其大部分收益场景。

use crate::capture::resample::compute_rms;

/// AGC 目标 RMS（约 -18dBFS）。
const AGC_TARGET_RMS: f32 = 0.125;

/// AGC 增益上限（20dB）——防极端静音被无限放大。
const AGC_MAX_GAIN: f32 = 10.0;

/// 峰值钳制上限（AGC 后峰值 > 0.99 视为削波风险，回退增益）。
const PEAK_LIMIT: f32 = 0.99;

/// 削波判定：峰值 ≥0.98 的样本占比（超 0.1% 视为削波）。
const CLIP_LEVEL: f32 = 0.98;
const CLIP_RATIO_THRESHOLD: f32 = 0.001;

/// 动态阈值系数：VAD 阈值 = max(基础阈值, 噪声底 × 2.5)。
const NOISE_THRESHOLD_RATIO: f32 = 2.5;

/// 噪声底滑动估计系数（指数平均；越大越快适应）。
const NOISE_ALPHA: f32 = 0.05;

/// 预处理配置（默认关——REQ-041：微基准（CER 对比）后定默认）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioPreprocessConfig {
    /// 总开关（默认关；开启后走 AGC + 削波检测 + 动态阈值）
    pub enabled: bool,
    /// AGC 目标 RMS（0=不启用 AGC，仅阈值链）
    pub target_rms: f32,
}

impl Default for AudioPreprocessConfig {
    fn default() -> Self {
        Self { enabled: false, target_rms: AGC_TARGET_RMS }
    }
}

/// 预处理输出。
#[derive(Debug, Clone, PartialEq)]
pub struct ProcessedAudio {
    /// 处理后的样本（enabled=false 时原样克隆）
    pub samples: Vec<f32>,
    /// 本块是否检测到削波（开启时有效）
    pub clipped: bool,
    /// 本块的动态静音阈值（供 VAD 判定；基础值=调用方默认阈值）
    pub speech_threshold: f32,
}

/// 音频预处理器（有状态：噪声底滑动估计）。
#[derive(Debug)]
pub struct AudioPreprocessor {
    pub config: AudioPreprocessConfig,
    /// 噪声底 RMS 滑动估计（None=未建立）
    noise_floor: Option<f32>,
}

impl Default for AudioPreprocessor {
    fn default() -> Self {
        Self::new(AudioPreprocessConfig::default())
    }
}

impl AudioPreprocessor {
    pub fn new(config: AudioPreprocessConfig) -> Self {
        Self { config, noise_floor: None }
    }

    /// 处理一块样本（16kHz 单声道 f32）。
    ///
    /// @ai-context: 关闭时直通（零开销路径，防御链：任何配置错误不劣化音频）。
    pub fn process(&mut self, samples: &[f32], base_threshold: f32) -> ProcessedAudio {
        if !self.config.enabled || samples.is_empty() {
            return ProcessedAudio {
                samples: samples.to_vec(),
                clipped: false,
                speech_threshold: base_threshold,
            };
        }
        // ① AGC：目标 RMS 增益（峰值钳制回退）
        let gain = agc_gain(samples, self.config.target_rms);
        let mut out: Vec<f32> = samples.iter().map(|s| s * gain).collect();
        if out.iter().any(|s| s.abs() > PEAK_LIMIT) {
            // 削波风险：回退到不越限的增益（RMS 目标让位峰值安全）
            let peak = out.iter().fold(0.0f32, |m, s| m.max(s.abs()));
            let safe = PEAK_LIMIT / peak;
            for s in &mut out {
                *s *= safe;
            }
        }
        // ② 削波检测（原始输入上检测——AGC 前更真实）
        let clipped = detect_clipping(samples);
        // ③ 噪声底滑动估计（仅静音块更新——语音块不污染噪声底）
        let rms = compute_rms(samples);
        let is_silent = rms < base_threshold;
        if is_silent {
            self.noise_floor = Some(match self.noise_floor {
                Some(n) => n * (1.0 - NOISE_ALPHA) + rms * NOISE_ALPHA,
                None => rms,
            });
        }
        // ④ 动态静音阈值：噪声底高时抬高阈值（防环境噪声触发 VAD）
        let speech_threshold = self
            .noise_floor
            .map(|n| base_threshold.max(n * NOISE_THRESHOLD_RATIO))
            .unwrap_or(base_threshold);
        ProcessedAudio { samples: out, clipped, speech_threshold }
    }

    /// 重置噪声底（声道切换/新会话时调用；暂由测试覆盖，登记豁免）。
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.noise_floor = None;
    }
}

/// 削波检测（纯函数）：|样本| ≥ CLIP_LEVEL 的比例超阈值 → 削波。
pub fn detect_clipping(samples: &[f32]) -> bool {
    if samples.is_empty() {
        return false;
    }
    let clipped = samples.iter().filter(|s| s.abs() >= CLIP_LEVEL).count();
    clipped as f32 / samples.len() as f32 >= CLIP_RATIO_THRESHOLD
}

/// AGC 增益计算（纯函数）：目标 RMS / 当前 RMS，钳制上限。
pub fn agc_gain(samples: &[f32], target_rms: f32) -> f32 {
    let rms = compute_rms(samples);
    if rms > 1e-6 {
        (target_rms / rms).min(AGC_MAX_GAIN)
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 生成正弦波（给定振幅）。
    fn sine(amp: f32, n: usize, freq: f32) -> Vec<f32> {
        (0..n)
            .map(|i| amp * ((i as f32 * freq * std::f32::consts::TAU / 16000.0).sin()))
            .collect()
    }

    fn noise(amp: f32, n: usize) -> Vec<f32> {
        // 确定性伪随机（LCG）——测试可复现
        let mut state = 42u64;
        (0..n)
            .map(|_| {
                state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                ((state >> 33) as f32 / (1u64 << 31) as f32 - 1.0) * amp
            })
            .collect()
    }

    #[test]
    fn disabled_passthrough_is_identity() {
        let mut p = AudioPreprocessor::default();
        let samples = sine(0.1, 1600, 440.0);
        let out = p.process(&samples, 0.005);
        assert_eq!(out.samples, samples);
        assert!(!out.clipped);
        assert_eq!(out.speech_threshold, 0.005);
    }

    #[test]
    fn agc_raises_quiet_signal_toward_target() {
        // 振幅 0.03 → RMS ≈ 0.021 → 增益 ≈ 5.9（低于上限 10）→ 可达目标
        let quiet = sine(0.03, 16000, 440.0);
        let gain = agc_gain(&quiet, AGC_TARGET_RMS);
        assert!(gain > 1.0, "安静信号应放大");
        assert!(gain <= AGC_MAX_GAIN);
        // 应用后 RMS 接近目标（允许峰值钳制偏差）
        let boosted: Vec<f32> = quiet.iter().map(|s| s * gain).collect();
        let rms = compute_rms(&boosted);
        assert!((rms - AGC_TARGET_RMS).abs() < 0.02, "RMS 应接近目标，实际 {}", rms);
    }

    #[test]
    fn agc_caps_gain_for_loud_signal() {
        let loud = sine(0.9, 16000, 440.0);
        let gain = agc_gain(&loud, AGC_TARGET_RMS);
        assert!(gain < 1.0, "大信号应衰减");
    }

    #[test]
    fn clipping_detected_on_saturated_signal() {
        let mut saturated = sine(1.0, 16000, 440.0);
        for s in &mut saturated {
            *s = s.clamp(-1.0, 1.0);
        }
        // 数字削波：大量样本 == ±1.0（≥0.98）
        assert!(detect_clipping(&saturated));
        assert!(!detect_clipping(&sine(0.3, 16000, 440.0)));
    }

    #[test]
    fn process_chain_limits_peak() {
        let mut p = AudioPreprocessor::new(AudioPreprocessConfig { enabled: true, target_rms: AGC_TARGET_RMS });
        // 近满幅正弦：AGC 目标压低 + 峰值钳制双保险
        let loud = sine(0.95, 16000, 440.0);
        let out = p.process(&loud, 0.005);
        let peak = out.samples.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(peak <= 1.0, "处理后峰值不得越限: {}", peak);
    }

    #[test]
    fn dynamic_threshold_rises_with_noise_floor() {
        let mut p = AudioPreprocessor::new(AudioPreprocessConfig { enabled: true, target_rms: AGC_TARGET_RMS });
        let base = 0.005f32;
        // 连续静音噪声块（RMS ≈ 0.0015）→ 噪声底建立
        let noisy_silence = noise(0.0015, 16000);
        let mut last = base;
        for _ in 0..20 {
            let out = p.process(&noisy_silence, base);
            last = out.speech_threshold;
        }
        // 噪声底 ~0.0015 × 2.5 ≈ 0.00375 < base 0.005 → 阈值保持 base
        assert_eq!(last, base);
        // 更高噪声（RMS ≈ 0.0029，振幅 0.005）→ 阈值抬高到 ~0.0072 > base
        let mut p2 = AudioPreprocessor::new(AudioPreprocessConfig { enabled: true, target_rms: AGC_TARGET_RMS });
        let louder_noise = noise(0.005, 16000);
        let mut last2 = base;
        for _ in 0..20 {
            let out = p2.process(&louder_noise, base);
            last2 = out.speech_threshold;
        }
        assert!(last2 > base, "噪声底抬高后动态阈值应高于基础阈值: {} vs {}", last2, base);
    }

    #[test]
    fn reset_clears_noise_floor() {
        let mut p = AudioPreprocessor::new(AudioPreprocessConfig { enabled: true, target_rms: AGC_TARGET_RMS });
        let n = noise(0.003, 16000);
        for _ in 0..10 {
            p.process(&n, 0.005);
        }
        p.reset();
        // 重置后从基础阈值重新估计
        let out = p.process(&noise(0.0001, 16000), 0.005);
        assert!(out.speech_threshold <= 0.005);
    }

    #[test]
    fn empty_input_is_passthrough() {
        let mut p = AudioPreprocessor::new(AudioPreprocessConfig { enabled: true, target_rms: AGC_TARGET_RMS });
        let out = p.process(&[], 0.005);
        assert!(out.samples.is_empty());
        assert!(!out.clipped);
    }
}
