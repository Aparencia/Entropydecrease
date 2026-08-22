//! anchor_strip 单测（AA 纯函数；独立文件——anchor_strip.rs 保持 ≤100 行）。

use super::*;

#[test]
fn strip_removes_paragraph_anchors() {
    let md = "[⏱ 00:00]([[ts:0]]) 项目启动是一个艺术。\n\n[⏱ 01:03]([[ts:63000]]) 这是项目章程。";
    let out = strip_anchors(md);
    assert_eq!(out, "项目启动是一个艺术。\n\n这是项目章程。\n\n", "段落锚点应全剥离");
}

#[test]
fn strip_keeps_chapter_title_and_records_anchor() {
    let md = "## 项目章程 [[⏱ 00:09]([[ts:9000]])]";
    let (out, anchors) = strip_anchors_with_map(md);
    assert_eq!(out, "## 项目章程\n");
    assert_eq!(anchors, vec![("项目章程".to_string(), 9000)]);
}

#[test]
fn reattach_restores_chapter_anchors() {
    let anchors = vec![("项目章程".to_string(), 9000)];
    let out = reattach_chapter_anchors("## 项目章程\n正文", &anchors);
    assert_eq!(out, "## 项目章程 [[⏱ 00:09]([[ts:9000]])]\n正文");
}

#[test]
fn empty_input_safe() {
    assert_eq!(strip_anchors(""), "");
    let (s, a) = strip_anchors_with_map("");
    assert!(s.is_empty() && a.is_empty());
}
