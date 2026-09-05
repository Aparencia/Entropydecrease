//! 笔记正文源检测（v0.12.0 M1，ADR-021）。
//!
//! @ai-context: `(segments, ocr_blocks)` 二元组缺乏"哪个是正文"的表达层——
//!              filter_note 硬编码 segments 为唯一正文源，图文会话（kind=photo，
//!              ADR-020）用户手动框选的 OCR 文本始终辅助位不入 markdown，
//!              导致转笔记正文为空（设计债）。本模块引入 BodySource 枚举表达
//!              正文来源，detect_body_source 纯函数按输入特征智能判断。
//! @ai-context: 正文源多态是长期重构——未来导入 PDF/网页截图转笔记只需新增
//!              BodySource 变体 + 对应过滤链，不改既有 Transcript 路径。

use crate::types::{SessionOcrBlock, SessionSegment};

/// 笔记正文来源。
///
/// @ai-context: Transcript=转写段为正文（视频会话，既有口语过滤链零改动）；
///              OcrDirect=OCR 块直接为正文（图文会话——用户框选即意图）；
///              Empty=无可用正文（标题仅，不 panic）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BodySource {
    /// 转写段为正文（视频会话——既有过滤链）
    Transcript,
    /// OCR 块直接为正文（图文会话——photo_capture 写入的 region=full 块特征）
    OcrDirect,
    /// v0.20.4（REQ-303）：web 会话正文直取（web_session_pages.markdown——
    /// 不走口语过滤链，轻净化直落；标题层级保留供锚点回链）
    Web,
    /// 无可用正文（标题仅）
    #[default]
    Empty,
}

/// 检测正文来源（纯函数）。
///
/// @ai-context: 判定规则——① 存在非空转写段 → Transcript（视频会话特征，
///              与 kind 字段解耦：未来导入语音会话同路径）；② segments 空但
///              存在 region=full 且文本非空的 OCR 块 → OcrDirect（photo_capture
///              ADR-020 落库块特征；region=subtitle 是字幕辅助块，不作正文）；
///              ③ 两者皆空 → Empty（标题仅）。
pub fn detect_body_source(
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
) -> BodySource {
    if segments.iter().any(|s| !s.text.trim().is_empty()) {
        return BodySource::Transcript;
    }
    if ocr_blocks
        .iter()
        .any(|b| b.region == "full" && !b.text.trim().is_empty())
    {
        return BodySource::OcrDirect;
    }
    BodySource::Empty
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_body_source_tests.rs"]
mod tests;
