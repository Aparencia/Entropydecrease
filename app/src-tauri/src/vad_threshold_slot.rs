//! VAD 阈值共享槽（REQ-115 PRE-O4 / v0.7.0 M2）。
//!
//! @ai-context: 健康判定口径统一的可观测性通道——会话线程内 AdaptiveVad 的
//!              当前阈值（f32）经共享 AtomicU32（位模式）暴露给诊断面板：
//!              降级提示与切段判定口径可对照核查（"诊断可查阈值"验收点）。
//! @ai-context: 共享槽语义 = 最近一次会话的最后阈值（无活动会话时保留旧值——
//!              诊断面板可看上次会话的阈值走向；初始化 0.0 = 无数据）。

use std::sync::atomic::{AtomicU32, Ordering};

/// VAD 当前阈值共享槽（AppState 持有；会话线程写、诊断读）。
#[derive(Debug, Default)]
pub struct VadThresholdSlot {
    bits: AtomicU32,
}

impl VadThresholdSlot {
    /// 发布当前阈值（f32 → AtomicU32 位模式；NaN 安全——位模式原样存）。
    pub fn publish(&self, threshold: f32) {
        self.bits.store(threshold.to_bits(), Ordering::Relaxed);
    }

    /// 读取当前阈值（无数据时 0.0）。
    pub fn read(&self) -> f32 {
        f32::from_bits(self.bits.load(Ordering::Relaxed))
    }
}

/// 暴露接口（诊断面板）：当前阈值 + 基础阈值对照。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VadThresholdView {
    /// 当前自适应阈值（0.0 = 无数据）
    pub current: f32,
    /// 固定基础阈值（SILENCE_RMS_THRESHOLD——对照口径）
    pub base: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slot_roundtrip_preserves_bits() {
        // f32 → 位模式 → f32 往返一致（含特殊值）
        let slot = VadThresholdSlot::default();
        slot.publish(0.0042);
        assert!((slot.read() - 0.0042).abs() < 1e-7);
    }

    #[test]
    fn slot_defaults_to_zero() {
        // 无数据 → 0.0（诊断面板"无数据"判定）
        let slot = VadThresholdSlot::default();
        assert_eq!(slot.read(), 0.0);
    }

    #[test]
    fn slot_handles_nan_safely() {
        // NaN 位模式往返不崩溃（防御：会话线程异常值）
        let slot = VadThresholdSlot::default();
        slot.publish(f32::NAN);
        assert!(slot.read().is_nan());
    }

    #[test]
    fn slot_overwrites_latest() {
        // 后写覆盖先写（最近阈值语义）
        let slot = VadThresholdSlot::default();
        slot.publish(0.01);
        slot.publish(0.02);
        assert!((slot.read() - 0.02).abs() < 1e-7);
    }
}
