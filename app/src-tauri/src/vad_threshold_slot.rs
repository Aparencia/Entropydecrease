//! VAD 阈值共享槽（REQ-115 PRE-O4 / v0.7.0 M2）。
//!
//! @ai-context: 健康判定口径统一的可观测性通道（**当前仅剩写端**）：会话线程内
//!              AdaptiveVad 的当前阈值（f32，AtomicU32 位模式）与发布来源会话 id
//!              持续写入本共享槽；诊断读端已随「不留半成品」的删除处置移除——
//!              未来若需要，届时按诊断需求重新引入（写端数值不受影响）。
//! @ai-context: 共享槽语义 = 最近一次会话的最后阈值（无活动会话时保留旧值）；
//!              初始化 0.0 = 无数据。审查 MEDIUM-8 留下的来源会话 id 仍在写入
//!              （供未来读端区分"实时值"与"残留值"），当前无读取方。

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
}
