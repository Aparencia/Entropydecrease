//! 图文会话 OCR 正文过滤链（v0.12.0 M1，ADR-021）。
//!
//! @ai-context: BodySource::OcrDirect 分支的精简净化链——排序 → 置信过滤
//!              （0.5，photo_capture 同口径）→ 符号归一（跳过口语净化/口头禅/
//!              碎片规则——OCR 文本是视觉识别产物，无 ASR 的结巴/填充词/重复）
//!              → 相邻去重 → markdown 组装（"图文提取"标注段）。
//! @ai-context: 引用 photo_capture 已有规则：用户框选即意图，不过 UI 垃圾
//!              黑名单（与视频链路"OCR 辅助画面要点"语义分离——OCR 文本在
//!              图文会话中是正文本身，不是辅助增强）。

use crate::note_filter::{FilterStats, NoteFilterResult, PurifyEnv};
use crate::purify_config::PurifyConfig;
use crate::symbol_normalize;
use crate::types::SessionOcrBlock;

/// OCR 直接正文最低置信度（与 photo_capture::MIN_SCORE 同口径——图文链路
/// 落库前已按 0.5 过滤，此处兜底双保险：旧数据/其他写入方）。
const OCR_DIRECT_MIN_SCORE: f32 = 0.5;

/// 图文提取标注段标题（验收契约：markdown 含"图文提取"字样，标注正文来源）。
const OCR_BODY_HEADING: &str = "## 图文提取";

/// OCR 正文过滤链（纯函数）：region=full 块 → 净化文本序列 + markdown。
///
/// @ai-context: 返回 NoteFilterResult 但 kept/ocr_screens/ocr_points 均为空
///              ——OCR 文本已进入 markdown 正文，不再作为画面要点双出口呈现
///              （同一文本两处渲染会重复）；body_source=OcrDirect 写入结果
///              供 refresh_screen_points/apply_ai_decisions/structure 分派。
pub fn filter_note_from_ocr(
    title: &str,
    ocr_blocks: &[SessionOcrBlock],
    env: &PurifyEnv,
) -> NoteFilterResult {
    // ① 来源过滤（region=full——图文链路块特征）+ 置信过滤 + 空文本排除
    let mut blocks: Vec<&SessionOcrBlock> = ocr_blocks
        .iter()
        .filter(|b| b.region == "full" && b.score >= OCR_DIRECT_MIN_SCORE && !b.text.trim().is_empty())
        .collect();
    // ② 时间排序（输出顺序与相邻去重的次序契约；同帧块按 id 稳定）
    blocks.sort_by_key(|b| (b.timestamp_ms, b.id));
    // ③ 符号归一（跳过口语净化——OCR 无结巴/口头禅）+ ④ 相邻去重
    let body = normalize_and_dedup(&blocks, env);
    let markdown = rebuild_ocr_markdown(title, &body, &env.config, None);
    NoteFilterResult {
        title: title.to_string(),
        markdown,
        kept: Vec::new(),
        ocr_points: Vec::new(),
        ocr_screens: Vec::new(),
        stats: FilterStats::default(),
        filtered: Vec::new(),
        merged: Vec::new(),
        purify: env.config.clone(),
        warning: None,
        body_source: crate::note_body_source::BodySource::OcrDirect,
        ocr_body: body,
    }
}

/// 符号归一 + 相邻去重（纯函数；净化顺序契约：归一后文本才精确去重——
/// 与 Transcript 链 v0.7.5 同契约）。
fn normalize_and_dedup(blocks: &[&SessionOcrBlock], env: &PurifyEnv) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for b in blocks {
        let mut text = b.text.trim().to_string();
        if env.config.symbol_normalize {
            text = symbol_normalize::normalize(&text, &env.symbol);
        }
        if text.is_empty() {
            continue;
        }
        if out.last().is_some_and(|last| last == &text) {
            continue;
        }
        out.push(text);
    }
    out
}

/// OCR 正文 markdown 重建（纯函数）：标题 + "图文提取"标注段 + 净化文本序列。
///
/// @ai-context: refresh_screen_points/apply_ai_decisions 按 body_source=OcrDirect
///              分派时调用——重建口径与 filter_note_from_ocr 输出逐字节一致
///              （单一管线双出口契约 REQ-081 延续）；OCR 块时间戳无视频回跳
///              语义，不加锚点（与 Transcript 链口径差异是有意的）。
pub fn rebuild_ocr_markdown(
    title: &str,
    body: &[String],
    _config: &PurifyConfig,
    warning: Option<&str>,
) -> String {
    let mut md = format!("# {}\n", title);
    if !body.is_empty() {
        md.push_str(&format!("\n{}\n\n", OCR_BODY_HEADING));
        for p in body {
            md.push_str(p);
            md.push_str("\n\n");
        }
    }
    let mut md = md.trim_end().to_string();
    if let Some(w) = warning {
        md = format!("{}\n\n{}", w, md);
    }
    md
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "note_filter_ocr_tests.rs"]
mod tests;
