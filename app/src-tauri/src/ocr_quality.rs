//! OCR 质量分（v0.14 D2 ocr_quality_score；纯函数，零依赖）。
//!
//! @ai-context: spec §4.2——章节窗口内四信号加权：置信度（0.4）+ 碎片率（0.2）+
//!              连贯性（0.2）+ 噪音比（0.2）。质量分是双维决策的"质量维"：
//!              低质量 OCR 不进正文、不喂 AI（省 token）；质量报告诚实呈现。
//! @ai-context: 空输入 → 0.0（spec §5：异常/空章节按最低分处理——OCR 弃用，
//!              宁缺毋滥）。全部信号归一化到 0.0-1.0，加权和即质量分。

/// 置信度权重（spec §4.2 表）
const W_CONFIDENCE: f32 = 0.4;
/// 碎片率权重（≤4 字块占比，越低越好）
const W_FRAGMENT: f32 = 0.2;
/// 连贯性权重（行合并后"可成句"行占比，越高越好）
const W_COHERENCE: f32 = 0.2;
/// 噪音比权重（UiJunkList 命中占比，越低越好）
const W_NOISE: f32 = 0.2;

/// 碎片判定：≤4 字块（spec §4.2：碎片率 = 短块占比）。pub（v0.14 D）：
/// line_rec_engine 疑碎判定同源引用——一处定义，两处同口径。
pub const FRAGMENT_CHAR_LIMIT: usize = 4;
/// 可成句判定：≥8 字（中文口语/短句长度下限近似）
const SENTENCE_CHAR_LIMIT: usize = 8;

/// 质量分输入（由编排层从章节窗口聚合；全字段必填——空章节传空数组）。
pub struct QualityInput<'a> {
    /// 块置信度列表（OcrBlock.score）
    pub scores: &'a [f32],
    /// 块文本列表（与 scores 同序同长）
    pub texts: &'a [String],
    /// UiJunkList 命中块数（噪音比信号）
    pub junk_hits: usize,
    /// 行合并后的行文本（连贯性信号：可成句行占比）
    pub merged_lines: &'a [String],
}

/// OCR 质量分（0.0-1.0；QUALITY_TH=0.6 判定达标，见 chapter_morph）。
///
/// @ai-context: 置信度按字符数加权均值（长文本块权重更高——短碎片高分
///              不拉高质量分）；碎片率/噪音比为"坏占比"取补（越高越好）。
pub fn ocr_quality_score(input: &QualityInput<'_>) -> f32 {
    let n = input.scores.len();
    if n == 0 || input.texts.len() != n {
        return 0.0; // 空/不一致输入：最低分（宁缺毋滥）
    }
    // 信号 1：置信度（字符加权均值）
    let (mut weighted, mut chars) = (0.0f32, 0usize);
    for (i, s) in input.scores.iter().enumerate() {
        let c = input.texts[i].chars().count().max(1);
        weighted += s.clamp(0.0, 1.0) * c as f32;
        chars += c;
    }
    let confidence = if chars > 0 { weighted / chars as f32 } else { 0.0 };

    // 信号 2：碎片率（≤4 字块占比的补）
    let frag_blocks = input.texts.iter().filter(|t| t.trim().chars().count() <= FRAGMENT_CHAR_LIMIT).count();
    let fragment = 1.0 - frag_blocks as f32 / n as f32;

    // 信号 3：连贯性（合并后"可成句"行占比）
    let m = input.merged_lines.len();
    let coherent = if m == 0 {
        0.0
    } else {
        input.merged_lines.iter().filter(|t| t.trim().chars().count() >= SENTENCE_CHAR_LIMIT).count() as f32 / m as f32
    };

    // 信号 4：噪音比（junk 命中占比的补）
    let noise = 1.0 - (input.junk_hits.min(n) as f32 / n as f32);

    W_CONFIDENCE * confidence + W_FRAGMENT * fragment + W_COHERENCE * coherent + W_NOISE * noise
}

/// 质量分达标阈值（spec §4.2；初值经 golden 用例校准，可配置——上游读取）
pub const QUALITY_TH: f32 = 0.6;

/// 碎片率辅助判定（疑碎行信号，line_rec_engine 同口径：≤4 字块占比）。
///
/// @ai-context: lib 内暂无生产调用方（质量报告 V1.0 接线）；测试目标已覆盖，
///              登记 dead_code 豁免（机制先行模式，watermark_cluster 先例）。
#[allow(dead_code)]
pub fn fragment_ratio(texts: &[String]) -> f32 {
    if texts.is_empty() {
        return 1.0;
    }
    let frag = texts.iter().filter(|t| t.trim().chars().count() <= FRAGMENT_CHAR_LIMIT).count();
    frag as f32 / texts.len() as f32
}

#[cfg(test)]
#[path = "ocr_quality_tests.rs"]
mod tests;
