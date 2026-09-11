//! @ai-context: 笔记过滤域的**渲染层**（批 0-C3 Task 8 S1 从 note_filter.rs 平铺拆出，
//!              AGENTS.md §3 单文件 ≤300 行）——屏卡 → markdown 画面要点行、标题+讲述
//!              内容 markdown 组装、会话异常警示行前缀；由过滤链（filter_note_transcript）
//!              与命令层（commands_ai / commands_session_note）共用。
//! @ai-context: 副作用：无 IO / 无 DB / 无锁 —— 全部是纯字符串构造，唯一写入是
//!              `apply_session_warning`/`refresh_screen_points` 对 &mut
//!              NoteFilterResult 的字段赋值。
//! @ai-context: 边界（**既有行为，逐字搬运不改，仅登记**）：`refresh_screen_points`
//!              按 `body_source` 分派重建 markdown，`BodySource::Web` 落入 `_` 分支、
//!              以**空 kept** 调 rebuild_markdown ⇒ 退化为标题仅（filter_note 注释声明
//!              web 正文不走过滤链，此处是"防御未来误入"）。
//! @ai-context: 可见性契约：`render_screen_points`/`refresh_screen_points` 保持 `pub`、
//!              `apply_session_warning`/`rebuild_markdown` 保持 `pub(crate)`、
//!              `assemble_purified_markdown` 保持私有（唯一消费者 rebuild_markdown 同在本
//!              模块）——由 note_filter.rs 按 1:1 可见性再导出，外部 17 文件 37 处
//!              `crate::note_filter::…` 调用点零改动。
//! @ai-context: 未覆盖路径：25 例域内测试**无一例带 image_ref** ⇒ 配图行格式串
//!              （`  - ![画面 N](session-images/{sid}/{rel})`）无测试拦网，靠逐字搬运 +
//!              人工 diff 证明未改；OCR 文本未经转义直拼 markdown 的注入面同样**只记录不改**。

use crate::note_body_source::BodySource;
use crate::purify_config::PurifyConfig;
use crate::types::{SessionScreen, SessionSegment, TranscriptSegment};

use super::NoteFilterResult;

/// 画面要点屏段落渲染（纯函数）：屏卡 → 笔记画面要点行（Markdown 列表项）。
///
/// @ai-context: 每屏一段：`- **[MM:SS–MM:SS] 标题**` + 正文行（二级列表）+
///              标签行 + 配图行（image_ref 有值时；src 为相对 data_dir 路径
///              `session-images/{sid}/full/{ts}.webp`——前端渲染拼 baseUrl）。
/// @ai-context: 无标题屏（旧数据无 bbox 降级）用"画面 N"占位——不丢内容。
pub fn render_screen_points(screens: &[SessionScreen]) -> Vec<String> {
    let mut lines = Vec::new();
    for (i, s) in screens.iter().enumerate() {
        let range = format!(
            "[{}–{}]",
            crate::concat::format_timestamp(s.first_seen_ms),
            crate::concat::format_timestamp(s.last_seen_ms)
        );
        let title = s.title.clone().unwrap_or_else(|| format!("画面 {}", i + 1));
        lines.push(format!("- **{} {}**", range, title));
        for b in &s.body {
            lines.push(format!("  - {}", b));
        }
        if !s.labels.is_empty() {
            lines.push(format!("  - 标签：{}", s.labels.join(" · ")));
        }
        if let Some(rel) = &s.image_ref {
            // 修复（2026-08-21 审查）：缺闭合 `)`——前端渲染正则
            // `^\s*-\s*!\[([^\]]*)\]\(([^)]*)\)$` 要求 `)$` 结尾，缺括号时
            // 配图行永远匹配不上 → 渲染为纯文本而非图片（丢图真因之一）
            lines.push(format!("  - ![画面 {}](session-images/{}/{})", i + 1, s.session_id, rel));
        }
    }
    lines
}

/// 会话异常警示行（REQ-170，纯函数）：status != finished → 追加警示。
///
/// @ai-context: 会话31 实证：status=failed 但内容完整（停止链路异常翻案）——
///              照常转笔记但诚实标注"内容可能不完整"，用户自行判断；
///              警示行是普通 Markdown 引用行（用户可手动删除）。
/// @ai-context: 预览/落库/AI 复核三出口共用（REQ-081 单一管线）——命令层在
///              refresh_screen_points 前调用，markdown 重建口径一致。
pub(crate) fn apply_session_warning(result: &mut NoteFilterResult, status: &str) {
    if status == crate::db_sessions::SESSION_STATUS_FINISHED {
        result.warning = None;
    } else {
        result.warning = Some(format!("> ⚠️ 会话异常（{}），内容可能不完整", status));
    }
}

/// 刷新画面要点数据（纯函数）：ocr_screens 重新渲染 + 重建 markdown。
///
/// @ai-context: 命令层 attach_images 填充 image_ref 后调用——原料视图
///              屏卡配图随 image_ref 出现/消失；markdown 重建不含画面要点
///              （v0.11.5 移出笔记，配图行仅存于 AI 精修 image 块）；
///              净化配置随 result 透传（段落阈值/锚点与预览口径一致）。
pub fn refresh_screen_points(result: &mut NoteFilterResult) {
    result.ocr_points = render_screen_points(&result.ocr_screens);
    // v0.12.0（ADR-021）：按正文源分派重建——OcrDirect 走 OCR 正文重建
    // （kept 为空，走 rebuild_markdown 会把 OCR 正文覆盖成标题仅）
    result.markdown = match result.body_source {
        BodySource::OcrDirect => crate::note_filter_ocr::rebuild_ocr_markdown(
            &result.title,
            &result.ocr_body,
            &result.purify,
            result.warning.as_deref(),
        ),
        _ => rebuild_markdown(
            &result.title,
            &result.kept,
            &[],
            &result.purify,
            result.warning.as_deref(),
        ),
    };
}

/// 组装 Markdown（标题 + 讲述内容；段落切分复用 concat 口径；
/// v0.7.5 REQ-165/170/173：段首 [MM:SS] 时间戳锚点（可回跳原视频位置，可开关）
/// + 段落阈值走净化配置 + 会话异常警示行（None=无警示）。
///   v0.11.5：画面要点段移出笔记（_ocr_points 签名保留兼容调用方，忽略）。
pub(crate) fn rebuild_markdown(
    title: &str,
    kept: &[SessionSegment],
    _ocr_points: &[String],
    config: &PurifyConfig,
    warning: Option<&str>,
) -> String {
    let mut md = assemble_purified_markdown(title, kept, _ocr_points, config);
    if let Some(w) = warning {
        md = format!("{}\n\n{}", w, md);
    }
    md
}

/// 净化组装（无警示行版——供 rebuild_markdown 内部与警示拼接）。
fn assemble_purified_markdown(
    title: &str,
    kept: &[SessionSegment],
    _ocr_points: &[String],
    config: &PurifyConfig,
) -> String {
    let transcript: Vec<TranscriptSegment> = kept
        .iter()
        .map(|s| TranscriptSegment {
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            word_timestamps: None,
            // 段落切分不消费置信度/音量（None 占位）
            confidence: None,
            volume: None,
        })
        .collect();
    let paragraphs = crate::concat::split_transcript_paragraphs_with(
        &transcript,
        config.paragraph_max_chars,
        config.paragraph_max_span_ms,
    );
    let anchored: Vec<String> = paragraphs
        .into_iter()
        .map(|(start_ms, text)| {
            if config.anchor_timestamps {
                format!("{} {}", crate::concat::format_timestamp(start_ms), text)
            } else {
                text
            }
        })
        .collect();
    crate::concat::assemble_markdown(title, &anchored, &[])
}
