//! 网格差异检测与面板事件单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 grid_diff.rs 以 #[cfg(test)] #[path] 引入，保持实现文件 ≤300 行。
//! @ai-context: 回归用例（本次 bug，ADR-011）：1920 宽静止帧 + 底部左对齐字幕行
//!              变化——旧 8 块采样 hash 的采样列仅 {0,480,960,1440}（字节步长
//!              17280 → 列 = i·4320 mod 1920），字幕块 x 50..350 不含任何采样列
//!              → 完全漏检；网格指纹按格全覆盖采样 → 必命中。

use crate::capture::frame_diff::Rect;
use crate::capture::grid_diff::{
    is_outside_band, GridDiffDetector, PanelDetector, GRID_COLS, GRID_ROWS, LARGE_CHANGE_RATIO,
    PANEL_MIN_AREA_RATIO, ROI_COLS, ROI_ROWS,
};

/// 灰阶 BGRA 帧（各通道同值 → 亮度 = value）。
fn frame(w: u32, h: u32, value: u8) -> Vec<u8> {
    vec![value; w as usize * h as usize * 4]
}

/// 在帧内画一个亮色矩形块（模拟文字块/字幕行）。
fn paint_rect(buf: &mut [u8], w: u32, x0: u32, y0: u32, x1: u32, y1: u32, value: u8) {
    for y in y0..y1.min(buf.len() as u32 / (w * 4)) {
        for x in x0..x1.min(w) {
            let i = (y * w + x) as usize * 4;
            buf[i..i + 4].copy_from_slice(&[value, value, value, 255]);
        }
    }
}

/// 全帧网格（1920×1080）：32×18 格，每格 60×60px。
fn full_grid() -> GridDiffDetector {
    GridDiffDetector::new(GRID_COLS, GRID_ROWS)
}

#[test]
fn first_frame_is_fully_changed() {
    // Arrange & Act：首帧无基准
    let mut d = full_grid();
    let diff = d.diff(&frame(1920, 1080, 30), 1920, 1080);
    // Assert：全格视为变化（与旧 has_changed 首帧语义一致）
    assert_eq!(diff.changed_cells.len(), (GRID_COLS * GRID_ROWS) as usize);
    assert!(diff.bounds.is_some());
}

#[test]
fn identical_frame_is_unchanged() {
    // Arrange
    let mut d = full_grid();
    d.diff(&frame(1920, 1080, 30), 1920, 1080);
    // Act
    let diff = d.diff(&frame(1920, 1080, 30), 1920, 1080);
    // Assert
    assert!(diff.changed_cells.is_empty());
    assert!(diff.bounds.is_none());
    assert_eq!(diff.changed_ratio, 0.0);
}

#[test]
fn regression_left_aligned_subtitle_on_1920_is_detected() {
    // ADR-011 回归用例：1920 宽静止帧 + 底部左对齐字幕行（x 50..350, y 1000..1050，
    // 50px 高 ≈ 1080p 真实字幕行高）
    // 旧 8 块采样：块 8（底部 1/8）采样列 = {0,480,960,1440}，字幕块不含任何采样列 → 漏检
    let mut buf = frame(1920, 1080, 30);
    paint_rect(&mut buf, 1920, 50, 1000, 350, 1050, 200);
    // Arrange：先喂基准帧（无字幕）
    let mut d = full_grid();
    d.diff(&frame(1920, 1080, 30), 1920, 1080);
    // Act：字幕行出现
    let diff = d.diff(&buf, 1920, 1080);
    // Assert：命中且包围盒覆盖字幕块（格 60px：x 格 0..5、y 格 16..17；
    // 格 16 采样 y=1005、格 17 采样 y=1035 均落在字幕行内）
    assert!(!diff.changed_cells.is_empty(), "字幕行变化必须命中（旧算法漏检场景）");
    let b = diff.bounds.expect("bounds");
    assert!(b.left as u32 <= 50 && b.right as u32 >= 350);
    assert!(b.top as u32 <= 1000 && b.bottom as u32 >= 1050);
    // 局部小变化不触发大面积判定（2% < 8%）
    assert!(diff.changed_ratio < LARGE_CHANGE_RATIO);
}

#[test]
fn local_change_at_any_position_is_detected() {
    // 左上 / 中央 / 右下三个位置的小文字块都必须命中（网格全覆盖采样，无混叠）
    let positions = [(0u32, 0u32, 100u32, 30u32), (860, 500, 1060, 580), (1800, 1040, 1920, 1080)];
    for (x0, y0, x1, y1) in positions {
        let mut buf = frame(1920, 1080, 30);
        paint_rect(&mut buf, 1920, x0, y0, x1, y1, 200);
        let mut d = full_grid();
        d.diff(&frame(1920, 1080, 30), 1920, 1080);
        // Act
        let diff = d.diff(&buf, 1920, 1080);
        // Assert
        assert!(!diff.changed_cells.is_empty(), "位置 ({x0},{y0})-({x1},{y1}) 变化必须命中");
    }
}

#[test]
fn size_change_marks_all_cells_changed() {
    // Arrange
    let mut d = full_grid();
    d.diff(&frame(640, 360, 30), 640, 360);
    // Act：窗口尺寸变化（换分辨率/缩放）
    let diff = d.diff(&frame(1920, 1080, 30), 1920, 1080);
    // Assert：全格视为变化（旧基准失效）
    assert_eq!(diff.changed_cells.len(), (GRID_COLS * GRID_ROWS) as usize);
}

#[test]
fn empty_or_mismatched_frame_is_defensive() {
    // Act & Assert：空帧 / 尺寸不匹配 → 空变化，不 panic 不触发
    let mut d = full_grid();
    assert!(d.diff(&[], 0, 0).changed_cells.is_empty());
    assert!(d.diff(&[0u8; 100], 1920, 1080).changed_cells.is_empty());
}

#[test]
fn roi_grid_uses_finer_layout() {
    // ROI 裁剪帧（8×4）：字幕行变化命中（网格数少但粒度仍覆盖）
    let mut d = GridDiffDetector::new(ROI_COLS, ROI_ROWS);
    d.diff(&frame(960, 270, 30), 960, 270);
    // 底部单行字幕（y 200..240, 全宽）
    let mut buf = frame(960, 270, 30);
    paint_rect(&mut buf, 960, 0, 200, 960, 240, 200);
    let diff = d.diff(&buf, 960, 270);
    assert!(!diff.changed_cells.is_empty());
}

#[test]
fn outside_band_flags_change_above_band() {
    // Arrange：字幕带 = 底部 25%（y 810..1080，prior_roi 语义）
    let band = Rect { left: 0, top: 810, right: 1920, bottom: 1080 };
    // 带外变化（中央 y 500..580 → 格 8..9 → bounds 480..600）
    let mut buf = frame(1920, 1080, 30);
    paint_rect(&mut buf, 1920, 860, 500, 1060, 580, 200);
    let mut d = full_grid();
    d.diff(&frame(1920, 1080, 30), 1920, 1080);
    let diff = d.diff(&buf, 1920, 1080);
    // Act & Assert
    assert!(is_outside_band(diff.bounds.as_ref(), &band, diff.changed_ratio, LARGE_CHANGE_RATIO));
}

#[test]
fn inside_band_change_is_not_outside() {
    // Arrange：带内变化（字幕行 y 1000..1040 → bounds 960..1080，与带相交）
    let band = Rect { left: 0, top: 810, right: 1920, bottom: 1080 };
    let mut buf = frame(1920, 1080, 30);
    paint_rect(&mut buf, 1920, 50, 1000, 350, 1040, 200);
    let mut d = full_grid();
    d.diff(&frame(1920, 1080, 30), 1920, 1080);
    let diff = d.diff(&buf, 1920, 1080);
    // Act & Assert：局部带内变化 → 非带外（字幕路径专用，不触发全帧）
    assert!(!is_outside_band(diff.bounds.as_ref(), &band, diff.changed_ratio, LARGE_CHANGE_RATIO));
}

#[test]
fn large_change_is_outside_even_inside_band() {
    // Arrange：上半帧全部变化（50% 格）——翻页/场景切换级
    let band = Rect { left: 0, top: 810, right: 1920, bottom: 1080 };
    let mut buf = frame(1920, 1080, 30);
    paint_rect(&mut buf, 1920, 0, 0, 1920, 540, 200);
    let mut d = full_grid();
    d.diff(&frame(1920, 1080, 30), 1920, 1080);
    let diff = d.diff(&buf, 1920, 1080);
    // Act & Assert：大面积变化 → 视为页面级变化（即使 bounds 不与带相交判定也无所谓）
    assert!(diff.changed_ratio >= LARGE_CHANGE_RATIO);
    assert!(is_outside_band(diff.bounds.as_ref(), &band, diff.changed_ratio, LARGE_CHANGE_RATIO));
}

#[test]
fn outside_band_none_bounds_is_false() {
    // 无变化 → 非带外（防御）
    assert!(!is_outside_band(None, &Rect { left: 0, top: 0, right: 10, bottom: 10 }, 0.0, LARGE_CHANGE_RATIO));
}

// ── PanelDetector 状态机 ────────────────────────────────────────────────

/// 大面积变化格（16×8 = 128 格 = 22% ≥ 8% 阈值；模拟控制栏/弹窗面板）。
fn big_cluster(cols: usize) -> Vec<usize> {
    (0..8usize).flat_map(|r| (0..16usize).map(move |c| r * cols + c)).collect()
}

/// 窄带变化格（单行 32 格 = 5.6% < 8%；模拟滚动字幕/弹幕）。
fn band_cluster(cols: usize) -> Vec<usize> {
    (0..cols).collect()
}

#[test]
fn panel_confirms_after_two_ticks() {
    // Arrange
    let mut p = PanelDetector::default();
    let cells = big_cluster(GRID_COLS as usize);
    // Act & Assert：首 tick 候选未确认
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 0);
    assert!(!p.is_active());
    // 同区域第二 tick → 确认活跃
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 1000);
    assert!(p.is_active());
}

#[test]
fn small_cluster_never_becomes_panel() {
    // Arrange：单格变化（0.2%）——鼠标/光标级噪声
    let mut p = PanelDetector::default();
    for t in 0..10u64 {
        p.feed(&[0], GRID_COLS as usize, GRID_ROWS as usize, t * 1000);
    }
    // Assert
    assert!(!p.is_active());
}

#[test]
fn scrolling_band_never_becomes_panel() {
    // Arrange：滚动字幕/弹幕 = 窄带持续变化（面积不足阈值）
    let mut p = PanelDetector::default();
    let cells = band_cluster(GRID_COLS as usize);
    for t in 0..10u64 {
        p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, t * 1000);
    }
    // Assert：不误判为面板
    assert!(!p.is_active());
}

#[test]
fn panel_sliding_window_resets_on_recurring_change() {
    // Arrange：t0 候选、t1000 确认（活跃至 4000）
    let mut p = PanelDetector::default();
    let cells = big_cluster(GRID_COLS as usize);
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 0);
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 1000);
    assert!(p.is_active());
    // Act：t4000 面板区域再次变化 → 滑动窗口重置（活跃至 7000）
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 4000);
    assert!(p.is_active());
    // t6000 面板仍在（区域持续变化）→ 重置窗口（活跃至 9000）
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 6000);
    assert!(p.is_active());
    // t10000：最后区域变化在 6000——窗口（9000）已到期 → 结束
    p.feed(&[], GRID_COLS as usize, GRID_ROWS as usize, 10000);
    assert!(!p.is_active());
}

#[test]
fn panel_window_expires_after_hold_without_recurring_change() {
    // 确认后无再变化（静止面板/弹窗停住）：滑动窗口自然到期，不提前结束——
    // 静止面板是控制栏悬停常态，提前结束会放过它（实现微调 2026-08-19）
    let mut p = PanelDetector::default();
    let cells = big_cluster(GRID_COLS as usize);
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 0);
    p.feed(&cells, GRID_COLS as usize, GRID_ROWS as usize, 1000);
    assert!(p.is_active());
    // 窗口到期前（t2000/t3500 < 4000）无变化 → 仍活跃（静止面板防护）
    p.feed(&[], GRID_COLS as usize, GRID_ROWS as usize, 2000);
    assert!(p.is_active(), "静止面板不得提前结束（滑动窗口内）");
    p.feed(&[], GRID_COLS as usize, GRID_ROWS as usize, 3500);
    assert!(p.is_active());
    // t4000 窗口到期 → 结束
    p.feed(&[], GRID_COLS as usize, GRID_ROWS as usize, 4000);
    assert!(!p.is_active());
}

#[test]
fn moved_panel_requires_reconfirmation() {
    // Arrange：原区域候选（未确认）
    let mut p = PanelDetector::default();
    let a = big_cluster(GRID_COLS as usize);
    p.feed(&a, GRID_COLS as usize, GRID_ROWS as usize, 0);
    // Act：面板移动到不重叠区域（列偏移 16）→ 候选重置
    let b: Vec<usize> = (0..8usize).flat_map(|r| (16..32usize).map(move |c| r * GRID_COLS as usize + c)).collect();
    p.feed(&b, GRID_COLS as usize, GRID_ROWS as usize, 1000);
    assert!(!p.is_active(), "移动后的新区域需重新确认");
    // 新区域连续 2 tick → 确认
    p.feed(&b, GRID_COLS as usize, GRID_ROWS as usize, 2000);
    assert!(p.is_active());
}

#[test]
fn threshold_boundary_47_cells_confirms() {
    // 边界：576 × 8% = 46.08 —— 46 格（7.99%）不达阈值，47 格（8.16%）达阈值
    let mut p = PanelDetector::default();
    let cols = GRID_COLS as usize;
    let small: Vec<usize> = (0..46usize).collect();
    p.feed(&small, cols, GRID_ROWS as usize, 0);
    p.feed(&small, cols, GRID_ROWS as usize, 1000);
    assert!(!p.is_active(), "46 格（7.99%）低于阈值");
    let big: Vec<usize> = (0..47usize).collect();
    p.feed(&big, cols, GRID_ROWS as usize, 2000);
    p.feed(&big, cols, GRID_ROWS as usize, 3000);
    assert!(p.is_active(), "47 格（8.16%）达到阈值");
    // 47 格连续不重叠区域（列 0..47 跨 1 行）——bbox 与 46 格（0..46）重叠 → 计数连续
}

#[test]
fn panel_ratio_constant_matches_design() {
    // 设计与实现一致性：面积阈值常量与网格密度匹配设计规格
    assert_eq!(PANEL_MIN_AREA_RATIO, 0.08);
    assert_eq!(GRID_COLS, 32);
    assert_eq!(GRID_ROWS, 18);
}
