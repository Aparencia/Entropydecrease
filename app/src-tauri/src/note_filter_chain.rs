//! @ai-context: 笔记过滤域的**转写段正文过滤链**（批 0-C3 Task 8 S3 从 note_filter.rs
//!              平铺拆出，AGENTS.md §3 单文件 ≤300 行）——视频会话的既有路径，
//!              v0.12.0（ADR-021）提取自原 filter_note 主体，**函数体逐字节未改**。
//! @ai-context: 副作用：无 IO / 无 DB / 无锁 —— 纯内存文本管线（输入 &[SessionSegment]
//!              + &[SessionOcrBlock]，输出 NoteFilterResult）；唯一可变写入是
//!              &mut FilterStats 计数与 seg.text 净化回写。
//! @ai-context: 边界（**判定顺序 = 语义，任何重排都会静默改变输出文本**）：
//!              单遍 6 规则顺序固定 ①ui_junk → ②低置信 → ③过渡短句 → ④口头禅 →
//!              ⑤碎片 → ⑥净化残留；③ 必须先于 ⑤（表内 2 字短语否则被碎片规则先删、
//!              reason 从 Transition 变 Fragment）；⑥ 净化必须先于 ⑧ 相邻去重
//!              （净化顺序契约："嗯…嗯" 与 "嗯" 才判为重复）；⑦ 修辞问句是**跨段后置
//!              pass**（依赖 kept 全集，不可挪进循环）；⑧ 合并延伸 `last.end_ms = max`。
//!              `stats.filler += 1` 出现两处（④ 口癖命中 / ⑥ 净化残留）——语义不同，
//!              合并即错。
//! @ai-context: 边界（既有缺陷，只搬不改）：本函数经 `concat_transcript` 传给
//!              screens::filter_usable_blocks 的共现文本**末段带尾随半角空格**。
//! @ai-context: 可见性：`pub(crate)`（主文件 filter_note 的同分录调用点需要）——
//!              9 个私有 fn 零直测，放宽不改变任何测试。

use crate::note_body_source::BodySource;
use crate::types::{SessionOcrBlock, SessionSegment};
use crate::ui_junk::UiJunkList;

use super::purify::{concat_transcript, is_filler_only, is_fragment, is_purified_empty, purify_segment};
use super::render::rebuild_markdown;
// `render_screen_points` 经**父模块的再导出**消费（拆前 `crate::note_filter::render_screen_points`
// 就是过滤链的入口）——保持对外名字可达，不新增平行路径、也不产生 unused import。
use super::{
    render_screen_points, FilterStats, FilteredItem, FilterReason, MergedItem, NoteFilterResult,
    PurifyEnv,
};

/// 转写段正文过滤链（视频会话——既有路径，v0.12.0 提取自原 filter_note 主体，
/// 逻辑零改动；OcrDirect/Empty 分派见 filter_note）。
///
/// @ai-context: 转写段按过滤链处理（见模块头）；OCR 画面要点先经
///              screens::filter_usable_blocks（v0.7.5：低分 0.7/单字符/边缘
///              条带/视频页 UI 共现/错字纠错）排除，再屏构建与精确去重。
pub(crate) fn filter_note_transcript(
    title: &str,
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    ui_junk: &UiJunkList,
    env: &PurifyEnv,
) -> NoteFilterResult {
    let config = &env.config;
    let symbol_cfg = &env.symbol;
    let corrections = &env.corrections;
    // ① 转写段过滤链（空文本段跳过；按时间排序保证相邻性）
    let mut sorted: Vec<SessionSegment> = segments
        .iter()
        .filter(|s| !s.text.trim().is_empty())
        .cloned()
        .collect();
    sorted.sort_by_key(|s| (s.start_ms, s.id));
    let mut kept: Vec<SessionSegment> = Vec::new();
    let mut stats = FilterStats::default();
    let mut filtered = Vec::new();
    let mut merged = Vec::new();
    for mut seg in sorted {
        let text = seg.text.trim();
        // ① UI 垃圾特征兜底（与 REQ-083 同表——源头漏拦的兜底）
        if ui_junk.is_junk(text) {
            stats.ui_junk += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::UiJunk,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ② 低置信丢弃（confidence=None 的字幕段跳过——无置信度证据不删）
        if seg.confidence.is_some_and(|c| c < config.low_confidence_threshold) {
            stats.low_confidence += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::LowConfidence,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ③ 纯过渡短句删除（v0.7.5 扩展：整句 ∈ 精确表——"接下来/我们来看"
        //     单独成段无信息；"接下来我们看第三章"不在表内不误杀）。
        //     先于碎片检查：表内 2 字短语（首先/总之/好吧）若后置会被碎片规则
        //     （≤2 字）先删，原因标签失真（过渡原因更准确）
        if config.transition_delete
            && crate::note_filter_discourse::is_transition_short(text, config.transition_max_chars)
        {
            stats.transition += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Transition,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ④ 口头禅短段规则级删除（REQ-163：免 AI——段 1018「对不对？」类；
        //     基于原文判定——净化前形状特征未被破坏）
        if config.filler_delete && is_filler_only(text, config) {
            stats.filler += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Filler,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ⑤ 碎片段（≤2 字 / <500ms / 纯符号——"----/···" 等无信息内容）
        if is_fragment(&seg, config) {
            stats.fragments += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Fragment,
                text: text.to_string(),
                start_ms: seg.start_ms,
            });
            continue;
        }
        // ⑥ 口语净化（REQ-162/164）：书面化（保守档）→ 符号 → 结巴折叠 → 术语替换
        let original = seg.text.clone();
        let purified = purify_segment(&original, config, symbol_cfg, &mut stats);
        // ⑦ 净化残留检查：空/纯符号（"对不对？"→"？"）/ 短口头禅（"哈"）→ 删除
        if is_purified_empty(&purified) {
            stats.filler += 1;
            filtered.push(FilteredItem {
                segment_id: seg.id,
                reason: FilterReason::Filler,
                text: original,
                start_ms: seg.start_ms,
            });
            continue;
        }
        seg.text = purified;
        kept.push(seg);
    }
    // ⑥ 修辞问句删除（v0.7.5 扩展：自问自答——问句核心词在紧邻段复现，
    //    会话31「过程是什么？」+「这个过程是制定项目章程」实证；跨段上下文
    //    需 kept 全集，故在单遍循环后执行）
    if config.rhetorical_delete {
        kept = crate::note_filter_discourse::drop_rhetorical_questions(
            kept,
            config.rhetorical_max_chars,
            &mut stats,
            &mut filtered,
        );
    }
    // ⑦ 相邻重复段合并（净化后文本精确去重——净化顺序契约；合并延伸 end_ms）
    let mut deduped: Vec<SessionSegment> = Vec::new();
    for seg in kept {
        if let Some(last) = deduped.last_mut() {
            if last.text.trim() == seg.text.trim() {
                stats.duplicates += 1;
                filtered.push(FilteredItem {
                    segment_id: seg.id,
                    reason: FilterReason::Duplicate,
                    text: seg.text.clone(),
                    start_ms: seg.start_ms,
                });
                merged.push(MergedItem {
                    segment_id: seg.id,
                    into_segment_id: last.id,
                    text: seg.text.clone(),
                    start_ms: seg.start_ms,
                });
                last.end_ms = last.end_ms.max(seg.end_ms);
                continue;
            }
        }
        deduped.push(seg);
    }
    let kept = deduped;
    // 画面要点（v0.7.3 REQ-160：可消费块过滤 → 屏构建 → 屏段落渲染；
    //    v0.7.5：过滤含单字符/边缘条带/视频页共现/错字纠错——见 screens.rs）
    let transcript = concat_transcript(&kept);
    let (usable, ocr_corrected) =
        crate::screens::filter_usable_blocks(ocr_blocks, ui_junk, config, &transcript, corrections);
    stats.ocr_corrected = ocr_corrected;
    let ocr_screens = crate::screens::build_screens(&usable, None);
    let ocr_points = render_screen_points(&ocr_screens);
    let markdown = rebuild_markdown(title, &kept, &[], config, None);
    NoteFilterResult {
        title: title.to_string(),
        markdown,
        kept,
        ocr_points,
        ocr_screens,
        stats,
        filtered,
        merged,
        purify: config.clone(),
        warning: None,
        body_source: BodySource::Transcript,
        ocr_body: Vec::new(),
    }
}
