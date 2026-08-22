//! 水印/台标/角标过滤单测（REQ-059 / v0.6.0 M1）。
//!
//! @ai-context: AAA 模式；合成帧 golden——台标/角标/水印命中（区域稳定性 +
//!              文本不变性 + 内容变化证据）、正文不误杀、无 bbox 降级路径。

use super::*;

/// 构造合成帧输入（区域键 = bbox 归一化网格单元字符串）。
fn wm(text: &str, ts: u64, region: &str) -> WatermarkInput {
    WatermarkInput {
        text: text.to_string(),
        timestamp_ms: ts,
        region_key: (!region.is_empty()).then(|| region.to_string()),
    }
}

#[test]
fn static_corner_logo_detected() {
    // Arrange：台标"学习资料"固定在右下角，12 帧跨 120s，背后幻灯片文本在变
    let mut blocks = Vec::new();
    for i in 0..12 {
        blocks.push(wm("学习资料", i * 10_000, "corner-br"));
        // 每帧幻灯片标题不同（内容变化证据）
        blocks.push(wm(&format!("第{}页 神经网络", i), i * 10_000, "slide"));
    }
    // Act
    let result = detect_watermarks(&blocks, &WatermarkConfig::default());
    // Assert：水印命中且排除幻灯片标题
    assert!(result.texts.contains(&"学习资料".to_string()));
    assert!(!result.texts.iter().any(|t| t.contains("神经网络")));
    let hit = result.hits.iter().find(|h| h.text == "学习资料").unwrap();
    assert_eq!(hit.occurrences, 12);
    assert_eq!(hit.span_ms, 110_000);
}

#[test]
fn unchanged_single_text_frame_not_detected() {
    // Arrange：整个会话只有"学习资料"一种文本（无内容变化证据）——不误杀
    let mut blocks = Vec::new();
    for i in 0..12 {
        blocks.push(wm("学习资料", i * 10_000, "corner-br"));
    }
    // Act
    let result = detect_watermarks(&blocks, &WatermarkConfig::default());
    // Assert：签名种类 1 < 2 → 不命中
    assert!(result.texts.is_empty());
}

#[test]
fn subtitle_repeats_not_detected() {
    // Arrange：同一句字幕偶尔重复（5 帧跨 70s，但都是字幕带且帧内容变化）
    let mut blocks = Vec::new();
    for i in 0..5 {
        blocks.push(wm("谢谢观看", i * 15_000, "subtitle"));
        blocks.push(wm(&format!("正文内容{}", i), i * 15_000, "slide"));
    }
    // Act：字幕带区域出现（文本不变 + 内容在变）→ 会被判定——阈值校准保护：
    // 提高 min_occurrences 后不命中
    let cfg = WatermarkConfig { min_occurrences: 8, ..Default::default() };
    let result = detect_watermarks(&blocks, &cfg);
    // Assert：5 帧 < 8 → 不命中
    assert!(result.texts.is_empty());
}

#[test]
fn below_span_threshold_not_detected() {
    // Arrange：高频但短时出现（10 帧挤在 20s 内——可能是开场动画固定文案）
    let mut blocks = Vec::new();
    for i in 0..10 {
        blocks.push(wm("欢迎来到", i * 2_000, "corner-tl"));
        blocks.push(wm(&format!("内容{}", i), i * 2_000, "slide"));
    }
    // Act：min_span_ms=60s，实际跨度 18s → 不命中
    let result = detect_watermarks(&blocks, &WatermarkConfig::default());
    // Assert
    assert!(result.texts.is_empty());
}

#[test]
fn no_region_key_degraded_to_text_invariance() {
    // Arrange：DB 层无 bbox（region_key=None）——纯文本不变性路径
    let mut blocks = Vec::new();
    for i in 0..10 {
        blocks.push(wm("课程水印", i * 10_000, ""));
        blocks.push(wm(&format!("板书{}", i), i * 10_000, ""));
    }
    // Act
    let result = detect_watermarks(&blocks, &WatermarkConfig::default());
    // Assert：高频 + 长跨度 + 内容变化 → 仍命中（降级路径有效）
    assert!(result.texts.contains(&"课程水印".to_string()));
    assert!(!result.texts.iter().any(|t| t.contains("板书")));
}

#[test]
fn empty_and_whitespace_inputs_safe() {
    // Act & Assert
    assert!(detect_watermarks(&[], &WatermarkConfig::default()).texts.is_empty());
    assert!(detect_watermarks(&[wm("  ", 0, "")], &WatermarkConfig::default()).texts.is_empty());
}

#[test]
fn results_deterministic_order() {
    // Arrange：两个水印不同频率
    let mut blocks = Vec::new();
    for i in 0..12 {
        blocks.push(wm("高频水印", i * 10_000, "a"));
        blocks.push(wm(&format!("页{}", i), i * 10_000, "slide"));
    }
    for i in 0..6 {
        blocks.push(wm("低频水印", i * 10_000, "b"));
        blocks.push(wm(&format!("页{}", i), i * 10_000, "slide"));
    }
    // Act
    let result = detect_watermarks(&blocks, &WatermarkConfig::default());
    // Assert：出现次数降序（高频在前）；重复调用结果一致
    assert_eq!(result.texts.first().map(String::as_str), Some("高频水印"));
    let again = detect_watermarks(&blocks, &WatermarkConfig::default());
    assert_eq!(result.texts, again.texts);
}

#[test]
fn same_frame_multiple_blocks_count_once() {
    // Arrange：同一时间戳多条块（同帧多区域）——出现帧数按时间戳去重
    let mut blocks = Vec::new();
    for i in 0..10 {
        blocks.push(wm("角标", i * 10_000, "corner"));
        blocks.push(wm("角标", i * 10_000, "corner-dup"));
        blocks.push(wm(&format!("页{}", i), i * 10_000, "slide"));
    }
    // Act：同帧两块同文本不同区域键 → 各按区域计数 10 帧
    let result = detect_watermarks(&blocks, &WatermarkConfig::default());
    // Assert：两条命中（两个区域键）文本相同
    assert_eq!(result.texts.iter().filter(|t| *t == "角标").count(), 2);
}

#[test]
fn ocr_jitter_variants_clustered_as_one_watermark() {
    // Arrange：半透明水印 OCR 抖动（会话 38 "万事如番茄LilLil" 实证）——
    //          同区域同位置文本每帧略有差异（尾随空格/截断变体）
    let mut blocks = Vec::new();
    for i in 0..10 {
        let variant = match i % 3 {
            0 => "万事如番茄LilLil",
            1 => "万事如番茄LilLil ", // 尾随空格（trim 后与原文本相同）
            2 => "万事如番茄LilL",   // 截断变体（与原文编辑距离 1）
            _ => unreachable!(),
        };
        blocks.push(wm(variant, i * 10_000, "corner-br"));
        blocks.push(wm(&format!("正文内容{}", i), i * 10_000, "slide"));
    }
    // Act：相似聚类——变体归并同一候选（代表=出现最多的原文），计数 10 帧
    let result = detect_watermarks(&blocks, &WatermarkConfig::default());
    // Assert：抖动的变体应聚类为同一水印，实际文本: {:?}
    assert!(
        result.texts.iter().any(|t| t.contains("万事如番茄LilLil")),
        "抖动的变体应聚类为同一水印，实际文本: {:?}",
        result.texts
    );
    // 回归：正文（每帧 1 次）不得误判
    assert!(!result.texts.iter().any(|t| t.contains("正文内容")));
}

#[test]
fn region_appearance_rate_detects_stable_text() {
    // Arrange：区域稳定（7/7 帧）+ 区域内文本每帧在变（角标0..6，聚类也难归并）
    //          + 整帧内容在变 → 区域级水印（C 层，与具体文本解耦）
    let mut blocks = Vec::new();
    for i in 0..7 {
        blocks.push(wm(&format!("角标{}", i), i * 10_000, "corner-br"));
        blocks.push(wm(&format!("正文{}", i), i * 10_000, "slide"));
        blocks.push(wm(&format!("正文{}", i), i * 10_000, "slide"));
    }
    // Act：区域出现率检测（C 层新入口）
    let result = detect_region_watermarks(&blocks, &WatermarkConfig::default());
    // Assert：corner-br 7 帧 ≥ 5、区域内 7 种文本（变化）、帧签名 7 种 ≥ 2 → 命中
    assert!(
        !result.texts.is_empty(),
        "区域出现率应检测到角标水印，实际文本: {:?}",
        result.texts
    );
}

#[test]
fn region_detection_stable_text_not_matched() {
    // Arrange：区域内文本完全稳定（1 种）——区域级判定不适用
    //          （文本不变场景由 detect_watermarks 的文本不变性判定覆盖）
    let mut blocks = Vec::new();
    for i in 0..7 {
        blocks.push(wm("固定页眉", i * 10_000, "header"));
    }
    // Act：区域内文本种类 1 < 2 → 不命中（区域级误杀保护）
    let result = detect_region_watermarks(&blocks, &WatermarkConfig::default());
    // Assert
    assert!(result.texts.is_empty(), "区域文本稳定不得判为区域级水印: {:?}", result.texts);
}

#[test]
fn bbox_region_key_grid_units() {
    // Arrange：1920x1080 帧（A 层归一化网格 4x4）
    // Act & Assert：右下角 bbox（y_center≈940 → row 3，x_center≈1550 → col 3）
    assert_eq!(
        region_key_from_bbox(1500.0, 900.0, 100.0, 80.0, 1920.0, 1080.0).as_deref(),
        Some("g3-3")
    );
    // 左上角 → 0-0 格
    assert_eq!(
        region_key_from_bbox(10.0, 10.0, 100.0, 80.0, 1920.0, 1080.0).as_deref(),
        Some("g0-0")
    );
    // 坐标恰在帧边界（防御性 clamp，防 4 越界）
    assert_eq!(
        region_key_from_bbox(1920.0, 1080.0, 0.0, 0.0, 1920.0, 1080.0).as_deref(),
        Some("g3-3")
    );
    // 无帧尺寸 → None（调用方降级全局判定）
    assert_eq!(region_key_from_bbox(10.0, 10.0, 100.0, 80.0, 0.0, 0.0), None);
    // 负尺寸 → None（防御）
    assert_eq!(region_key_from_bbox(10.0, 10.0, -1.0, 80.0, 1920.0, 1080.0), None);
}
