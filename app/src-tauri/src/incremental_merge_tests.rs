//! incremental_merge 单测（v0.14 D3 spec §6：增量/翻页；AAA 模式）。

use super::*;

/// 构造帧（同屏位置默认：x=100 y=100 w=600 h=40）。
fn frame(id: u64, text: &str) -> ScreenFrame {
    ScreenFrame { id, text: text.to_string(), x: 100.0, y: 100.0, w: 600.0, h: 40.0 }
}

#[test]
fn incremental_appearance_merges_into_one_screen() {
    // Arrange：PPT 动画逐行出现——帧2 ⊇ 帧1、帧3 ⊇ 帧2（位置稳定）
    let frames = vec![
        frame(1, "第一行"),
        frame(2, "第一行第二行"),
        frame(3, "第一行第二行第三行"),
    ];
    // Act
    let merged = merge_incremental(&frames);
    // Assert：合并为一屏（id=首帧），文本为完整末帧
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].id, 1);
    assert_eq!(merged[0].text, "第一行第二行第三行");
}

#[test]
fn page_turn_creates_new_screen() {
    // Arrange：帧2 文本不包含帧1（翻页）——但位置稳定
    let frames = vec![
        frame(1, "第一页内容"),
        frame(2, "第二页全新内容"),
    ];
    // Act
    let merged = merge_incremental(&frames);
    // Assert：两屏
    assert_eq!(merged.len(), 2);
    assert_eq!(merged[0].id, 1);
    assert_eq!(merged[1].id, 2);
}

#[test]
fn bbox_shift_creates_new_screen_even_if_text_contains() {
    // Arrange：文本包含（增量假象）但 bbox 大幅位移（翻页动画——同文本不同屏）
    let frames = vec![
        frame(1, "标题内容"),
        ScreenFrame { id: 2, text: "标题内容".to_string(), x: 100.0, y: 500.0, w: 600.0, h: 40.0 },
    ];
    // Act
    let merged = merge_incremental(&frames);
    // Assert：位置位移超阈值 → 新屏（不误并）
    assert_eq!(merged.len(), 2);
}

#[test]
fn empty_first_frame_never_merges() {
    // Arrange：首帧空文本（增量前提"后帧 ⊇ 前帧"要求前帧非空）
    let frames = vec![
        frame(1, ""),
        frame(2, "第一行"),
    ];
    // Act
    let merged = merge_incremental(&frames);
    // Assert：空帧不吞并后续帧
    assert_eq!(merged.len(), 2);
}

#[test]
fn empty_input_returns_empty() {
    // Arrange/Act/Assert
    assert!(merge_incremental(&[]).is_empty());
}
