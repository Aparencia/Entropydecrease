//! 帧变化检测与调度单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 frame_diff.rs 以 #[cfg(test)] #[path] 引入，保持实现文件 ≤300 行。

use crate::capture::frame_diff::{bottom_quarter_rect, DualRateScheduler, FrameDiffDetector, Rect, SampleRegion};

fn frame_with_value(value: u8) -> Vec<u8> {
    vec![value; 64 * 64 * 4] // 64x64 BGRA
}

#[test]
fn first_frame_is_always_changed() {
    // Arrange & Act
    let mut detector = FrameDiffDetector::new();
    // Assert：首帧无基准 → 变化
    assert!(detector.has_changed(&frame_with_value(1)));
}

#[test]
fn identical_frame_is_unchanged() {
    // Arrange
    let mut detector = FrameDiffDetector::new();
    detector.has_changed(&frame_with_value(1));
    // Act
    let changed = detector.has_changed(&frame_with_value(1));
    // Assert
    assert!(!changed);
}

#[test]
fn small_region_change_is_filtered() {
    // Arrange：单块内局部变化（模拟鼠标微动——少于 2 块变化不判定）
    let mut detector = FrameDiffDetector::new();
    let mut frame = frame_with_value(1);
    detector.has_changed(&frame);
    // Act：只改一处的几个字节（8 块中最多 1 块变化）
    for b in &mut frame[0..16] {
        *b = 200;
    }
    let changed = detector.has_changed(&frame);
    // Assert：少于 2 块变化 → 判定未变化
    assert!(!changed);
}

#[test]
fn large_region_change_is_detected() {
    // Arrange
    let mut detector = FrameDiffDetector::new();
    let mut frame = frame_with_value(1);
    detector.has_changed(&frame);
    // Act：改后半帧（≥2 块变化）
    let mid = frame.len() / 2;
    for b in &mut frame[mid..] {
        *b = 200;
    }
    let changed = detector.has_changed(&frame);
    // Assert
    assert!(changed);
}

#[test]
fn reset_forces_next_change() {
    // Arrange
    let mut detector = FrameDiffDetector::new();
    detector.has_changed(&frame_with_value(1));
    detector.has_changed(&frame_with_value(1));
    // Act：reset 后同帧也应判定变化
    detector.reset();
    // Assert
    assert!(detector.has_changed(&frame_with_value(1)));
}

#[test]
fn empty_frame_never_changes() {
    // Arrange & Act
    let mut detector = FrameDiffDetector::new();
    // Assert
    assert!(!detector.has_changed(&[]));
}

#[test]
fn rect_intersect_basic() {
    // Arrange
    let a = Rect { left: 0, top: 0, right: 100, bottom: 100 };
    let b = Rect { left: 50, top: 50, right: 150, bottom: 150 };
    // Act
    let inter = a.intersect(&b).expect("intersect");
    // Assert
    assert_eq!(inter, Rect { left: 50, top: 50, right: 100, bottom: 100 });
}

#[test]
fn rect_intersect_disjoint_is_none() {
    // Arrange
    let a = Rect { left: 0, top: 0, right: 10, bottom: 10 };
    let b = Rect { left: 20, top: 20, right: 30, bottom: 30 };
    // Act & Assert
    assert!(a.intersect(&b).is_none());
}

#[test]
fn dual_rate_scheduler_prioritizes_subtitle() {
    // Arrange：字幕区每 1 tick，全帧每 3 tick
    let mut scheduler = DualRateScheduler::new(1, 3);
    // Act & Assert：每 tick 都采字幕区（高频覆盖低频）
    assert_eq!(scheduler.next_region(), SampleRegion::Subtitle);
    assert_eq!(scheduler.next_region(), SampleRegion::Subtitle);
    assert_eq!(scheduler.next_region(), SampleRegion::Subtitle);
}

#[test]
fn dual_rate_scheduler_skips_and_full() {
    // Arrange：字幕区每 5 tick，全帧每 3 tick
    let mut scheduler = DualRateScheduler::new(5, 3);
    // Act & Assert：t1/t2 跳过，t3 全帧
    assert_eq!(scheduler.next_region(), SampleRegion::Skip);
    assert_eq!(scheduler.next_region(), SampleRegion::Skip);
    assert_eq!(scheduler.next_region(), SampleRegion::Full);
    assert_eq!(scheduler.next_region(), SampleRegion::Skip);
    // t5：字幕区 tick 命中，字幕区优先
    assert_eq!(scheduler.next_region(), SampleRegion::Subtitle);
}

#[test]
fn bottom_quarter_rect_covers_last_quarter() {
    // Arrange & Act
    let rect = bottom_quarter_rect(1920, 1080).expect("rect");
    // Assert：底部 270px（1080/4）
    assert_eq!(rect.top, 810);
    assert_eq!(rect.bottom, 1080);
    assert_eq!(rect.height(), 270);
}

#[test]
fn bottom_quarter_rect_zero_size_is_none() {
    // Act & Assert
    assert!(bottom_quarter_rect(0, 100).is_none());
    assert!(bottom_quarter_rect(100, 0).is_none());
}
