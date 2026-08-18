//! 实时会话状态单测（AAA 模式；纯状态组件，无 IO 依赖）。
//!
//! @ai-context: 由 live_session.rs 以 #[cfg(test)] #[path] 引入；
//!              覆盖 REQ-031 融合状态标记流转（ADR-008 内存方案）。

use super::{sentence_end_ms, FusionTracker};

#[test]
fn fusion_tracker_begin_end_flow() {
    // Arrange
    let tracker = FusionTracker::default();
    // Act & Assert：未 begin 不在融合集
    assert!(!tracker.is_fusing(1));
    // begin 后标记融合中
    tracker.begin(1);
    assert!(tracker.is_fusing(1));
    // end 后清除
    tracker.end(1);
    assert!(!tracker.is_fusing(1));
}

#[test]
fn fusion_tracker_tracks_multiple_sessions_independently() {
    // Arrange：两个会话并发融合（历史遗留 + 当前）
    let tracker = FusionTracker::default();
    tracker.begin(5);
    tracker.begin(9);
    // Act & Assert：互不影响
    assert!(tracker.is_fusing(5));
    assert!(tracker.is_fusing(9));
    tracker.end(5);
    assert!(!tracker.is_fusing(5));
    assert!(tracker.is_fusing(9));
}

#[test]
fn fusion_tracker_clone_shares_state() {
    // Arrange：克隆共享同一内存集（manager 与 params 同实例语义）
    let tracker = FusionTracker::default();
    let clone = tracker.clone();
    // Act：一个句柄 begin，另一句柄可见
    tracker.begin(7);
    // Assert
    assert!(clone.is_fusing(7));
    clone.end(7);
    assert!(!tracker.is_fusing(7));
}

#[test]
fn fusion_tracker_end_unknown_id_is_noop() {
    // Act & Assert：end 未 begin 的会话不 panic 且不影响其他
    let tracker = FusionTracker::default();
    tracker.end(999);
    assert!(!tracker.is_fusing(999));
}

// ── TD-041：句尾校正（端点判定滞后 1.2-2.4s）────────────────

#[test]
fn sentence_end_uses_last_speech_block_tail() {
    // Arrange & Act：最后语音块起点 1000ms → 句尾 = 1000 + 200（块尾）
    assert_eq!(sentence_end_ms(Some(1000), 99_999), 1200);
}

#[test]
fn sentence_end_falls_back_without_speech() {
    // Act & Assert：无语音记录（异常路径）→ 回退当前块时刻，不 panic
    assert_eq!(sentence_end_ms(None, 5000), 5000);
}
