//! 帧变化检测与调度单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 frame_diff.rs 以 #[cfg(test)] #[path] 引入，保持实现文件 ≤300 行。

use crate::capture::frame_diff::{
    bottom_quarter_rect, downscale_bgra, DualRateScheduler, FrameDiffDetector, Rect, SampleRegion,
};

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
    // Arrange：字幕区每 1 tick，全帧每 3 tick（语音活跃期）
    let mut scheduler = DualRateScheduler::new(1, 3);
    // Act & Assert：每 tick 都采字幕区（高频覆盖低频）
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Subtitle);
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Subtitle);
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Subtitle);
}

#[test]
fn dual_rate_scheduler_skips_and_full() {
    // Arrange：字幕区每 5 tick，全帧每 3 tick（语音活跃期）
    let mut scheduler = DualRateScheduler::new(5, 3);
    // Act & Assert：t1/t2 跳过，t3 全帧
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Skip);
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Skip);
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Full);
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Skip);
    // t5：字幕区 tick 命中，字幕区优先
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Subtitle);
}

#[test]
fn silent_period_boosts_full_frame_sampling() {
    // Arrange：语音活跃期字幕每 2 tick、全帧每 5 tick
    let mut scheduler = DualRateScheduler::new(2, 5);
    // Act：静音期（speech_active=false）→ 字幕区降频（4 tick）、全帧提频（2 tick）
    // 独立计数语义（审查修复）：全帧点不被字幕 tick 遮蔽——t2/t5/t7 全帧，t4/t8 字幕
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Skip); // t1
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Full); // t2
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Skip); // t3
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Subtitle); // t4
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Full); // t5
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Skip); // t6
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Full); // t7
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Subtitle); // t8
}

#[test]
fn speech_restores_subtitle_priority() {
    // Arrange：同一调度器先静音后语音
    let mut scheduler = DualRateScheduler::new(2, 5);
    scheduler.next_region(false, false);
    // Act：恢复语音 → 回到原节奏（t2 字幕）
    assert_eq!(scheduler.next_region(true, false), SampleRegion::Subtitle);
}

#[test]
fn degraded_cuts_full_frame_rate_but_keeps_subtitle() {
    // M4/REQ-039 P8：降级档全帧降频（5→10 tick），字幕区不变。
    // 用 (3,5) 避免字幕 tick 与全帧 tick 重叠（重叠时字幕区优先，无法观察降频）
    let mut scheduler = DualRateScheduler::new(3, 5);
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Skip); // t1
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Skip); // t2
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Subtitle); // t3
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Skip); // t4
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Skip); // t5（原全帧点被压）
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Subtitle); // t6
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Skip); // t7
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Skip); // t8
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Subtitle); // t9
    assert_eq!(scheduler.next_region(true, true), SampleRegion::Full); // t10 降级档全帧
}

#[test]
fn degraded_applies_to_silent_period_too() {
    // M4：静音期降级也不破 0.1fps 封顶（静音全帧 2 tick → 降级 10 tick）
    let mut scheduler = DualRateScheduler::new(2, 5);
    // 静音期字幕 4 tick；全帧 2 tick → 降级 10 tick
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t1
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t2（原全帧点被压）
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t3
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Subtitle); // t4 字幕保留
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t5
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t6
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t7
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Subtitle); // t8
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t9
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Full); // t10
}

#[test]
fn silent_and_degraded_knobs_are_configurable() {
    // M4：VAD 旋钮与降级档参数化（独立计数语义：t4 起全帧间隔 4 tick）
    let mut scheduler = DualRateScheduler::new(2, 5)
        .with_silent(3, 2)
        .with_degraded_full(4);
    // 静音期：字幕 3 tick、全帧 2 tick
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Skip); // t1
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Full); // t2
    assert_eq!(scheduler.next_region(false, false), SampleRegion::Subtitle); // t3
    // 降级：全帧 4 tick（t7 触发——t2 清零后 full_tick 累计）
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t4
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Skip); // t5
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Subtitle); // t6
    assert_eq!(scheduler.next_region(false, true), SampleRegion::Full); // t7
}

#[test]
fn degraded_full_frame_not_shadowed_by_subtitle() {
    // 审查修复：原取模实现下 degraded 档（full=10, sub=2）全帧被字幕 tick 整除
    // 永久遮蔽（永不触发）；独立计数后在字幕空档补采（t11 触发，间隔 11 ≥ 10 不破封顶）
    let mut scheduler = DualRateScheduler::new(2, 5);
    let mut full_seen = false;
    for i in 1..=20 {
        let region = scheduler.next_region(true, true);
        if i == 11 {
            assert_eq!(region, SampleRegion::Full, "t11 应在字幕空档补采全帧");
        }
        if region == SampleRegion::Full {
            full_seen = true;
        }
    }
    assert!(full_seen, "degraded 档 20 tick 内全帧必须可触发（不得被字幕遮蔽）");
}


#[test]
fn downscale_reduces_dimensions_and_preserves_aspect() {
    // Arrange：1920x270 字幕裁剪帧（全宽）
    let mut w = 1920u32;
    let mut h = 270u32;
    let mut frame: Vec<u8> = (0..(w * h * 4) as usize).map(|i| (i % 251) as u8).collect();
    // Act：缩至最大宽 960
    downscale_bgra(&mut frame, &mut w, &mut h, 960);
    // Assert：宽 960、高按比例 135、像素数匹配
    assert_eq!(w, 960);
    assert_eq!(h, 135);
    assert_eq!(frame.len(), (960 * 135 * 4) as usize);
}

#[test]
fn downscale_skips_small_frames() {
    // Arrange：宽已 ≤ 最大宽
    let mut w = 800u32;
    let mut h = 200u32;
    let mut frame: Vec<u8> = vec![0u8; (w * h * 4) as usize];
    // Act
    downscale_bgra(&mut frame, &mut w, &mut h, 960);
    // Assert：原样不动
    assert_eq!(w, 800);
    assert_eq!(h, 200);
    assert_eq!(frame.len(), 800 * 200 * 4);
}

#[test]
fn downscale_rejects_zero_max_width() {
    // Arrange
    let mut w = 1920u32;
    let mut h = 270u32;
    let mut frame: Vec<u8> = vec![0u8; (w * h * 4) as usize];
    // Act & Assert：max_width=0 不处理（防除零）
    downscale_bgra(&mut frame, &mut w, &mut h, 0);
    assert_eq!(w, 1920);
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
