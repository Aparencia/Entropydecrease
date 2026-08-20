//! 笔记过滤管线单测（REQ-082 / v0.6.0 M1）。
//!
//! @ai-context: AAA 模式；覆盖过滤链各环节（重复/碎片/低置信/UI 垃圾）、
//!              误杀保护（正常长句/数字内容）、画面要点净化。
//! @ai-context: REQ-085 边界段与 AI 判定测试在 note_filter_ai_tests.rs
//!              （本文件 ≤300 行，AGENTS.md §3）。

use super::*;
use crate::ui_junk::UiJunkList;

/// 构造会话段（source 与 confidence 可指定——asr/fused 混杂与低置信场景）。
fn seg(id: i64, start: u64, end: u64, text: &str, source: &str, conf: Option<f32>) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms: start,
        end_ms: end,
        text: text.to_string(),
        source: source.to_string(),
        confidence: conf,
            volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None,
    }
}

fn asr(id: i64, start: u64, end: u64, text: &str) -> SessionSegment {
    seg(id, start, end, text, "asr", Some(0.9))
}

fn block(ts: u64, text: &str, score: f32) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score,
        region: "full".to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }
}

fn junk() -> UiJunkList {
    UiJunkList::defaults()
}

/// 净化环境（v0.7.5 REQ-173 内置默认——测试零配置噪音）。
fn env() -> crate::note_filter::PurifyEnv {
    crate::note_filter::PurifyEnv::default()
}

/// 净化管线入口（与生产同签名——v0.7.5 起 filter_note 携带净化环境）。
fn run(title: &str, segments: &[SessionSegment], blocks: &[SessionOcrBlock]) -> NoteFilterResult {
    filter_note(title, segments, blocks, &junk(), &env())
}

#[test]
fn adjacent_duplicates_merged_across_sources() {
    // Arrange：同文本连续段（asr + fused 混杂——融合窗口配额的兜底场景）
    let segments = vec![
        asr(1, 0, 3000, "今天是周一"),
        seg(2, 3000, 6000, "今天是周一", "fused", Some(0.8)),
        asr(3, 6000, 9000, "我们开始上课"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：重复段合并（kept 2 段，end 延伸），统计与对照表正确
    assert_eq!(result.kept.len(), 2);
    assert_eq!(result.kept[0].end_ms, 6000);
    assert_eq!(result.stats.duplicates, 1);
    assert_eq!(result.filtered.len(), 1);
    assert_eq!(result.filtered[0].reason, FilterReason::Duplicate);
    assert_eq!(result.merged.len(), 1);
    // 讲述内容只出现一次
    assert_eq!(result.markdown.matches("今天是周一").count(), 1);
}

#[test]
fn non_adjacent_same_text_not_merged() {
    // Arrange：同文本但中间隔着其他段（不是连续重复——不合并）
    let segments = vec![asr(1, 0, 1000, "要点一"), asr(2, 1000, 2000, "中间内容"), asr(3, 2000, 3000, "要点一")];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：三段全保留
    assert_eq!(result.kept.len(), 3);
    assert_eq!(result.stats.duplicates, 0);
}

#[test]
fn fragments_dropped() {
    // Arrange：三种碎片（≤2 字 / <500ms / 纯符号）与正常段混排
    let segments = vec![
        asr(1, 0, 1000, "嗯"),
        asr(2, 1000, 3000, "这是一句正常的话"),
        asr(3, 3000, 3300, "碎片"), // 300ms < 500ms
        asr(4, 4000, 5000, "----"),
        asr(5, 5000, 6000, "正常长句"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：三碎片被过滤（"嗯"≤2 字；"碎片"时长不足；"----"纯符号）
    assert_eq!(result.stats.fragments, 3);
    assert!(result.kept.iter().any(|s| s.text.contains("正常长句")));
    assert_eq!(result.kept.len(), 2);
}

#[test]
fn numbers_and_symbols_not_misclassified_as_fragments() {
    // Arrange：误杀保护——数字/符号内容不是"纯符号"碎片
    let segments = vec![
        asr(1, 0, 1000, "3.14 是圆周率"),
        asr(2, 1000, 2000, "2024年"),
        asr(3, 2000, 3000, "F=ma"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert：全部保留（含字母数字的短文本不误删）
    assert_eq!(result.kept.len(), 3);
    assert_eq!(result.stats.fragments, 0);
}

#[test]
fn low_confidence_dropped() {
    // Arrange：低置信 ASR 段（0.5 < 0.6）丢弃；高置信与无置信度保留
    let segments = vec![
        seg(1, 0, 1000, "听不清的内容", "asr", Some(0.5)),
        seg(2, 1000, 2000, "清晰内容", "asr", Some(0.8)),
        seg(3, 2000, 3000, "字幕段", "subtitle", None),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert
    assert_eq!(result.stats.low_confidence, 1);
    assert_eq!(result.kept.len(), 2);
    // v0.7.5：净化后文本带句号——按包含断言
    assert!(result.kept.iter().any(|s| s.text.contains("字幕段")));
}

#[test]
fn ui_junk_fallback_filtered() {
    // Arrange：源头漏拦的 UI 垃圾（REQ-083 同表兜底）
    let segments = vec![
        asr(1, 0, 1000, "回到主界面"),
        asr(2, 1000, 2000, "倍速 1.25"),
        asr(3, 2000, 3000, "正常教学内容"),
    ];
    // Act
    let result = run("测试", &segments, &[]);
    // Assert
    assert_eq!(result.stats.ui_junk, 2);
    assert_eq!(result.kept.len(), 1);
}

#[test]
fn ocr_points_exclude_watermark_junk_and_dupes() {
    // Arrange：水印"学习资料"每帧出现（7 帧跨 60s+，内容在变）；UI 垃圾块；重复块
    let mut blocks: Vec<SessionOcrBlock> = Vec::new();
    for i in 0..7 {
        blocks.push(block(i * 10_000, "学习资料", 0.9));
        blocks.push(block(i * 10_000, format!("幻灯片{}", i).as_str(), 0.9));
    }
    blocks.push(block(70_000, "选集", 0.9));
    blocks.push(block(80_000, "牛顿第二定律", 0.9));
    blocks.push(block(90_000, "牛顿第二定律", 0.9));
    blocks.push(block(100_000, "噪声", 0.3));
    // Act
    let result = run("测试", &[], &blocks);
    // Assert：水印/UI 垃圾/低分/重复全排除，正文保留
    assert!(result.ocr_points.iter().any(|p| p.contains("牛顿第二定律")));
    assert!(!result.ocr_points.iter().any(|p| p.contains("学习资料")));
    assert!(!result.ocr_points.iter().any(|p| p.contains("选集")));
    assert!(!result.ocr_points.iter().any(|p| p.contains("噪声")));
    assert_eq!(result.ocr_points.iter().filter(|p| p.contains("牛顿")).count(), 1);
    assert!(result.markdown.contains("## 画面要点"));
}

#[test]
fn subtitle_region_blocks_not_in_ocr_points() {
    // Arrange：字幕区块（region=subtitle）不进画面要点（讲述内容已覆盖）
    let blocks = vec![SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: 1000,
        text: "字幕文本".into(),
        score: 0.9,
        region: "subtitle".into(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }];
    // Act
    let result = run("测试", &[], &blocks);
    // Assert
    assert!(result.ocr_points.is_empty());
}

#[test]
fn empty_inputs_produce_title_only() {
    // Act
    let result = run("空会话", &[], &[]);
    // Assert
    assert_eq!(result.markdown, "# 空会话");
    assert!(result.stats == FilterStats::default());
}

#[test]
fn filter_note_is_pure_and_deterministic() {
    // Arrange
    let segments = vec![asr(1, 0, 1000, "第一句"), asr(2, 1000, 2000, "第二句")];
    let blocks = vec![block(500, "要点", 0.9)];
    // Act：同一输入两次调用
    let a = run("标题", &segments, &blocks);
    let b = run("标题", &segments, &blocks);
    // Assert：结果一致（单一管线双出口一致性的构造保证）
    assert_eq!(a.markdown, b.markdown);
    assert_eq!(a, b);
}
