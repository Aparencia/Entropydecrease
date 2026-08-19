//! VAD 阈值自适应（REQ-069 / v0.6.0 M4，AL1）。
//!
//! @ai-context: 固定静音阈值（SILENCE_RMS_THRESHOLD=0.005）在环境噪声变化时
//!              误切（噪声高 → 语音被截断；噪声低 → 静音被当语音）。
//!              本模块做**会话内能量统计 → 静音门控阈值自适应**：
//!              滑动窗口能量历史 → P25 分位数 = 噪声底 → 阈值 = 噪声底 × 倍率
//!              + 下限兜底；阈值变化限幅（平滑，防单块跳变误切）。
//! @ai-context: 与 AGC（REQ-041，默认关）联动策略：AGC 开启时预处理链已产出
//!              speech_threshold（同尺度动态阈值）——调用方不再重复自适应
//!              （本模块 `next_threshold` 仅当调用方选择使用；config.enabled=false
//!              恒返回基础阈值——"可关"开关）。
//! @ai-context: 纯逻辑可单测（合成音量变化样本：安静→语音→安静，阈值跟随
//!              噪声底且语音不误判静音）；切段质量不劣化由平滑限幅保证。

use std::collections::VecDeque;

/// 噪声底分位数（P10——语音占会话时间通常 <90%，低能量尾代表环境噪声；
/// 比 P25 更抗语音污染：即使语音块入窗也不抬升噪声底）。
const NOISE_PERCENTILE: f32 = 0.10;
/// 噪声底 → 阈值倍率（噪声 RMS × 3 视为语音起点；经验值，可校准）。
const THRESHOLD_MULTIPLIER: f32 = 3.0;
/// 阈值下限（绝对兜底：低于该值视为无信号环境，防除零/过低误切）。
const THRESHOLD_FLOOR: f32 = 0.0015;
/// 每块阈值最大相对变化（平滑限幅：20%/块，防瞬时跳变）。
const MAX_STEP_RATIO: f32 = 0.2;
/// 预热块数（10s——历史不足时不自适应：首块语音不得误建噪声底）。
const WARMUP_BLOCKS: usize = 50;
/// 能量历史窗口块数（200ms/块 × 400 = 80s 环境记忆）。
const HISTORY_BLOCKS: usize = 400;

/// 自适应配置（"可关"开关 + 参数校准）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AdaptiveVadConfig {
    /// 总开关（false = 恒返回基础阈值——现状行为零回归）
    pub enabled: bool,
}

impl Default for AdaptiveVadConfig {
    fn default() -> Self {
        Self { enabled: true }
    }
}

/// 自适应 VAD 阈值器（有状态：能量历史滑动窗口）。
pub struct AdaptiveVad {
    config: AdaptiveVadConfig,
    history: VecDeque<f32>,
    /// 当前生效阈值（初始 = 基础阈值）
    current: f32,
}

impl AdaptiveVad {
    pub fn new(config: AdaptiveVadConfig) -> Self {
        Self { config, history: VecDeque::with_capacity(HISTORY_BLOCKS), current: 0.0 }
    }

    /// 观察一块能量并产出下一块判定阈值。
    ///
    /// @ai-context: 关闭时恒返回 base_threshold（零回归）；
    ///              开启时：能量入窗（全部入窗——P10 分位数天然抗语音污染，
    ///              语音块不显著抬升噪声底）→ 预热期（<10s）不自适应 →
    ///              P10 噪声底 → 新阈值（限幅平滑）。
    pub fn next_threshold(&mut self, block_rms: f32, base_threshold: f32) -> f32 {
        if !self.config.enabled {
            return base_threshold;
        }
        let rms = block_rms.max(0.0);
        if self.history.len() == HISTORY_BLOCKS {
            self.history.pop_front();
        }
        self.history.push_back(rms);
        let base = if self.current <= 0.0 { base_threshold } else { self.current };
        // 预热：历史不足（10s）不自适应——首块语音不误建噪声底
        if self.history.len() < WARMUP_BLOCKS {
            self.current = base;
            return base;
        }
        let noise_floor = percentile(&self.history, NOISE_PERCENTILE);
        let target = (noise_floor * THRESHOLD_MULTIPLIER).max(THRESHOLD_FLOOR);
        // 平滑限幅：从当前阈值向目标收敛（每块最多 ±20%）
        let step = (target - base).abs() * MAX_STEP_RATIO;
        self.current = if target >= base { base + step } else { base - step };
        self.current.max(THRESHOLD_FLOOR)
    }

    /// 当前阈值（诊断/测试 API；编排层走 next_threshold——登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn current_threshold(&self) -> f32 {
        self.current
    }
}

/// 分位数（纯函数）：升序第 p 分位（线性插值；空输入 → 0）。
fn percentile(values: &VecDeque<f32>, p: f32) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted: Vec<f32> = values.iter().copied().collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((sorted.len() - 1) as f32 * p) as usize;
    sorted[idx]
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "vad_adaptive_tests.rs"]
mod tests;
