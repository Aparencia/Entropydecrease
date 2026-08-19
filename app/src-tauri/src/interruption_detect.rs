//! 抢话/打断检测（REQ-127 M6 / v0.7.0 M2，代理信号版）。
//!
//! @ai-context: 不依赖讲者识别（V1.0 讲者波次才接线）的代理判定：
//!              "短间隔连续语音 + 能量突变" = 疑似打断——上一条带音量 Final
//!              与本条 gap ≤ 800ms 且本条音量比上条高 ≥ 0.25（音量骤变，
//!              复用 REQ-103 段 volume）→ 疑似有人抢话/打断。
//! @ai-context: confidence 固定 0.5（无讲者信息的代理置信度，诚实标注；
//!              精度基线标注留真机圆桌样本，见 v0.7.0 开放问题 M6 代理版精度）。
//!              同一时刻附近（±2s）抑制重复触发。
//!
//! ## M2 接入指引（本模块未接线——live_session_loop.rs 属其他代理域，勿碰）
//! 实时接入点在 live_session_loop.rs Final 事件处理处（handle_final_event
//! 调用之前）：持有 InterruptionDetector 状态，对每条 Final 调用
//! `detector.observe(&text, start_ms, volume)`（start_ms = 句起时刻，
//! volume = REQ-103 段内 RMS 均值，loop.rs 已计算），命中 →
//! record_action（或写自定义事件）落 PlayerBehavior 事件。volume=None
//! （无语音块）时 observe 天然不触发，无需调用方特判。
//!
//! #![allow(dead_code)] 说明：本模块为纯函数+单测交付（M2 未接线，接线点见上），
//! lib 目标下无调用方 → 登记豁免（与 db_session_events::list_events_by_kind
//! 同模式：已交付待接线机制，M2 后按接入指引接线即自然消除）。

#![allow(dead_code)]

/// 打断事件（代理判定结果）。
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct InterruptionEvent {
    /// 打断时刻（ms，相对会话起点 = Final 起始时刻）
    pub time_ms: u64,
    /// 代理置信度（固定 0.5——无讲者信息的诚实标注；真机校准后调整）
    pub confidence: f32,
}

/// 最近带音量 Final 保留条数（单讲者高频对话下足以取"上一条"；防无界增长）。
const RECENT_CAP: usize = 8;
/// 短间隔阈值（ms）：上一条与本条 gap ≤ 800ms = 连续快速语音
const GAP_MS: u64 = 800;
/// 音量骤变阈值：本条 ≥ 上条 + 0.25（RMS 0.0-1.0 量纲，与 REQ-103 段 volume 同口径）
const VOLUME_SURGE: f32 = 0.25;
/// 抑制窗口（ms）：触发后 ±2s 内不重复
const SUPPRESS_MS: u64 = 2_000;
/// 代理置信度（固定值，诚实标注无讲者信息）
const PROXY_CONFIDENCE: f32 = 0.5;

/// 打断检测器（有状态：最近带音量 Final 窗口 + 上次触发时刻）。
pub struct InterruptionDetector {
    /// 最近带音量 Final（时间戳, 文本, 音量）；仅带音量 Final 入窗
    /// （无音量无法参与能量比较——诚实：无证据不判）
    recent_finals: Vec<(u64, String, f32)>,
    /// 上次触发时刻（±2s 抑制窗口）
    last_interrupt_at: Option<u64>,
}

impl Default for InterruptionDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl InterruptionDetector {
    pub fn new() -> Self {
        Self { recent_finals: Vec::new(), last_interrupt_at: None }
    }

    /// 观测一条 Final（每次 Final 落库前调用）→ 疑似打断事件。
    ///
    /// @ai-context: 判定 = 上一条带音量 Final 与本条 gap ≤ 800ms 且本条音量
    ///              比上条高 ≥ 0.25。volume=None（无语音块/旧数据）→ 不触发。
    ///              触发后 ±2s 抑制（防同一次抢话重复计数）。
    /// @ai-context: 文本仅留作诊断（未来多信号融合）；本版不参与判定。
    pub fn observe(
        &mut self,
        final_text: &str,
        start_ms: u64,
        volume: Option<f32>,
    ) -> Option<InterruptionEvent> {
        let Some(vol) = volume else {
            // 无音量：无能量证据，仅入窗跳过（不入窗——窗口只存带音量 Final）
            return None;
        };
        // 抑制：上次触发 ±2s 内不重复
        if let Some(last) = self.last_interrupt_at {
            if start_ms.abs_diff(last) <= SUPPRESS_MS {
                self.push(final_text, start_ms, vol);
                return None;
            }
        }
        let mut event = None;
        if let Some((prev_start, _, prev_vol)) = self.recent_finals.last().cloned() {
            let gap = start_ms.saturating_sub(prev_start);
            if gap <= GAP_MS && vol >= prev_vol + VOLUME_SURGE {
                event = Some(InterruptionEvent { time_ms: start_ms, confidence: PROXY_CONFIDENCE });
                self.last_interrupt_at = Some(start_ms);
            }
        }
        self.push(final_text, start_ms, vol);
        event
    }

    /// 入窗（FIFO，上限 RECENT_CAP）。
    fn push(&mut self, text: &str, start_ms: u64, volume: f32) {
        self.recent_finals.push((start_ms, text.to_string(), volume));
        if self.recent_finals.len() > RECENT_CAP {
            self.recent_finals.remove(0);
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "interruption_detect_tests.rs"]
mod tests;
