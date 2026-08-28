//! chapter_note 单测（v0.14 D3；AAA 模式——纯函数，无 IO）。
//!
//! @ai-context: golden 口径——图文章节 = OCR 屏段落主体 + `> 讲者：` 引用块；
//!              口语章节 = 现状段落（低质量 OCR 弃用——门控内建，spec §4.1）。

use super::{assemble_hybrid_note, chapter_quality_scores};
use crate::chapter_detect::ChapterBoundary;
use crate::outline::OutlineEntry;
use crate::types::{SessionOcrBlock, SessionScreen};

fn boundary(ms: u64) -> ChapterBoundary {
    ChapterBoundary { time_ms: ms, votes: 2, topic_drop: 0.5 }
}

fn outline(ms: u64, text: &str) -> OutlineEntry {
    OutlineEntry { time_ms: ms, text: text.to_string() }
}

fn paragraph(start_ms: u64, text: &str) -> (u64, String) {
    (start_ms, text.to_string())
}

fn screen(first_seen: u64, title: Option<&str>, body: &[&str]) -> SessionScreen {
    SessionScreen {
        session_id: 1,
        screen_id: Some(1),
        first_seen_ms: first_seen,
        last_seen_ms: first_seen + 500,
        title: title.map(|s| s.to_string()),
        body: body.iter().map(|s| s.to_string()).collect(),
        labels: vec![],
        image_ref: None,
        structure: vec![],
    }
}

fn block(id: i64, ts: u64, text: &str, score: f32, region: &str) -> SessionOcrBlock {
    SessionOcrBlock {
        id,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score,
        region: region.to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }
}

// ── 图文章节（OCR 主体 + 口语引用块）──────────────────────────────

#[test]
fn graphic_chapter_uses_ocr_body_with_speaker_quotes() {
    // Arrange：1 章（9000ms）+ outline 标题命中 + 高质量 OCR 屏 + 口播
    let paragraphs = vec![paragraph(10_000, "这里我们讲红色"), paragraph(12_000, "蓝色大家记一下")];
    let chapters = vec![boundary(9_000)];
    let outline = vec![outline(9_500, "色彩基础")];
    let screens = vec![screen(10_000, Some("第一节 色相"), &["红色代表热情", "蓝色代表冷静"])];
    let quality = vec![0.9];

    // Act
    let (lines, titled) =
        assemble_hybrid_note(&paragraphs, &chapters, &outline, &screens, &quality, true);

    // Assert：标题命中 outline；OCR 主体在引用块之前；引用块带时间戳锚点
    assert!(lines[0].starts_with("## 色彩基础 [[⏱ 00:09]([[ts:9000]])]"));
    assert!(lines.contains(&"**第一节 色相**".to_string()));
    let ocr_pos = lines.iter().position(|l| l == "红色代表热情").unwrap();
    let quote_pos = lines.iter().position(|l| l == "> 讲者：[⏱ 00:10]([[ts:10000]]) 这里我们讲红色").unwrap();
    assert!(ocr_pos < quote_pos, "OCR 主体应先于口语引用块");
    assert!(lines.contains(&"> 讲者：[⏱ 00:12]([[ts:12000]]) 蓝色大家记一下".to_string()));
    assert_eq!(titled, 1);
}

#[test]
fn graphic_chapter_anchor_off_omits_timestamps() {
    // Arrange：同图文形态但锚点关（净化配置 anchor_timestamps=false）
    let paragraphs = vec![paragraph(10_000, "这里我们讲红色")];
    let chapters = vec![boundary(9_000)];
    let screens = vec![screen(10_000, None, &["红色代表热情"])];
    let quality = vec![0.9];

    // Act
    let (lines, _) = assemble_hybrid_note(&paragraphs, &chapters, &[], &screens, &quality, false);

    // Assert：标题仍带章节锚点（与 structure_note 一致）；引用块无时间戳
    assert!(lines[0].starts_with("## 章节 1 [[⏱ 00:09]([[ts:9000]])]"));
    assert!(lines.contains(&"> 讲者：这里我们讲红色".to_string()));
}

// ── 口语章节（现状段落 + 质量门控）────────────────────────────────

#[test]
fn spoken_chapter_keeps_plain_paragraphs() {
    // Arrange：低质量 OCR（质量 < QUALITY_TH）→ 口语章节——OCR 弃用
    let paragraphs = vec![paragraph(10_000, "这里我们讲红色")];
    let chapters = vec![boundary(9_000)];
    let screens = vec![screen(10_000, Some("第一节 色相"), &["红色代表热情"])];
    let quality = vec![0.3];

    // Act
    let (lines, _) = assemble_hybrid_note(&paragraphs, &chapters, &[], &screens, &quality, true);

    // Assert：口语现状（无 OCR 标题行、无引用块、无 OCR 正文）
    assert!(lines[0].starts_with("## 章节 1 "));
    assert!(lines.contains(&"[⏱ 00:10]([[ts:10000]]) 这里我们讲红色".to_string()));
    assert!(!lines.iter().any(|l| l.starts_with("**")));
    assert!(!lines.iter().any(|l| l.starts_with("> 讲者")));
    assert!(!lines.iter().any(|l| l.contains("红色代表热情")));
}

#[test]
fn quality_gate_mixes_graphic_and_spoken_in_one_note() {
    // Arrange：两章——第一章高质量 → 图文；第二章低质量 → 口语（门控内建）
    let paragraphs = vec![paragraph(10_000, "第一章口播"), paragraph(35_000, "第二章口播")];
    let chapters = vec![boundary(9_000), boundary(30_000)];
    let screens = vec![
        screen(10_000, Some("第一章"), &["第一章长文本内容足够"]),
        screen(35_000, Some("第二章"), &["碎片"]),
    ];
    let quality = vec![0.9, 0.3];

    // Act
    let (lines, _) = assemble_hybrid_note(&paragraphs, &chapters, &[], &screens, &quality, true);

    // Assert：第一章图文（OCR 主体 + 引用块）；第二章口语（低质量 OCR 不进正文）
    let joined = lines.join("\n");
    assert!(joined.contains("**第一章**") && joined.contains("第一章长文本内容足够"));
    assert!(joined.contains("> 讲者：[⏱ 00:10]([[ts:10000]]) 第一章口播"));
    assert!(!joined.contains("**第二章**"), "低质量章节 OCR 弃用（门控）");
    assert!(!joined.contains("碎片"), "低质量 OCR 文本不得进正文");
    assert!(joined.contains("[⏱ 00:35]([[ts:35000]]) 第二章口播"), "口语现状段落");
}

#[test]
fn no_text_screens_falls_back_to_spoken() {
    // Arrange：OCR 屏 body 为空（纯图屏/新数据 ADR-023）——即使高分也无 OCR 可组装
    let paragraphs = vec![paragraph(10_000, "纯图屏讲解")];
    let chapters = vec![boundary(9_000)];
    let screens = vec![screen(10_000, Some("纯图"), &[])];
    let quality = vec![0.9];

    // Act
    let (lines, _) = assemble_hybrid_note(&paragraphs, &chapters, &[], &screens, &quality, true);

    // Assert：全口语（无 OCR 主体、无引用块）
    let joined = lines.join("\n");
    assert!(joined.contains("[⏱ 00:10]([[ts:10000]]) 纯图屏讲解"));
    assert!(!joined.contains("**纯图**") && !joined.contains("> 讲者"));
}

// ── 退化路径（无章节/开场段）──────────────────────────────────────

#[test]
fn no_chapters_returns_empty_lines() {
    // Arrange：空章节边界（调用层保证不会传——本层不发明标题）
    let paragraphs = vec![paragraph(10_000, "内容")];

    // Act
    let (lines, titled) = assemble_hybrid_note(&paragraphs, &[], &[], &[], &[], true);

    // Assert：空输出 + 零标题命中
    assert!(lines.is_empty());
    assert_eq!(titled, 0);
}

#[test]
fn opening_paragraphs_before_first_boundary_stay_plain() {
    // Arrange：开场段（首边界前）——口语现状（与 structure_note 标题插入语义一致）
    let paragraphs = vec![paragraph(5_000, "开场白"), paragraph(10_000, "第一章内容")];
    let chapters = vec![boundary(9_000), boundary(30_000)];
    let quality = vec![0.9, 0.9];

    // Act
    let (lines, _) = assemble_hybrid_note(&paragraphs, &chapters, &[], &[], &quality, true);

    // Assert：开场段带锚点在第一个标题之前
    let opening_pos = lines.iter().position(|l| l.contains("开场白")).unwrap();
    let heading_pos = lines.iter().position(|l| l.starts_with("## 章节 1 ")).unwrap();
    assert!(opening_pos < heading_pos);
    assert!(lines[opening_pos].starts_with("[⏱ 00:05]([[ts:5000]])"));
}

// ── 章节质量聚合（chapter_quality_scores）────────────────────────

#[test]
fn quality_scores_aggregate_by_chapter_window() {
    // Arrange：2 章窗口；subtitle 块不计；第一章两块长文本高分 → 高分；
    //          第二章单块 1 字碎片低分 → 低分
    let chapters = vec![boundary(9_000), boundary(30_000)];
    let blocks = vec![
        block(1, 5_000, "开场字幕", 0.5, "subtitle"),
        block(2, 10_000, "高质量长文本一足够长", 0.95, "full"),
        block(3, 20_000, "高质量长文本二足够长", 0.95, "full"),
        block(4, 35_000, "碎", 0.4, "full"),
    ];

    // Act
    let scores = chapter_quality_scores(&chapters, &blocks);

    // Assert：第一章 ≈ 0.4×0.95 + 0.2 + 0.2 + 0.2 = 0.98；第二章 < 0.6
    assert_eq!(scores.len(), 2);
    assert!((scores[0] - 0.98).abs() < 1e-4, "高分章应 ≥ QUALITY_TH，实际 {}", scores[0]);
    assert!(scores[1] < 0.6, "碎片章应 < QUALITY_TH，实际 {}", scores[1]);
}

#[test]
fn quality_scores_empty_window_is_zero() {
    // Arrange：无 full 块（只有 subtitle 块/空）→ 空窗口按最低分（宁缺毋滥）
    let chapters = vec![boundary(9_000)];
    let blocks = vec![block(1, 12_000, "字幕", 0.9, "subtitle")];

    // Act & Assert
    let scores = chapter_quality_scores(&chapters, &blocks);
    assert_eq!(scores, vec![0.0]);
}

#[test]
fn quality_scores_no_chapters_is_empty() {
    // Act & Assert：无章节边界 → 空数组（与组装层退化一致）
    assert!(chapter_quality_scores(&[], &[]).is_empty());
}
