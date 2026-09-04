//! 笔记级 AI 精修任务（REQ-246，v0.17.0——手写笔记刚需）。
//!
//! @ai-context: 与会话级差异：输入=笔记内容（编辑器当前内容直接传参——
//!              未保存所见即所修；None=读库已存内容）；基线=当前笔记版；
//!              profile=handwritten（笔记式）/用户所选档案——无规则草稿/
//!              锚点剥离/章节分析（章节=内容 ## 标题提取，无则空=模型归纳）。
//! @ai-context: 复用：并发切片精修（refine_slices_concurrent）、策略解析
//!              （dims）、任务收尾（run_refine_task_skeleton）——本模块只
//!              做输入构建与合并；版本链 source=ai-refine 采纳在 command 层。

use crate::ai_chat::AiTurn;
use crate::ai_mock::AiMockAdapter;
use crate::ai_refine_task::{build_refine_adapter, refine_slices_concurrent, run_refine_task_skeleton, RefineCtx};
use crate::ai_strategy::ResolvedDims;
use crate::ai_task::{slice_note, AiTaskFailure, AiTaskState, SLICE_MAX_CHARS};
use crate::commands::AppState;
use crate::commands_ai_refine::{set_task, AiRefineResult};

/// 从笔记 markdown 提取章节标题（行首 "## "——协议沿用输入章节；
/// 无标题章节 → 空 vec（模型按内容归纳，不自行发明章节之外的内容）。
fn chapters_from_markdown(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|l| {
            let s = l.trim_start().strip_prefix("## ")?.trim();
            if s.is_empty() { None } else { Some(s.to_string()) }
        })
        .collect()
}

/// 后台笔记级精修任务（输入构建 → 切片 → 并发精修 → 合并 → diff）。
pub fn run_note_refine_task(
    st: AppState,
    task_id: u64,
    note_id: i64,
    content: Option<String>,
    profile: String,
    mock: bool,
    dims: ResolvedDims,
) {
    eprintln!(
        "[refine-task] task={} start note={} mock={} strategy={}",
        task_id, note_id, mock, dims.preset_id
    );
    run_refine_task_skeleton(st.clone(), task_id, format!("note={}", note_id), move || {
        run_note_refine_inner(&st, task_id, note_id, content, profile, mock, &dims)
    });
}

/// 笔记级任务主体（panic 由骨架 catch_unwind 兜底）。
///
/// @ai-context: content 传入（未保存编辑稿）与 note.content 不一致时以传入
///              为准（所见即所修）；采纳层防冲突（采纳时该笔记已变则拒绝）。
fn run_note_refine_inner(
    st: &AppState,
    task_id: u64,
    note_id: i64,
    content: Option<String>,
    profile: String,
    mock: bool,
    dims: &ResolvedDims,
) -> Result<(AiRefineResult, Vec<AiTurn>), AiTaskFailure> {
    let note = st
        .db
        .get_note(note_id)
        .map_err(|e| AiTaskFailure::Other(e.to_string()))?
        .ok_or_else(|| AiTaskFailure::Other("笔记不存在".to_string()))?;
    let base = content.unwrap_or_else(|| note.content.clone());
    let chapters = chapters_from_markdown(&base);
    eprintln!(
        "[refine-task] task={} note 基线字符={} 章节={}",
        task_id,
        base.chars().count(),
        chapters.len()
    );
    let slices = slice_note(&base, SLICE_MAX_CHARS);
    let total = slices.len();
    set_task(st, task_id, AiTaskState::Running { finished_slices: 0, total_slices: total });
    let (client, adapter) = build_refine_adapter(st)?;
    let (markdowns, failed, mut turns) = refine_slices_concurrent(RefineCtx {
        slices: &slices,
        chapters: &chapters,
        glossary: &[],
        profile: &profile,
        adapter: &adapter,
        mock_adapter: &AiMockAdapter,
        mock,
        workers: total.min(crate::ai_refine_task::CONCURRENCY),
        st,
        task_id,
        // 笔记级纯文本精修（画面理解仅视频会话——REQ-246 不做图片上传扩展）
        vision_images: &[],
        dims,
    });
    // 合并（无锚点映射——笔记级不做锚点回挂；配图行丢失兜底合并回基线）
    let mut refined = crate::ai_refine_protocol::merge_refine_slices(&markdowns, &[]);
    refined = crate::note_image_merge::merge_rule_images(&base, &refined);
    let diff = crate::note_diff::diff_markdown(&base, &refined);
    let (added, removed, _) = crate::note_diff::diff_stats(&diff);
    turns.sort_by_key(|t| t.turn);
    Ok((
        AiRefineResult {
            title: note.title.clone(),
            base_markdown: base,
            refined_markdown: refined,
            diff,
            added_lines: added,
            removed_lines: removed,
            slices: total,
            failed_slices: failed,
            model: client.config.model,
            strategy: Some(crate::commands_ai_refine::RefineStrategyInfo {
                preset_id: dims.preset_id.clone(),
                dims: dims.dims.clone(),
                // REQ-279：自定义档文本随结果落库（溯源/重生成沿用）
                custom_text: if dims.custom_text.is_empty() { None } else { Some(dims.custom_text.clone()) },
            }),
        },
        turns,
    ))
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_note_refine_task_tests.rs"]
mod tests;
