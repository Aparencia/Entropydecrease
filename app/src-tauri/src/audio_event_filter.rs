//! 音频事件过滤：通知音/系统音固定音模式检测（REQ-105 / v0.7.0 M1，M14）。
//!
//! @ai-context: 实时链路中微信/邮件提示音等系统通知音会被当成语音喂入流式
//!              ASR，产出"垃圾转写"（真实会话污染源）。本模块检测固定音模式
//!              （短促 + 能量集中 + 音调稳定三条件）→ VAD 门控联动：命中且
//!              前置静音的片段由调用方按静音喂入（不进 ASR）。
//! @ai-context: 与 REQ-126（M10 分应用音频路由）的关系：M10 从源头按进程隔离
//!              系统音，实装后本机制降为**兜底**（仍保留——防路由未覆盖的提示音）。
//! @ai-context: 纯规则启发式（无 AI）：过零率稳定性区分纯音/和弦与语音——
//!              语音有声/无声交替 → 窗口过零率波动大；纯音窗口间过零率恒定。
//!              参数 JSON 可校准（对齐 ui_junk.rs 黑名单 JSON 校准惯例）。
//! @ai-context: 纯逻辑可单测；状态机只依赖逐块 observe 调用（块时长由调用方
//!              live_session_loop 200ms 决定），无时间戳/外部依赖。

use serde::{Deserialize, Serialize};

/// 固定音最大时长（s）——微信/邮件提示音多为 0.1~0.5s 短促音；长音不是
/// 通知音（铃声/持续警报不拦，防误杀）。
const MAX_DURATION_SECS: f32 = 0.8;
/// 固定音 RMS 阈值——静音底（streaming_asr::SILENCE_RMS_THRESHOLD=0.005）
/// 的 16 倍，保证"能量集中"判定不受环境噪声（RMS < 0.01）干扰。
const RMS_THRESHOLD: f32 = 0.08;
/// 过零率稳定性比值阈值——窗口间 ZCR 标准差 < 平均值 30% 判"稳定音调"。
const ZCR_STABILITY_RATIO: f32 = 0.30;
/// 过零率统计窗口（ms）——纯音在 20ms 窗口内 ZCR 恒定；语音窗口间波动大。
const ZCR_WINDOW_MS: usize = 20;
/// 前置静音块要求——连续静音 ≥2 块才判"通知音前后都是静音"（防语音中间
/// 短音误杀：语音块会清零该计数）。
const PRECEDING_SILENT_BLOCKS: u32 = 2;

/// 固定音检测配置（JSON 可校准；字段缺失用默认——`#[serde(default)]`）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AudioEventFilterConfig {
    pub max_duration_secs: f32,
    pub rms_threshold: f32,
    pub zcr_stability_ratio: f32,
}

impl Default for AudioEventFilterConfig {
    fn default() -> Self {
        Self {
            max_duration_secs: MAX_DURATION_SECS,
            rms_threshold: RMS_THRESHOLD,
            zcr_stability_ratio: ZCR_STABILITY_RATIO,
        }
    }
}

/// 从 JSON 构建配置（字段缺失用默认；JSON 损坏 → 默认 + 日志，不阻断）。
///
/// @ai-context: JSON 可校准时项目惯例（ui_junk.rs 黑名单同款）；
///              数据目录 audio_event_filter.json 可由用户/部署校准三阈值。
/// 生产链路暂用默认配置，本函数为校准 API（单测覆盖）——登记豁免 dead_code
/// （对齐 vad_adaptive::current_threshold 惯例）。
#[allow(dead_code)]
pub fn load_pattern_config(json: &str) -> AudioEventFilterConfig {
    match serde_json::from_str(json) {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("[AudioEventFilter] 配置解析失败，使用默认: {}", e);
            AudioEventFilterConfig::default()
        }
    }
}

/// 固定音模式检测核心（纯函数）：短促 + 能量集中 + 音调稳定 三条件全满足。
///
/// @ai-context: 启发式规则：通知音 = 短促（≤0.8s）高能量纯音/和弦。
///              - 时长：`samples.len()/sample_rate` ≤ max_duration_secs
///              - 能量：整块 RMS > rms_threshold（静音底 0.005 的 16 倍）
///              - 音调：每 20ms 窗口过零率，窗口间标准差 < 平均值 30% 判稳定
///                （纯音 ZCR≈2f/fs 恒定；语音有声/无声交替 ZCR 波动大）
/// @ai-context: 纯函数无副作用；空输入/采样率 0 → false（防御性，不 panic）。
/// 核心纯函数（测试/校准 API）；生产走 observe（内部复用带配置判定）——
/// 登记豁免 dead_code。
#[allow(dead_code)]
pub fn is_fixed_tone_pattern(samples: &[f32], sample_rate: u32) -> bool {
    is_fixed_tone_with_config(samples, sample_rate, &AudioEventFilterConfig::default())
}

/// 带配置的固定音判定（observe 用可校准配置；is_fixed_tone_pattern 用默认）。
fn is_fixed_tone_with_config(
    samples: &[f32],
    sample_rate: u32,
    cfg: &AudioEventFilterConfig,
) -> bool {
    if samples.is_empty() || sample_rate == 0 {
        return false;
    }
    // a) 短促：总时长 ≤ 阈值（长音/铃声不拦）
    let duration = samples.len() as f32 / sample_rate as f32;
    if duration > cfg.max_duration_secs {
        return false;
    }
    // b) 能量集中：RMS 显著高于静音底
    if rms(samples) <= cfg.rms_threshold {
        return false;
    }
    // c) 音调稳定性：窗口间 ZCR 标准差 < 平均值 30% 才判稳定音调
    zcr_stability_ratio(samples, sample_rate) < cfg.zcr_stability_ratio
}

/// RMS（对齐 capture::resample::compute_rms 语义：平方均值开方；空输入 → 0）。
fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f64 = samples.iter().map(|s| (*s as f64) * (*s as f64)).sum();
    (sum / samples.len() as f64).sqrt() as f32
}

/// 过零率（ZCR）：符号翻转次数 / 样本对数——纯音 ≈ 2f/fs，噪声 ≈ 0.5。
fn zcr(samples: &[f32]) -> f32 {
    if samples.len() < 2 {
        return 0.0;
    }
    let crossings = samples
        .windows(2)
        .filter(|w| (w[0] >= 0.0) != (w[1] >= 0.0))
        .count();
    crossings as f32 / (samples.len() - 1) as f32
}

/// ZCR 稳定性比值：窗口间标准差 / 平均值（纯音 → 接近 0；语音 → 大）。
///
/// @ai-context: 边界——平均值为 0（全静音窗口）→ 返回 MAX（静音无音调，
///              不判稳定）；窗口数 < 2 → 无法统计方差 → 返回 MAX（太短不足
///              以判"稳定音调"，防瞬态咔哒声误判为通知音）。
fn zcr_stability_ratio(samples: &[f32], sample_rate: u32) -> f32 {
    let window_len = ((sample_rate as usize) * ZCR_WINDOW_MS / 1000).max(1);
    let windows = samples.len() / window_len;
    if windows < 2 {
        return f32::MAX;
    }
    let zcrs: Vec<f32> = (0..windows)
        .map(|i| zcr(&samples[i * window_len..(i + 1) * window_len]))
        .collect();
    let mean = zcrs.iter().sum::<f32>() / zcrs.len() as f32;
    if mean <= 0.0 {
        return f32::MAX;
    }
    let variance = zcrs.iter().map(|z| (z - mean) * (z - mean)).sum::<f32>() / zcrs.len() as f32;
    variance.sqrt() / mean
}

/// 固定音观察决策（与 suppress 解耦的判定结果，供诊断/测试观测）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioEventDecision {
    /// 本块是否判定为固定音模式。
    pub is_fixed_tone: bool,
    /// 是否应标记为静音（该块不进 ASR）。
    pub should_suppress: bool,
}

/// 音频事件过滤器（有状态：前置静音块计数状态机）。
///
/// @ai-context: 状态机语义——"固定音 + 前置静音"才 suppress：通知音总是
///              出现在静音中（无人说话时弹提示）；语音中间出现的短音
///              （前置非静音）不 suppress（防误杀真实语音）。
pub struct AudioEventFilter {
    pub enabled: bool,
    config: AudioEventFilterConfig,
    /// 连续静音块计数（block_is_silent=true 递增；非静音非固定音块归零）。
    recent_silent_blocks: u32,
    /// 固定音抑制粘滞态（H4 修复：通知音延续块保持抑制——语音块复位）。
    suppressing: bool,
    /// 累计 suppress 块数（诊断/测试观测；生产暂未消费）——登记豁免 dead_code。
    #[allow(dead_code)]
    pub suppressed_count: u64,
}

impl Default for AudioEventFilter {
    fn default() -> Self {
        Self {
            enabled: true,
            config: AudioEventFilterConfig::default(),
            recent_silent_blocks: 0,
            suppressing: false,
            suppressed_count: 0,
        }
    }
}

impl AudioEventFilter {
    /// 用可校准配置构造（load_pattern_config 产出——JSON 校准入口）。
    /// 生产链路用 Default（默认阈值），本构造为校准 API——登记豁免 dead_code。
    #[allow(dead_code)]
    pub fn with_config(config: AudioEventFilterConfig) -> Self {
        Self { config, ..Self::default() }
    }

    /// 观察一块音频，产出固定音/抑制决策。
    ///
    /// @ai-context: 静音块只推进前置静音计数（不判固定音——静音无音调）；
    ///              非静音块先判固定音，再查前置静音 ≥2 块。命中 →
    ///              should_suppress（调用方将本块按静音喂入 ASR）；
    ///              suppressed_count 累计命中块数。
    /// @ai-context: 审查 H4 修复（v0.7.0 新增代码审查）：通知音典型 0.3-0.8s
    ///              = 2-4 块（200ms/块）。原实现每块归零前置静音计数——首块
    ///              命中后计数=0，延续块（同一音的后续块）不再满足"前置静音
    ///              ≥2" → 不 suppress → 通知音大部分时长仍进 ASR。修复：
    ///              固定音延续块（非静音 + is_fixed）保持抑制态（抑制状态
    ///              粘滞直到非固定音块/静音块出现——语音块自然归零）。
    pub fn observe(
        &mut self,
        samples: &[f32],
        sample_rate: u32,
        block_is_silent: bool,
    ) -> AudioEventDecision {
        if block_is_silent {
            self.recent_silent_blocks = self.recent_silent_blocks.saturating_add(1);
            return AudioEventDecision { is_fixed_tone: false, should_suppress: false };
        }
        let is_fixed =
            self.enabled && is_fixed_tone_with_config(samples, sample_rate, &self.config);
        // H4：固定音延续块保持抑制（抑制粘滞直到语音/静音块复位）
        let should_suppress =
            if is_fixed {
                self.recent_silent_blocks >= PRECEDING_SILENT_BLOCKS || self.suppressing
            } else {
                false
            };
        // 语音块（非固定音）复位抑制态与前置静音计数；固定音延续不归零
        if is_fixed {
            self.suppressing = should_suppress;
        } else {
            self.suppressing = false;
            self.recent_silent_blocks = 0;
        }
        if should_suppress {
            self.suppressed_count += 1;
        }
        AudioEventDecision { is_fixed_tone: is_fixed, should_suppress }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "audio_event_filter_tests.rs"]
mod tests;
