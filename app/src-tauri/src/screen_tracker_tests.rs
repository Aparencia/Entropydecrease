//! ScreenTracker 在线屏分配单测（v0.7.3 REQ-155，ADR-015）。
//!
//! @ai-context: 覆盖新版面=新屏、同屏续屏、gap 分屏、翻页分屏、累积去重。

use crate::screen_tracker::ScreenTracker;

#[test]
fn first_frame_starts_screen_one() {
    // Arrange/Act：首帧（无版面信号）
    let mut t = ScreenTracker::new();
    let sid = t.assign_screen(1_000, &["系统思维".to_string()], None);
    // Assert
    assert_eq!(sid, 1);
    assert_eq!(t.current_screen_id(), 1);
}

#[test]
fn similar_frame_stays_same_screen() {
    // Arrange：屏1 标题截断变体（相似 1.0）
    let mut t = ScreenTracker::new();
    t.assign_screen(1_000, &["为什么高手管理者思路特别清晰？".to_string()], None);
    // Act：同屏变体帧（无版面变化）
    let sid = t.assign_screen(5_000, &["为什么高手管".to_string()], Some(false));
    // Assert：同屏
    assert_eq!(sid, 1);
}

#[test]
fn layout_change_starts_new_screen() {
    // Arrange：屏1 已累积
    let mut t = ScreenTracker::new();
    t.assign_screen(1_000, &["旧屏内容".to_string()], None);
    // Act：版面指纹变化（翻页）→ 新屏
    let sid = t.assign_screen(3_000, &["新屏内容".to_string()], Some(true));
    // Assert
    assert_eq!(sid, 2);
}

#[test]
fn large_gap_starts_new_screen() {
    // Arrange：屏1 首帧
    let mut t = ScreenTracker::new();
    t.assign_screen(1_000, &["系统思维".to_string()], None);
    // Act：间隔 129s > 120s 再出现（翻回旧页/长停顿）
    let sid = t.assign_screen(130_000, &["系统思维".to_string()], None);
    // Assert：gap 分屏
    assert_eq!(sid, 2);
}

#[test]
fn page_flip_starts_new_screen() {
    // Arrange：屏1 累积多块
    let mut t = ScreenTracker::new();
    t.assign_screen(
        1_000,
        &["系统思维".to_string(), "一般系统思创始人贝塔郎非认为".to_string(), "要素".to_string()],
        None,
    );
    // Act：新页（仅共享页眉 1/3 覆盖率 < 0.6）
    let sid = t.assign_screen(5_000, &["系统思维".to_string(), "牛顿第一定律".to_string(), "苹果为什么往下掉".to_string()], None);
    // Assert：翻页 → 新屏
    assert_eq!(sid, 2);
}

#[test]
fn accumulation_dedupes_seen_texts() {
    // Arrange：屏1 首帧
    let mut t = ScreenTracker::new();
    t.assign_screen(1_000, &["标题".to_string(), "正文一".to_string()], None);
    // Act：同屏帧带"正文一"截断变体（相似 1.0 同屏）
    let sid = t.assign_screen(3_000, &["标题".to_string(), "正文一的内容".to_string()], Some(false));
    // Assert：同屏；再喂一帧含同内容仍同屏（累积已并入）
    assert_eq!(sid, 1);
    let sid2 = t.assign_screen(5_000, &["标题".to_string(), "正文一的内容".to_string()], Some(false));
    assert_eq!(sid2, 1);
}
