//! 图文会话 OCR 正文过滤链（v0.12.0 M1，ADR-021；v0.14 D 净化链 ①②③ 插入）。
//!
//! @ai-context: BodySource::OcrDirect 分支的精简净化链——排序 → 净化链
//!              （① 行合并评分器 → ② 行级重识别判定 → ③ 跨帧增量合并，
//!              spec §3.1）→ 符号归一（跳过口语净化/口头禅/碎片规则——OCR
//!              文本是视觉识别产物，无 ASR 的结巴/填充词/重复）→ 相邻去重
//!              → markdown 组装（"图文提取"标注段）。
//! @ai-context: 引用 photo_capture 已有规则：用户框选即意图，不过 UI 垃圾
//!              黑名单（与视频链路"OCR 辅助画面要点"语义分离——OCR 文本在
//!              图文会话中是正文本身，不是辅助增强）。
//! @ai-context: 净化链降级契约（spec §5）：无 bbox 的块（旧数据）不参与行
//!              合并与增量合并（位置无法锚定——保守走旧路径，零回归）；②
//!              行级重识别在源头执行（photo_capture 落库前），旧数据无图
//!              不可执行——疑碎行诚实保留（不删不并）。

use crate::note_filter::{FilterStats, NoteFilterResult, PurifyEnv};
use crate::purify_config::PurifyConfig;
use crate::symbol_normalize;
use crate::types::{SessionOcrBlock, TextBox};
use crate::line_merge::should_merge_lines;

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
    // ③ 净化链（v0.14 D spec §3.1）：① 行合并评分器 → ② 行级重识别判定 →
    //    ③ 跨帧增量合并 → 符号归一 → 相邻去重
    let body = purify_chain(&blocks, env);
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

/// 净化后的行（行合并/跨帧增量产物）。
#[derive(Clone)]
struct PurifiedLine {
    text: String,
    bbox: Option<TextBox>,
}

/// 净化链（v0.14 D spec §3.1 插入 ①②③；无 bbox 块全降级走旧路径——零回归）：
/// ① 行合并评分器（同帧 bbox 行聚类 + should_merge_lines，取合并文本/得分均值）
/// ② 行级重识别判定（疑碎行——执行在源头 photo_capture 落库前；旧数据无图
///    不可执行，诚实保留：不删不并，spec §5）
/// ③ 跨帧增量合并（帧文本 ⊇ 前帧 && bbox 稳定 → 同屏增量取后帧行集；无 bbox
///    帧不合并）→ 符号归一 → 相邻去重（原 normalize_and_dedup 契约不变）。
fn purify_chain(blocks: &[&SessionOcrBlock], env: &PurifyEnv) -> Vec<String> {
    // ① 帧分组 + 帧内行合并
    let frames: Vec<Vec<PurifiedLine>> = group_frames(blocks)
        .into_iter()
        .map(|frame| merge_frame_lines(&frame))
        .collect();
    // ③ 跨帧增量合并（行集级——语义同 incremental_merge）
    let lines = merge_frames_incremental(&frames);
    // 净化：符号归一 + 相邻去重（原契约不变：归一后文本才精确去重）
    let mut out: Vec<String> = Vec::new();
    for l in lines {
        let mut text = l.text.trim().to_string();
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

/// 帧分组（块按时间有序——同 ts 连续分组成立）。
fn group_frames<'a>(blocks: &'a [&'a SessionOcrBlock]) -> Vec<Vec<&'a SessionOcrBlock>> {
    let mut frames: Vec<Vec<&SessionOcrBlock>> = Vec::new();
    for b in blocks {
        match frames.last_mut() {
            Some(f) if f[0].timestamp_ms == b.timestamp_ms => f.push(b),
            _ => frames.push(vec![b]),
        }
    }
    frames
}

/// 行聚类 y 容差（px；与 layout_reorder::Y_TOLERANCE 同值——同一几何口径）。
const LINE_Y_TOLERANCE: f32 = 8.0;

/// 帧内行合并（①）：有 bbox 块按 y 中心 ±8px 行聚类 → 行内 x 升序 → 相邻块
/// should_merge_lines（几何+文本信号）→ 合并（文本直拼/得分均值/bbox 并集）；
/// 无 bbox 块独立成行（旧数据降级——零回归）。
fn merge_frame_lines(blocks: &[&SessionOcrBlock]) -> Vec<PurifiedLine> {
    let mut out: Vec<PurifiedLine> = Vec::new();
    // ① 有 bbox 块：行聚类 + 评分合并
    let mut sorted: Vec<&SessionOcrBlock> =
        blocks.iter().copied().filter(|b| b.bbox.is_some()).collect();
    sorted.sort_by(|a, b| center_y(a).total_cmp(&center_y(b)));
    let mut rows: Vec<Vec<&SessionOcrBlock>> = Vec::new();
    for b in sorted {
        match rows.last_mut() {
            Some(row) if (center_y(row[0]) - center_y(b)).abs() <= LINE_Y_TOLERANCE => row.push(b),
            _ => rows.push(vec![b]),
        }
    }
    for row in rows {
        let mut row = row;
        row.sort_by(|a, b| a.bbox.unwrap().x.total_cmp(&b.bbox.unwrap().x));
        // 贪心评分合并：相邻块续接 → 并入当前行；否则新行（反误合并原则）
        let mut merged: Vec<SessionOcrBlock> = Vec::new();
        for b in row {
            match merged.last_mut() {
                Some(cur) if should_merge_lines(&to_line_input(cur), &to_line_input(b)) => {
                    *cur = merge_two(cur, b);
                }
                _ => merged.push(b.clone()),
            }
        }
        for m in merged {
            out.push(to_purified(&m));
        }
    }
    // ② 无 bbox 块独立成行（同帧内置于合并行之后——保持相对时间序）
    for b in blocks.iter().filter(|b| b.bbox.is_none()) {
        out.push(to_purified(b));
    }
    out
}

/// 块 y 中心（bbox 必填——调用方保证）。
fn center_y(b: &SessionOcrBlock) -> f32 {
    let bb = b.bbox.unwrap();
    bb.y + bb.h / 2.0
}

/// 块 → line_merge 评分器输入（bbox 必填——调用方保证）。
fn to_line_input(b: &SessionOcrBlock) -> crate::line_merge::LineInput {
    let bb = b.bbox.unwrap();
    crate::line_merge::LineInput {
        text: b.text.clone(),
        x: bb.x,
        y: bb.y,
        w: bb.w,
        h: bb.h,
    }
}

/// 两块合并（① 产物）：文本直拼（中文行内拼接）+ 得分均值 + bbox 并集。
///
/// @ai-context: ASCII 词间空格保持（审查 M1）——英文/数字 OCR 块 trim 后直拼会
///              单词粘连（"Hello " + "World" → "HelloWorld"，空格信息已丢失
///              不可恢复）；中文无词间空格不受影响。
fn merge_two(a: &SessionOcrBlock, b: &SessionOcrBlock) -> SessionOcrBlock {
    let (ba, bb) = (a.bbox.unwrap(), b.bbox.unwrap());
    let x = ba.x.min(bb.x);
    let y = ba.y.min(bb.y);
    let x2 = (ba.x + ba.w).max(bb.x + bb.w);
    let y2 = (ba.y + ba.h).max(bb.y + bb.h);
    let (a_t, b_t) = (a.text.trim(), b.text.trim());
    let gap = if ascii_gap(a_t, b_t) { " " } else { "" };
    SessionOcrBlock {
        id: a.id,
        session_id: a.session_id,
        timestamp_ms: a.timestamp_ms,
        text: format!("{}{}{}", a_t, gap, b_t),
        score: (a.score + b.score) / 2.0,
        region: a.region.clone(),
        region_kind: a.region_kind.clone(),
        bbox: Some(TextBox { x, y, w: x2 - x, h: y2 - y }),
        screen_id: a.screen_id,
    }
}

/// ASCII 词间空格判定（审查 M1）：a 尾字符与 b 首字符均为 ASCII 字母/数字 →
/// 需补空格（英文/数字行合并场景；中文首尾字符非 ASCII 不触发）。
fn ascii_gap(a: &str, b: &str) -> bool {
    a.chars().last().is_some_and(|c| c.is_ascii_alphanumeric())
        && b.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
}

/// 块 → 净化行（trim 文本/bbox）。
fn to_purified(b: &SessionOcrBlock) -> PurifiedLine {
    PurifiedLine {
        text: b.text.trim().to_string(),
        bbox: b.bbox,
    }
}

/// 跨帧增量合并（③，行集版——语义同 incremental_merge：后帧 ⊇ 前帧 && bbox
/// 稳定 → 同屏增量取后帧行集；否则新屏；无 bbox 帧保守不合并）。
///
/// @ai-context: 帧文本 = 帧内行文本 "\n" 拼接（contains 判定基准）；帧 bbox =
///              行 bbox 并集（内容包围盒——增量后包围盒中心漂移 ≤ 行高×0.5
///              视为稳定，与 incremental_merge 同口径）。
fn merge_frames_incremental(frames: &[Vec<PurifiedLine>]) -> Vec<PurifiedLine> {
    let mut out: Vec<PurifiedLine> = Vec::new();
    let mut prev: Option<&Vec<PurifiedLine>> = None;
    for f in frames {
        let mergeable = match prev {
            Some(p) => {
                let prev_text = join_frame(p);
                let cur_text = join_frame(f);
                !prev_text.trim().is_empty()
                    && cur_text.contains(prev_text.trim())
                    && position_stable(p, f)
            }
            None => false,
        };
        if mergeable {
            // 同屏增量：后帧行集替换前帧行集（循环不变量：out 尾部 = 前帧行集）
            out.truncate(out.len().saturating_sub(prev.map(|p| p.len()).unwrap_or(0)));
            out.extend(f.iter().cloned());
        } else {
            out.extend(f.iter().cloned());
        }
        prev = Some(f);
    }
    out
}

/// 帧文本（行 "\n" 拼接——增量包含判定基准）。
fn join_frame(lines: &[PurifiedLine]) -> String {
    lines.iter().map(|l| l.text.trim()).collect::<Vec<_>>().join("\n")
}

/// 帧 bbox 并集（行 bbox 并集；全无 bbox → None）。
fn union_bbox(lines: &[PurifiedLine]) -> Option<TextBox> {
    let boxes: Vec<TextBox> = lines.iter().filter_map(|l| l.bbox).collect();
    if boxes.is_empty() {
        return None;
    }
    let x = boxes.iter().map(|b| b.x).fold(f32::INFINITY, f32::min);
    let y = boxes.iter().map(|b| b.y).fold(f32::INFINITY, f32::min);
    let x2 = boxes.iter().map(|b| b.x + b.w).fold(f32::NEG_INFINITY, f32::max);
    let y2 = boxes.iter().map(|b| b.y + b.h).fold(f32::NEG_INFINITY, f32::max);
    Some(TextBox { x, y, w: x2 - x, h: y2 - y })
}

/// 帧位置稳定（bbox 并集中心位移 ≤ 行高×0.5；无 bbox → 不稳定不合并）。
fn position_stable(a: &[PurifiedLine], b: &[PurifiedLine]) -> bool {
    let Some(ba) = union_bbox(a) else { return false };
    let Some(bb) = union_bbox(b) else { return false };
    let ax = ba.x + ba.w / 2.0;
    let ay = ba.y + ba.h / 2.0;
    let bx = bb.x + bb.w / 2.0;
    let by = bb.y + bb.h / 2.0;
    let h = ba.h.max(bb.h).max(1.0);
    (ax - bx).abs() <= h * crate::incremental_merge::POSITION_STABLE_RATIO
        && (ay - by).abs() <= h * crate::incremental_merge::POSITION_STABLE_RATIO
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
