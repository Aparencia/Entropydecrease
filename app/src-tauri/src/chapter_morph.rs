//! 章节形态决策（v0.14 D1 chapter_morph；纯函数，零依赖）。
//!
//! @ai-context: spec §4.1——用户纠正"不能做视频级二分法"：每章独立决策。
//!              双维信号：OCR 密度（章节窗口内 OCR 文本占比）× OCR 质量分。
//!              密度高 + 质量高 → 图文（OCR 屏卡要点为主体）；其余 → 口语
//!              （现状形态；低质量 OCR 弃用仅原料视图可查）。
//! @ai-context: 边界（spec §4.1/§5）——无章节边界时全篇退化现状由编排层保证
//!              （本模块只做单章决策）；空章节输入按口语处理（无内容不发明）。

/// 密度阈值（spec §4.1 DENSITY_TH：OCR 文本占章节文本三成以上视为"内容可视"）。
/// 初值经 golden 用例校准；可配置——上游统一读取本常量。
pub const DENSITY_TH: f32 = 0.3;

/// 质量分阈值（spec §4.2 同源——直接别名 ocr_quality::QUALITY_TH，门控双出口共用，
/// 避免两处常量漂移）。
pub const QUALITY_TH: f32 = crate::ocr_quality::QUALITY_TH;

/// 章节形态：图文（OCR 屏卡要点为主体）/ 口语（现状形态）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChapterMorph {
    Graphic,
    Spoken,
}

/// 章节形态决策输入（由编排层按章节窗口聚合）。
pub struct MorphInput {
    /// 章节窗口内 OCR 文本字符数（屏卡要点量）
    pub ocr_chars: usize,
    /// 章节窗口内口语（转写）字符数
    pub transcript_chars: usize,
    /// 章节窗口 OCR 质量分（ocr_quality_score；空章节传 0.0）
    pub quality: f32,
}

/// 章节形态决策（spec §4.1 三象限）：
/// 密度 ≥ DENSITY_TH && 质量 ≥ QUALITY_TH → 图文；
/// 密度 < DENSITY_TH 或质量 < QUALITY_TH → 口语（OCR 弃用或现状）。
pub fn decide_chapter_morph(input: &MorphInput) -> ChapterMorph {
    let total = input.ocr_chars + input.transcript_chars;
    if total == 0 {
        return ChapterMorph::Spoken; // 空章节：口语（无内容不发明）
    }
    let density = ocr_density(input.ocr_chars, input.transcript_chars);
    if density >= DENSITY_TH && input.quality >= QUALITY_TH {
        ChapterMorph::Graphic
    } else {
        ChapterMorph::Spoken
    }
}

/// OCR 密度（章节窗口内 OCR 文本占比；0.0-1.0）。编排层信号下沉复用
/// （spec 3.2：group_route.rs ocr_text_density 信号章节级复用）。
pub fn ocr_density(ocr_chars: usize, transcript_chars: usize) -> f32 {
    let total = ocr_chars + transcript_chars;
    if total == 0 {
        return 0.0;
    }
    ocr_chars as f32 / total as f32
}

#[cfg(test)]
#[path = "chapter_morph_tests.rs"]
mod tests;
