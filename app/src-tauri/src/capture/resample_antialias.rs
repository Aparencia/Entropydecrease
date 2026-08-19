//! 抗混叠重采样（REQ-114 PRE-O2 / v0.7.0 M2）。
//!
//! @ai-context: 线性插值（resample.rs resample_linear）在降采样时会把高于目标
//!              奈奎斯特频率的成分混叠进带内（48k→16k 时 8-24kHz 噪声混入
//!              语音频带）。本模块：整数降采样（48k→16k=3:1）先 FIR 低通再
//!              抽取；非常数比率降采样先低通再线性插值；升采样/等率无混叠
//!              风险走线性插值。纯函数可单测。
//! @ai-context: 拆独立文件原因：resample.rs 超 300 行（AGENTS.md §3 硬约束）；
//!              与线性插值（基础工具）分离，本模块为 REQ-114 新增域。

/// 抗混叠重采样入口（REQ-114 PRE-O2）：降采样先低通，升采样/等率线性插值。
///
/// @ai-context: 整数降采样快速路径（step_by 抽取 O(n)）；非常数比率
///              （44.1k→16k）低通后线性插值；升采样无混叠风险直接线性。
pub fn resample_antialias(input: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if input.is_empty() || src_rate == 0 || dst_rate == 0 {
        return Vec::new();
    }
    if src_rate == dst_rate {
        return input.to_vec();
    }
    // 仅降采样需要抗混叠（升采样无混叠风险——线性插值即可）
    if src_rate < dst_rate {
        return super::resample::resample_linear(input, src_rate, dst_rate);
    }
    // 整数降采样快速路径：低通后按比例抽取
    let factor = (src_rate / dst_rate) as usize;
    if factor >= 2 && src_rate.is_multiple_of(dst_rate) {
        let filtered = fir_lowpass(input, factor);
        filtered.iter().step_by(factor).copied().collect()
    } else {
        // 非常数比率降采样：先低通（按比率估计截止）再线性插值
        let cutoff = dst_rate as f64 / src_rate as f64;
        let filtered = fir_lowpass_cutoff(input, cutoff);
        super::resample::resample_linear(&filtered, src_rate, dst_rate)
    }
}

/// FIR 低通（整数抽取用：截止 = 1/factor × 奈奎斯特；纯函数）。
///
/// @ai-context: sinc×Hamming 低通核——语音降采样场景的简单有效抗混叠；
///              窗口覆盖抽取后带外成分的主要混叠区。
fn fir_lowpass(input: &[f32], factor: usize) -> Vec<f32> {
    let cutoff = 1.0 / factor as f64;
    fir_lowpass_cutoff(input, cutoff)
}

/// FIR 低通（可变截止：cutoff 为相对奈奎斯特的归一化截止频率 0..1）。
fn fir_lowpass_cutoff(input: &[f32], cutoff: f64) -> Vec<f32> {
    let cutoff = cutoff.clamp(0.05, 1.0);
    let half_len = ((input.len().min(64) as f64) * cutoff).max(1.0) as usize;
    let window_len = half_len * 2 + 1;
    // 构造 sinc×Hamming 低通核（归一化）
    let mut kernel = Vec::with_capacity(window_len);
    let mut sum = 0.0f64;
    for i in 0..window_len {
        let n = i as i64 - half_len as i64;
        let x = n as f64 * std::f64::consts::PI * cutoff;
        let sinc = if n == 0 { 1.0 } else { x.sin() / x };
        // Hamming 窗
        let w = 0.54 - 0.46 * (2.0 * std::f64::consts::PI * i as f64 / (window_len - 1) as f64).cos();
        let v = sinc * w * cutoff;
        kernel.push(v);
        sum += v;
    }
    for k in &mut kernel {
        *k /= sum;
    }
    // 卷积（边界零填充——语音块边缘瞬态可接受）
    let mut out = vec![0.0f32; input.len()];
    for (i, _) in input.iter().enumerate() {
        let mut acc = 0.0f64;
        for (j, &k) in kernel.iter().enumerate() {
            let idx = i as i64 + j as i64 - half_len as i64;
            if idx >= 0 && (idx as usize) < input.len() {
                acc += input[idx as usize] as f64 * k;
            }
        }
        out[i] = acc as f32;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integer_downsample_keeps_length_ratio() {
        // 48k→16k（3:1）：输出长度 ≈ 输入/3（FIR 边界瞬态不改变抽取长度）
        let input: Vec<f32> = (0..4800).map(|i| ((i % 997) as f32 / 997.0 - 0.5) * 0.5).collect();
        let out = resample_antialias(&input, 48_000, 16_000);
        assert_eq!(out.len(), 1600, "3:1 抽取长度");
    }

    #[test]
    fn upsample_uses_linear_no_alias_issue() {
        // 16k→48k（升采样）：长度 3 倍（线性插值路径）
        let input: Vec<f32> = vec![0.1, -0.2, 0.3];
        let out = resample_antialias(&input, 16_000, 48_000);
        assert_eq!(out.len(), 9);
    }

    #[test]
    fn equal_rate_passthrough() {
        let input = vec![0.1f32, 0.2, 0.3];
        assert_eq!(resample_antialias(&input, 16_000, 16_000), input);
    }

    #[test]
    fn degenerate_inputs_safe() {
        assert!(resample_antialias(&[], 48_000, 16_000).is_empty());
        assert!(resample_antialias(&[0.1], 0, 16_000).is_empty());
        assert!(resample_antialias(&[0.1], 48_000, 0).is_empty());
    }

    #[test]
    fn non_integer_ratio_downsample_works() {
        // 44.1k→16k（非常数比率）：低通 + 线性插值，输出长度按比率
        let input: Vec<f32> = (0..4410).map(|i| ((i % 991) as f32 / 991.0 - 0.5) * 0.4).collect();
        let out = resample_antialias(&input, 44_100, 16_000);
        let expected = (input.len() as f64 * 16_000.0 / 44_100.0).floor() as usize;
        assert!((out.len() as i64 - expected as i64).abs() <= 2, "len {} vs {}", out.len(), expected);
    }

    #[test]
    fn lowpass_removes_high_frequency_energy() {
        // 混叠验证：输入 12kHz 正弦（48k 采样，降 16k 后会混叠 4kHz 分量），
        // 低通后该成分显著衰减（RMS 下降）——混叠污染消除的量化依据
        let sample_rate = 48_000u32;
        let freq = 12_000.0f64; // > 8k 奈奎斯特（16k/2）→ 线性插值会混叠
        let input: Vec<f32> = (0..4800)
            .map(|i| (2.0 * std::f64::consts::PI * freq * i as f64 / sample_rate as f64).sin() as f32)
            .collect();
        let direct = super::super::resample::resample_linear(&input, sample_rate, 16_000);
        let antialias = resample_antialias(&input, sample_rate, 16_000);
        let rms = |v: &[f32]| (v.iter().map(|s| (*s as f64) * (*s as f64)).sum::<f64>() / v.len() as f64).sqrt();
        let direct_rms = rms(&direct);
        let aa_rms = rms(&antialias);
        assert!(
            aa_rms < direct_rms * 0.5,
            "抗混叠后带外能量应显著衰减: aa={:.3} direct={:.3}",
            aa_rms,
            direct_rms
        );
    }
}
