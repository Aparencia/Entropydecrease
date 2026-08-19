//! 课程大纲检测（REQ-077 / v0.6.0 M6，F2/C4）。
//!
//! @ai-context: OCR 大字块/固定位置标题 → 课程大纲。实时链路未落库字号与
//!              bbox（DB 层无列），课后检测用**文本启发式**：全帧 OCR 块中
//!              短文本（≤24 字）且无句末标点（。！？）——幻灯片标题/大字
//!              块特征（正文句子有标点，标题没有）；60s 内同文本去重
//!              （标题停留多帧只出一条）。
//! @ai-context: 产物视图侧边大纲导航（点击跳转 refs.frame_ms）由前端消费；
//!              误判阈值可校准（max_len/最短间隔）。
//! @ai-context: 纯函数可单测（合成幻灯片帧：标题块/正文块/重复标题）。

use crate::types::SessionOcrBlock;

/// 大纲条目（带时间戳——导航跳转基准）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct OutlineEntry {
    pub time_ms: u64,
    pub text: String,
}

/// 大纲检测配置。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OutlineConfig {
    /// 标题候选最大字数（正文句子更长）
    pub max_chars: usize,
    /// 同文本去重间隔（ms；标题停留多帧只出一条）
    pub dedupe_gap_ms: u64,
    /// OCR 最低分（低分块不参与——噪声）
    pub min_score: f32,
}

impl Default for OutlineConfig {
    fn default() -> Self {
        Self { max_chars: 24, dedupe_gap_ms: 60_000, min_score: 0.7 }
    }
}

/// 大纲检测（纯函数）：全帧 OCR 块 → 大纲条目（时间排序 + 去重）。
///
/// @ai-context: 标题特征：短文本 + 无句末标点 + 非纯数字/符号；
///              同文本 60s 内只出一条（标题停留/翻页复现去重）。
pub fn detect_outline(ocr_blocks: &[SessionOcrBlock], config: &OutlineConfig) -> Vec<OutlineEntry> {
    let mut candidates: Vec<(u64, String)> = ocr_blocks
        .iter()
        .filter(|b| {
            b.region == "full"
                && b.score >= config.min_score
                && looks_like_title(&b.text, config.max_chars)
        })
        .map(|b| (b.timestamp_ms, b.text.trim().to_string()))
        .collect();
    candidates.sort_by_key(|(ts, _)| *ts);
    // 去重：同文本 60s 内只保留首条（标题停留多帧/翻页复现）
    let mut out: Vec<OutlineEntry> = Vec::new();
    for (ts, text) in candidates {
        let is_dup = out
            .iter()
            .rev()
            .take(10)
            .any(|e: &OutlineEntry| e.text == text && ts.saturating_sub(e.time_ms) < config.dedupe_gap_ms);
        if !is_dup {
            out.push(OutlineEntry { time_ms: ts, text });
        }
    }
    out
}

/// 标题特征判定（纯函数）：短文本 + 无句末标点 + 含字母数字汉字。
///
/// @ai-context: 正文句子以 。！？ 结尾（ASR/OCR 恢复的标点）；标题无标点；
///              纯数字/符号（页码/时间码）排除。
fn looks_like_title(text: &str, max_chars: usize) -> bool {
    let t = text.trim();
    if t.is_empty() || t.chars().count() > max_chars {
        return false;
    }
    if t.chars().all(|c| !c.is_alphanumeric() && !is_cjk(c)) {
        return false; // 纯符号（分隔线等）
    }
    !t.ends_with(['。', '！', '？'])
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "outline_tests.rs"]
mod tests;
