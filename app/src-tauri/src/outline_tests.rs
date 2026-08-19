//! 课程大纲检测单测（REQ-077 / v0.6.0 M6）。
//!
//! @ai-context: AAA 模式；合成幻灯片帧——标题块/正文句/重复标题/低分噪声。

use super::*;

fn block(ts: u64, text: &str, score: f32, region: &str) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score,
        region: region.to_string(),
        region_kind: None,
    }
}

#[test]
fn slide_titles_produce_outline() {
    // Arrange：三张幻灯片标题（短文本无标点）+ 正文（有标点长句）
    let blocks = vec![
        block(1_000, "第一章 神经网络概述", 0.95, "full"),
        block(5_000, "神经网络是机器学习的重要分支。", 0.9, "full"),
        block(61_000, "第二章 反向传播算法", 0.95, "full"),
    ];
    // Act
    let outline = detect_outline(&blocks, &OutlineConfig::default());
    // Assert：两条标题进大纲（正文句排除）
    assert_eq!(outline.len(), 2);
    assert_eq!(outline[0].text, "第一章 神经网络概述");
    assert_eq!(outline[1].time_ms, 61_000);
}

#[test]
fn repeated_title_deduped() {
    // Arrange：标题停留 30s（多帧复现）→ 60s 内只出一条
    let blocks = vec![
        block(1_000, "第三章 卷积神经网络", 0.95, "full"),
        block(30_000, "第三章 卷积神经网络", 0.95, "full"),
        block(90_000, "第三章 卷积神经网络", 0.95, "full"), // 90s 后复现 → 新条目
    ];
    // Act
    let outline = detect_outline(&blocks, &OutlineConfig::default());
    // Assert：两条（1s 与 90s）
    assert_eq!(outline.len(), 2);
    assert_eq!(outline[0].time_ms, 1_000);
    assert_eq!(outline[1].time_ms, 90_000);
}

#[test]
fn noisy_blocks_excluded() {
    // Arrange：低分噪声 / 纯符号 / 超长文本 / 句末标点 全排除
    let blocks = vec![
        block(1_000, "标题", 0.3, "full"), // 低分
        block(2_000, "----", 0.9, "full"), // 纯符号
        block(3_000, "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十", 0.9, "full"), // 超长（30 字）
        block(4_000, "这句话有句号。", 0.9, "full"), // 句末标点
        block(5_000, "真标题", 0.9, "full"), // 唯一有效
    ];
    // Act
    let outline = detect_outline(&blocks, &OutlineConfig::default());
    // Assert：仅"真标题"
    assert_eq!(outline.len(), 1);
    assert_eq!(outline[0].text, "真标题");
}

#[test]
fn subtitle_region_blocks_ignored() {
    // Arrange：字幕区文本不进大纲（讲述内容不是标题）
    let blocks = vec![block(1_000, "第一章 概述", 0.95, "subtitle")];
    // Act
    let outline = detect_outline(&blocks, &OutlineConfig::default());
    // Assert
    assert!(outline.is_empty());
}

#[test]
fn empty_inputs_safe() {
    assert!(detect_outline(&[], &OutlineConfig::default()).is_empty());
}
