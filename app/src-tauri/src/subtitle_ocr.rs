//! 字幕区识别纯逻辑（REQ-011，ADR-005）。
//!
//! @ai-context: 本模块只做字幕文本流的时间窗去重与滚动字幕检测（纯函数/有状态
//!              轻组件）；区域裁剪复用 frame_diff::bottom_quarter_rect，OCR 识别
//!              复用 v0.1.0 引擎（oar-ocr）。
//! @ai-context: 字幕是画面底部固定区域图像，OCR 每帧识别结果是一个文本流——
//!              去重目标：同文本不重复落库、OCR 微抖动不产生碎片、滚动字幕不污染。

use crate::streaming_asr::levenshtein;

/// 字幕追踪器（有状态：记录最近一次输出的字幕与时间）。
///
/// @ai-context: 时间窗去重语义（ADR-005 §1）：
/// - 与最近输出文本一致 → 视为字幕未变，跳过（无论间隔多久，OCR 帧级重复）
/// - 编辑距离 ≤1 且在去重窗内 → 识别微抖动，合并跳过
/// - 其余 → 新字幕，输出并更新状态
#[derive(Debug, Default)]
pub struct SubtitleTracker {
    last_emitted_text: String,
    last_emitted_ms: u64,
}

impl SubtitleTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// 处理一帧字幕识别结果，返回应落库的字幕文本（None = 跳过）。
    ///
    /// @param text - 本帧 OCR 字幕文本（未 trim）
    /// @param now_ms - 帧时间戳（会话时间轴，毫秒）
    /// @param dedupe_ms - 去重窗（默认 3000ms，微变化合并窗口）
    pub fn process(&mut self, text: &str, now_ms: u64, dedupe_ms: u64) -> Option<String> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        if trimmed == self.last_emitted_text {
            // 同一字幕持续显示：去重（OCR 帧级重复）
            return None;
        }
        let within_window = now_ms.saturating_sub(self.last_emitted_ms) <= dedupe_ms;
        if within_window && levenshtein(trimmed, &self.last_emitted_text) <= 1 {
            // OCR 微抖动/字幕微动：合并，不重复输出
            return None;
        }
        self.last_emitted_text = trimmed.to_string();
        self.last_emitted_ms = now_ms;
        Some(trimmed.to_string())
    }

    /// 重置（新会话/窗口切换时调用；当前实时链路未调用，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.last_emitted_text.clear();
        self.last_emitted_ms = 0;
    }
}

/// 滚动字幕检测：连续两帧文本不同但共享高比例公共子序列 → 判定滚动（丢弃）。
///
/// @ai-context: 股票/歌词等滚动字幕每帧都变化且内容高度重合，普通去重窗失效；
///              用 LCS 比例判定（ADR-005 风险缓解）。min_ratio=0.6 表示
///              公共子序列长度 ≥ 较短文本 60% 视为滚动。
pub fn is_scrolling(current: &str, previous: &str, min_ratio: f32) -> bool {
    let a = current.trim();
    let b = previous.trim();
    if a.is_empty() || b.is_empty() || a == b {
        return false;
    }
    let shorter = a.chars().count().min(b.chars().count());
    if shorter == 0 {
        return false;
    }
    let lcs = lcs_len(a, b);
    lcs as f32 / shorter as f32 >= min_ratio
}

/// 最长公共子序列长度（DP，纯函数）。
fn lcs_len(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev = vec![0usize; b.len() + 1];
    let mut curr = vec![0usize; b.len() + 1];
    for ca in &a {
        for (j, cb) in b.iter().enumerate() {
            curr[j + 1] = if ca == cb {
                prev[j] + 1
            } else {
                prev[j + 1].max(curr[j])
            };
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

#[cfg(test)]
#[path = "subtitle_ocr_tests.rs"]
mod tests;
