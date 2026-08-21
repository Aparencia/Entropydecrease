//! 实时会话状态单测（AAA 模式；纯状态组件，无 IO 依赖）。
//!
//! @ai-context: 由 live_session.rs 以 #[cfg(test)] #[path] 引入；
//!              覆盖 REQ-031 融合状态标记流转（ADR-008 内存方案）。
//! @ai-context: v0.7.0 M0 X-O5 拆分后：FusionTracker 在 live_session_fusion.rs，
//!              sentence_end_ms 在 live_session_persist.rs（测试引用同步迁移）。

use crate::live_session_fusion::FusionTracker;
use crate::live_session_persist::sentence_end_ms;

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

// ── v0.9.0 M2（REQ-189）：当前生效画面档共享槽（采集态档案条拉取兑底）────

#[test]
fn applied_tier_slot_defaults_none() {
    // Arrange & Act：新管理器未定档
    let manager = crate::live_session::LiveSessionManager::new();
    // Assert
    assert_eq!(manager.applied_tier(), None);
}

#[test]
fn applied_tier_slot_publishes_and_reads_back() {
    // Arrange：worker 语义——经共享槽句柄写入（run_screen_worker 等价操作）
    let manager = crate::live_session::LiveSessionManager::new();
    let slot = manager.applied_tier_slot();
    // Act：应用档位写入
    *slot.lock().expect("slot lock") = Some(crate::video_profile_spec::VisualTier::Medium);
    // Assert：命令层查询读到同一档位
    assert_eq!(
        manager.applied_tier(),
        Some(crate::video_profile_spec::VisualTier::Medium)
    );
}

#[test]
fn applied_tier_slot_clone_shares_state() {
    // Arrange：克隆共享同一槽（manager 与 command 层句柄同实例语义）
    let manager = crate::live_session::LiveSessionManager::new();
    let clone = manager.clone();
    // Act：经克隆句柄写入生效档
    clone
        .applied_tier_slot()
        .lock()
        .expect("lock")
        .replace(crate::video_profile_spec::VisualTier::Rich);
    // Assert：原句柄可见
    assert_eq!(manager.applied_tier(), Some(crate::video_profile_spec::VisualTier::Rich));
}
