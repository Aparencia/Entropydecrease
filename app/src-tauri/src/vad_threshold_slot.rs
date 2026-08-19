//! VAD 阈值共享槽（REQ-115 PRE-O4 / v0.7.0 M2）。
//!
//! @ai-context: 健康判定口径统一的可观测性通道——会话线程内 AdaptiveVad 的
//!              当前阈值（f32）经共享 AtomicU32（位模式）暴露给诊断面板：
//!              降级提示与切段判定口径可对照核查（"诊断可查阈值"验收点）。
//! @ai-context: 共享槽语义 = 最近一次会话的最后阈值（无活动会话时保留旧值——
//!              诊断面板可看上次会话的阈值走向；初始化 0.0 = 无数据）。
//! @ai-context: 审查 MEDIUM-8 修复：槽记录发布来源会话 id——诊断面板可区分
//!              "实时值"（发布会话=活动会话）与"残留值"（上次会话遗留），
//!              避免把旧会话阈值当成当前口径误读。

use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};

/// VAD 当前阈值共享槽（AppState 持有；会话线程写、诊断读）。
#[derive(Debug, Default)]
pub struct VadThresholdSlot {
    bits: AtomicU32,
    /// 发布来源会话 id（0 = 无数据；诊断新鲜度判定）
    source_session: AtomicI64,
}

impl VadThresholdSlot {
    /// 发布当前阈值（f32 → AtomicU32 位模式；NaN 安全——位模式原样存）。
    pub fn publish(&self, session_id: i64, threshold: f32) {
        self.bits.store(threshold.to_bits(), Ordering::Relaxed);
        self.source_session.store(session_id, Ordering::Relaxed);
    }

    /// 读取当前阈值（无数据时 0.0）。
    pub fn read(&self) -> f32 {
        f32::from_bits(self.bits.load(Ordering::Relaxed))
    }

    /// 发布来源会话 id（0 = 无数据；诊断新鲜度判定用）。
    pub fn source_session_id(&self) -> i64 {
        self.source_session.load(Ordering::Relaxed)
    }
}

/// 暴露接口（诊断面板）：当前阈值 + 基础阈值对照 + 新鲜度。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VadThresholdView {
    /// 当前自适应阈值（0.0 = 无数据）
    pub current: f32,
    /// 固定基础阈值（SILENCE_RMS_THRESHOLD——对照口径）
    pub base: f32,
    /// 发布来源会话 id（0 = 无数据）
    pub source_session: i64,
    /// 是否为活动会话的实时值（诊断面板区分实时/残留）
    pub is_live: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slot_roundtrip_preserves_bits() {
        // f32 → 位模式 → f32 往返一致（含特殊值）
        let slot = VadThresholdSlot::default();
        slot.publish(42, 0.0042);
        assert!((slot.read() - 0.0042).abs() < 1e-7);
        assert_eq!(slot.source_session_id(), 42);
    }

    #[test]
    fn slot_defaults_to_zero() {
        // 无数据 → 0.0 + 来源 0（诊断面板"无数据"判定）
        let slot = VadThresholdSlot::default();
        assert_eq!(slot.read(), 0.0);
        assert_eq!(slot.source_session_id(), 0);
    }

    #[test]
    fn slot_handles_nan_safely() {
        // NaN 位模式往返不崩溃（防御：会话线程异常值）
        let slot = VadThresholdSlot::default();
        slot.publish(42, f32::NAN);
        assert!(slot.read().is_nan());
    }

    #[test]
    fn slot_overwrites_latest() {
        // 后写覆盖先写（最近阈值 + 最近来源语义）
        let slot = VadThresholdSlot::default();
        slot.publish(1, 0.01);
        slot.publish(2, 0.02);
        assert!((slot.read() - 0.02).abs() < 1e-7);
        assert_eq!(slot.source_session_id(), 2);
    }
}
