//! 音频处理纯函数（ADR-001）：混声道 / 线性重采样 / 定长切块 / RMS 静音判定。
//!
//! @ai-context: 全部为无副作用纯函数，可安全并发调用与独立单测（AGENTS.md §7）。
//! @ai-context: WASAPI 捕获输出为设备原生格式（常见 48kHz 多声道 float/PCM），
//!              下游 ASR（sherpa-onnx）与 VAD 要求 16kHz 单声道 Float32——本模块
//!              负责在投递前完成格式归一，切块粒度对齐 ASR 块输入（ADR-001）。

/// 目标采样率（sherpa-onnx 流式引擎要求 16kHz）。
pub const TARGET_SAMPLE_RATE: u32 = 16_000;

/// 多声道交错样本混为单声道（取均值）。
///
/// @ai-context: 输入为 interleaved（[L,R,L,R,...]），channels=0 视为单声道直通。
/// @ai-context: M6（REQ-041 A2）后实时链路改用 mixdown_prefer_cleanest（声道选优），
///              本函数保留供测试与参考（平均合并语义）。
#[allow(dead_code)]
pub fn mixdown_to_mono(input: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 || input.is_empty() {
        return input.to_vec();
    }
    let frames = input.len() / channels as usize;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let start = frame * channels as usize;
        let sum: f32 = input[start..start + channels as usize].iter().sum();
        mono.push(sum / channels as f32);
    }
    mono
}

/// 声道选优混音（REQ-041 / v0.4.0 M6：A2 声道策略）。
///
/// @ai-context: 立体声环回按声道 RMS 选能量最大声道（语音所在声道），
///              替代平均合并——单声道混入杂音时另一声道更干净；
///              单声道/空输入直通（与 mixdown_to_mono 行为一致）。
/// @ai-context: 边界防御（审查修复）：声道数超过样本数（无法组成完整帧）时
///              无法分帧选优 → 整段直通（不丢弃输入）；非整帧尾部样本
///              按帧粒度丢弃（WASAPI 交付完整交错帧，实际不触发）。
pub fn mixdown_prefer_cleanest(input: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 || input.is_empty() {
        return input.to_vec();
    }
    let frames = input.len() / channels as usize;
    if frames == 0 {
        // 声道数 > 样本数：无法组成完整帧，直通保数据（不静默丢弃）
        return input.to_vec();
    }
    // 每声道 RMS
    let mut best = 0usize;
    let mut best_rms = -1.0f32;
    for ch in 0..channels as usize {
        let mut sum_sq = 0.0f64;
        for frame in 0..frames {
            let v = input[frame * channels as usize + ch] as f64;
            sum_sq += v * v;
        }
        let rms = (sum_sq / frames as f64).sqrt() as f32;
        if rms > best_rms {
            best_rms = rms;
            best = ch;
        }
    }
    let mut out = Vec::with_capacity(frames);
    for frame in 0..frames {
        out.push(input[frame * channels as usize + best]);
    }
    out
}

/// 线性插值重采样（src_rate → dst_rate）。
///
/// @ai-context: 线性插值对语音信号足够（ASR 对相位不敏感），实现 O(n) 且无依赖；
///              比率相等时直通复制。目标速率必须 >0。
/// @ai-context: REQ-114（v0.7.0 M2，PRE-O2）：降采样场景请用
///              resample_antialias（本函数不抗混叠——混叠污染消除见独立模块）。
pub fn resample_linear(input: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    // src_rate=0 → ratio=0 → out_len 溢出 panic（审查 TD-009 二次确认：先防 dst_rate 后仍漏 src_rate）
    if input.is_empty() || src_rate == 0 || dst_rate == 0 {
        return Vec::new();
    }
    if src_rate == dst_rate {
        return input.to_vec();
    }
    let ratio = src_rate as f64 / dst_rate as f64;
    let out_len = ((input.len() as f64) / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let pos = i as f64 * ratio;
        let idx = pos.floor() as usize;
        let frac = (pos - idx as f64) as f32;
        let next = (idx + 1).min(input.len() - 1);
        out.push(input[idx] * (1.0 - frac) + input[next] * frac);
    }
    out
}

/// 定长切块累加器：攒满 target_samples 输出一块，剩余留待下次。
///
/// @ai-context: 捕获线程投递的包长度不定（WASAPI 包粒度与设备周期相关），
///              本结构保证输出块长度严格对齐（尾部不足时保留，结束后 flush 补齐）。
#[derive(Debug, Default)]
pub struct ChunkAccumulator {
    /// 目标块样本数（16kHz 下 200ms = 3200）
    target_samples: usize,
    buffer: Vec<f32>,
}

impl ChunkAccumulator {
    /// 新建累加器；target_samples=0 时按 200ms 默认（16kHz 下 3200 样本）。
    pub fn new(target_samples: usize) -> Self {
        let target = if target_samples == 0 {
            (TARGET_SAMPLE_RATE as usize) / 5
        } else {
            target_samples
        };
        Self { target_samples: target, buffer: Vec::with_capacity(target) }
    }

    /// 喂入样本，返回本次切出的完整块（可能 0 或 1 块）。
    pub fn push(&mut self, samples: &[f32]) -> Vec<Vec<f32>> {
        self.buffer.extend_from_slice(samples);
        let mut chunks = Vec::new();
        while self.buffer.len() >= self.target_samples {
            let chunk: Vec<f32> = self.buffer.drain(..self.target_samples).collect();
            chunks.push(chunk);
        }
        chunks
    }

    /// 取出剩余不足一块的样本（停止时调用，可空；
    /// 当前捕获停止时静默尾块直接丢弃——预留，登记豁免）。
    #[allow(dead_code)]
    pub fn flush(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.buffer)
    }
}

/// 均方根（RMS）：静音判定输入（ADR-003 静音隔块喂入）。
pub fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f64 = samples.iter().map(|s| (*s as f64) * (*s as f64)).sum();
    (sum / samples.len() as f64).sqrt() as f32
}

/// 把设备原生 PCM 字节流转换为 f32 样本（支持 16/24-bit 整数与 32-bit 浮点）。
///
/// @ai-context: WASAPI 常见格式为 WAVE_FORMAT_PCM(16bit) 与 IEEE_FLOAT(32bit)；
///              REQ-116（v0.7.0 M2，PRE-O5）：24-bit 左对齐解包（罕见设备
///              不再静默丢段——WAVEFORMATEXTENSIBLE 的 wValidBits 常见 24）；
///              8-bit 仍返回 None（WASAPI 渲染端点不产出 8-bit，防御性拒绝）。
pub fn pcm_bytes_to_f32(
    bytes: &[u8],
    bits_per_sample: u16,
    is_float: bool,
) -> Option<Vec<f32>> {
    match (bits_per_sample, is_float) {
        (16, false) => {
            let mut out = Vec::with_capacity(bytes.len() / 2);
            for chunk in bytes.chunks_exact(2) {
                let v = i16::from_le_bytes([chunk[0], chunk[1]]);
                out.push(v as f32 / 32768.0);
            }
            Some(out)
        }
        (24, false) => {
            let mut out = Vec::with_capacity(bytes.len() / 3);
            for chunk in bytes.chunks_exact(3) {
                // 左对齐解包：24bit 低字节在前（小端），符号扩展转 i32
                let u = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], 0]);
                let v = (u << 8) as i32 >> 8; // 算术右移 = 符号扩展（左对齐）
                out.push(v as f32 / 8388608.0); // 2^23
            }
            Some(out)
        }
        (32, true) => {
            let mut out = Vec::with_capacity(bytes.len() / 4);
            for chunk in bytes.chunks_exact(4) {
                out.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
            }
            Some(out)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixdown_stereo_averages_channels() {
        // Arrange：[L1,R1,L2,R2] 交错
        let input = [0.0, 1.0, 0.2, 0.4];
        // Act
        let mono = mixdown_to_mono(&input, 2);
        // Assert
        assert_eq!(mono, vec![0.5, 0.3]);
    }

    #[test]
    fn mixdown_mono_passthrough() {
        // Arrange & Act
        let mono = mixdown_to_mono(&[0.1, 0.2, 0.3], 1);
        // Assert：单声道直通，不改写
        assert_eq!(mono, vec![0.1, 0.2, 0.3]);
    }

    #[test]
    fn mixdown_empty_is_empty() {
        // Act & Assert
        assert!(mixdown_to_mono(&[], 2).is_empty());
    }

    #[test]
    fn prefer_cleanest_picks_louder_channel() {
        // M6/REQ-041 A2：L 声道干净语音（±0.5），R 声道混入小声噪声（±0.05）→ 选 L
        let mut input = Vec::new();
        for i in 0..200 {
            let l = 0.5 * ((i as f32) * 0.1).sin();
            let r = 0.05 * ((i as f32 * 3.7).sin());
            input.push(l);
            input.push(r);
        }
        let mono = mixdown_prefer_cleanest(&input, 2);
        // 输出应等于 L 声道序列
        let expected: Vec<f32> = input.iter().step_by(2).copied().collect();
        assert_eq!(mono, expected);
    }

    #[test]
    fn prefer_cleanest_mono_passthrough() {
        // 单声道直通
        assert_eq!(mixdown_prefer_cleanest(&[0.1, 0.2], 1), vec![0.1, 0.2]);
        assert!(mixdown_prefer_cleanest(&[], 2).is_empty());
    }

    #[test]
    fn prefer_cleanest_channels_gt_samples_passthrough() {
        // 审查修复：声道数超过样本数（无法组成完整帧）→ 直通保数据
        assert_eq!(mixdown_prefer_cleanest(&[0.1, 0.2, 0.3], 4), vec![0.1, 0.2, 0.3]);
    }

    #[test]
    fn resample_same_rate_is_copy() {
        // Arrange & Act
        let out = resample_linear(&[0.1, 0.2, 0.3], 16_000, 16_000);
        // Assert
        assert_eq!(out, vec![0.1, 0.2, 0.3]);
    }

    #[test]
    fn resample_down_halves_length() {
        // Arrange：48k → 16k，长度应为 1/3
        let input: Vec<f32> = (0..48).map(|i| i as f32).collect();
        // Act
        let out = resample_linear(&input, 48_000, 16_000);
        // Assert：长度 16（48/3），首样本一致
        assert_eq!(out.len(), 16);
        assert!((out[0] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn resample_up_extends_length() {
        // Arrange：16k → 48k，长度 x3
        let input: Vec<f32> = (0..10).map(|i| i as f32).collect();
        // Act
        let out = resample_linear(&input, 16_000, 48_000);
        // Assert
        assert_eq!(out.len(), 30);
    }

    #[test]
    fn resample_zero_src_rate_returns_empty() {
        // Arrange & Act：src_rate=0 曾导致 ratio=0 → out_len 溢出 panic（TD-009）
        let out = resample_linear(&[0.1, 0.2, 0.3], 0, 16_000);
        // Assert
        assert!(out.is_empty());
    }

    #[test]
    fn chunk_accumulator_cuts_exact_targets() {
        // Arrange：目标 4 样本
        let mut acc = ChunkAccumulator::new(4);
        // Act：喂 10 样本 → 应切出 2 块，剩余 2 样本
        let chunks = acc.push(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]);
        // Assert
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0], vec![1.0, 2.0, 3.0, 4.0]);
        assert_eq!(chunks[1], vec![5.0, 6.0, 7.0, 8.0]);
        assert_eq!(acc.flush(), vec![9.0, 10.0]);
    }

    #[test]
    fn chunk_accumulator_default_target_is_200ms() {
        // Arrange & Act
        let acc = ChunkAccumulator::new(0);
        let acc2 = ChunkAccumulator::new(TARGET_SAMPLE_RATE as usize / 5);
        // Assert：默认与显式 200ms 目标一致（3200 样本 @16kHz）
        assert_eq!(acc.target_samples, acc2.target_samples);
        assert_eq!(acc.target_samples, 3200);
    }

    #[test]
    fn rms_silence_is_zero_and_speech_positive() {
        // Act & Assert
        assert_eq!(compute_rms(&[0.0; 100]), 0.0);
        assert!(compute_rms(&[0.5; 100]) > 0.4);
        assert_eq!(compute_rms(&[]), 0.0);
    }

    #[test]
    fn pcm16_converts_and_scales() {
        // Arrange：i16 32767 → ~1.0；-32768 → -1.0
        let bytes = [0xFF, 0x7F, 0x00, 0x80];
        // Act
        let out = pcm_bytes_to_f32(&bytes, 16, false).expect("16bit pcm");
        // Assert：32767/32768 浮点精度下约等于 1.0
        assert!((out[0] - 1.0).abs() < 1e-4);
        assert_eq!(out[1], -1.0);
    }

    #[test]
    fn pcm32float_passthrough() {
        // Arrange
        let bytes = 0.5f32.to_le_bytes().to_vec();
        // Act
        let out = pcm_bytes_to_f32(&bytes, 32, true).expect("32bit float");
        // Assert
        assert_eq!(out, vec![0.5]);
    }

    #[test]
    fn unsupported_format_returns_none() {
        // Act & Assert：8-bit 不支持（WASAPI 渲染端点不产出，防御性拒绝）
        assert!(pcm_bytes_to_f32(&[0u8; 1], 8, false).is_none());
        assert!(pcm_bytes_to_f32(&[0u8; 3], 24, true).is_none(), "24bit float 非法组合");
    }

    // ── REQ-116（v0.7.0 M2，PRE-O5）：24-bit 左对齐解包 ──

    #[test]
    fn pcm24_left_aligned_max_positive() {
        // Arrange：0x7FFFFF（24bit 最大正数，左对齐）→ ~1.0
        let bytes = [0xFF, 0xFF, 0x7F];
        // Act
        let out = pcm_bytes_to_f32(&bytes, 24, false).expect("24bit pcm");
        // Assert：8388607/8388608 ≈ 1.0
        assert!((out[0] - 1.0).abs() < 1e-4, "got {}", out[0]);
    }

    #[test]
    fn pcm24_left_aligned_max_negative() {
        // Arrange：0x800000（24bit 最小负数）→ -1.0
        let bytes = [0x00, 0x00, 0x80];
        // Act
        let out = pcm_bytes_to_f32(&bytes, 24, false).expect("24bit pcm");
        // Assert：-8388608/8388608 = -1.0
        assert_eq!(out[0], -1.0);
    }

    #[test]
    fn pcm24_zero_and_midpoint() {
        // 零 → 0.0
        assert_eq!(pcm_bytes_to_f32(&[0, 0, 0], 24, false).unwrap()[0], 0.0);
        // 半幅正（0x400000 = 2^22）→ 0.5
        let half = pcm_bytes_to_f32(&[0x00, 0x00, 0x40], 24, false).unwrap()[0];
        assert!((half - 0.5).abs() < 1e-4, "got {}", half);
    }

    #[test]
    fn pcm24_multi_sample_interleaved() {
        // 多样本：正负交替
        let bytes = [0xFF, 0xFF, 0x7F, 0x00, 0x00, 0x80];
        let out = pcm_bytes_to_f32(&bytes, 24, false).expect("24bit pcm");
        assert_eq!(out.len(), 2);
        assert!((out[0] - 1.0).abs() < 1e-4);
        assert_eq!(out[1], -1.0);
    }
}
