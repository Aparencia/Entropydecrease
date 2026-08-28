//! chapter_morph 单测（v0.14 D1 spec §6：四象限决策 + 边界；AAA 模式）。

use super::*;

/// 构造决策输入（密度由 ocr/transcript 字符数推得）。
fn input(ocr: usize, transcript: usize, quality: f32) -> MorphInput {
    MorphInput { ocr_chars: ocr, transcript_chars: transcript, quality }
}

#[test]
fn four_quadrant_decisions() {
    // Arrange/Act/Assert：spec §4.1 三象限 + 边界
    // 象限 1：密度高 + 质量高 → 图文
    assert_eq!(decide_chapter_morph(&input(500, 200, 0.8)), ChapterMorph::Graphic);
    // 象限 2：密度高 + 质量低 → 口语（OCR 弃用）
    assert_eq!(decide_chapter_morph(&input(500, 200, 0.4)), ChapterMorph::Spoken);
    // 象限 3：密度低 + 质量高 → 口语（现状形态——无 PPT 不发明图文）
    assert_eq!(decide_chapter_morph(&input(100, 600, 0.9)), ChapterMorph::Spoken);
    // 象限 4：密度低 + 质量低 → 口语
    assert_eq!(decide_chapter_morph(&input(100, 600, 0.2)), ChapterMorph::Spoken);
}

#[test]
fn threshold_boundary_values() {
    // 恰好达标（密度 0.3、质量 0.6）→ 图文；差一点 → 口语
    assert_eq!(decide_chapter_morph(&input(300, 700, 0.6)), ChapterMorph::Graphic);
    assert_eq!(decide_chapter_morph(&input(299, 701, 0.6)), ChapterMorph::Spoken);
    assert_eq!(decide_chapter_morph(&input(300, 700, 0.599)), ChapterMorph::Spoken);
}

#[test]
fn empty_chapter_is_spoken() {
    // 空章节：不发明内容（spec §5 异常处理）
    assert_eq!(decide_chapter_morph(&input(0, 0, 0.0)), ChapterMorph::Spoken);
}

#[test]
fn pure_ocr_high_quality_is_graphic() {
    // 全高密度（无口语——PPT 讲解静止帧场景）→ 图文
    assert_eq!(decide_chapter_morph(&input(800, 0, 0.7)), ChapterMorph::Graphic);
}

#[test]
fn ocr_density_helper() {
    // 占比与零总量防御
    assert!((ocr_density(300, 700) - 0.3).abs() < 1e-4);
    assert_eq!(ocr_density(0, 0), 0.0);
    assert_eq!(ocr_density(0, 500), 0.0);
}
