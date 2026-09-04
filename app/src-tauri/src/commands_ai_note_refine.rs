//! 笔记级 AI 精修 commands（REQ-246，v0.17.0——手写笔记刚需）。
//!
//! @ai-context: 与会话级（commands_ai_refine）差异：目标=笔记（手写/任意）；
//!              输入=编辑器当前内容直接传参（未保存所见即所修，None=读库）；
//!              基线=当前笔记版（采纳时笔记已变 → 拒绝防覆盖）；profile=
//!              handwritten（笔记式）/用户所选；版本链 source=ai-refine。
//! @ai-context: 复用：授权红线（enabled+authorized content_gate）、成本
//!              拦截/配额、任务注册表/事件/轨迹、AiRefineResult/工作台；
//!              任务执行在 ai_note_refine_task.rs（输入构建层）。

use std::sync::atomic::Ordering;

use tauri::State;

use crate::ai_cost::estimate_for_content_model;
use crate::ai_note_refine::NoteRefinePrompt;
use crate::ai_strategy::StrategyOverride;
use crate::ai_task::AiTaskState;
use crate::commands::AppState;
use crate::commands_ai_refine::{AiRefineResult, AiTaskEntry, AiTaskHandle, RefineEstimateView};
use crate::note_version::NoteVersionSource;
use crate::types::Note;

/// 笔记级默认档案（笔记式——仅笔记级请求使用，采集端零改动；ADR-026-4）。
pub const NOTE_PROFILE_HANDWRITTEN: &str = "handwritten";

/// 成本预估（与精修预估同视图；chars=传入内容或已存内容——所见口径）。
#[tauri::command]
pub fn ai_note_refine_estimate(
    state: State<'_, AppState>,
    note_id: i64,
    content: Option<String>,
) -> Result<RefineEstimateView, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    let note = get_note(&state, note_id)?;
    let chars = content.unwrap_or(note.content).chars().count();
    let remember = state.ai_settings.lock().map(|s| s.remember_cost_choice).unwrap_or(false);
    let model = state.ai_settings.lock().map(|s| s.model.clone()).unwrap_or_default();
    Ok(RefineEstimateView { estimate: estimate_for_content_model(chars, &model), remember_cost_choice: remember })
}

/// 启动笔记级精修异步任务（授权红线 + 密钥解析 + 后台切片逐片精修）。
#[tauri::command]
pub async fn ai_note_refine_start(
    state: State<'_, AppState>,
    note_id: i64,
    content: Option<String>,
    profile: Option<String>,
    authorized: bool,
    strategy: Option<StrategyOverride>,
) -> Result<AiTaskHandle, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    let st: AppState = (*state).clone();
    let settings = st.ai_settings.lock().map_err(|e| format!("AI 设置锁中毒: {}", e))?.clone();
    settings.content_gate()?;
    if !authorized {
        return Err("本次上传未确认——请先阅读并同意授权说明".to_string());
    }
    let mock = std::env::var("AI_REFINE_MOCK").map(|v| v == "1").unwrap_or(false);
    if !mock {
        let ready = crate::commands_ai_providers::default_provider_ready(&st)?;
        if !ready {
            return Err("未配置 API 密钥（请在设置页 AI 服务提供商中配置）".to_string());
        }
    }
    // 任务去重——按目标笔记粒度（防同笔记重复扣费）
    {
        let tasks = st.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
        let active = tasks.values().any(|t| {
            t.target_id == note_id
                && matches!(t.state, AiTaskState::Pending | AiTaskState::Running { .. })
        });
        if active {
            return Err("该笔记已有进行中的 AI 任务——请等待完成或到任务中心查看进度（防重复扣费）".to_string());
        }
    }
    // 成本硬拦截 + 每日配额（顺序铁律：先余额后配额）
    if !mock {
        let note = get_note(&st, note_id)?;
        let chars = match &content {
            Some(c) => c.chars().count(),
            None => note.content.chars().count(),
        };
        crate::commands_ai_refine::ensure_balance_for(&st, chars, &settings.model)?;
        let slices = if chars == 0 {
            0
        } else {
            chars.saturating_add(crate::ai_task::SLICE_MAX_CHARS - 1) / crate::ai_task::SLICE_MAX_CHARS
        };
        let now = crate::db_sessions_rows::unix_seconds();
        let mut guards = st.ai_guardrails.lock().map_err(|e| format!("护栏状态锁中毒: {}", e))?;
        for _ in 0..slices {
            if !guards.quota.try_consume(now) {
                return Err("今日 AI 精修配额已用完（请明日再试或到设置页调整）".to_string());
            }
        }
        drop(guards);
    }
    let task_id = st.ai_task_seq.fetch_add(1, Ordering::Relaxed);
    {
        let mut tasks = st.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
        tasks.insert(task_id, AiTaskEntry { state: AiTaskState::Pending, result: None, target_id: note_id });
        crate::commands_ai_refine::trim_tasks(&mut tasks);
    }
    if let Err(e) = st.db.insert_ai_task(&crate::db_ai_tasks::AiTaskRecord {
        task_id,
        op_type: "refine".to_string(),
        ref_id: note_id,
        state: "pending".to_string(),
        result_json: None,
        cost_yuan: None,
        elapsed_ms: None,
        model: None,
        error: None,
        slices: None,
        created_at: crate::db_sessions_rows::unix_seconds(),
        finished_at: None,
        adopted: false,
        target_kind: Some("note".to_string()),
    }) {
        eprintln!("[AiTasks] note-refine 任务 {} 落库失败（不阻断 AI 调用；重启后不可恢复）: {}", task_id, e);
    }
    let dims = crate::ai_strategy::resolve(
        &NoteRefinePrompt::bundled(),
        &settings.refine_strategy,
        strategy.as_ref(),
    );
    let profile = profile.unwrap_or_else(|| NOTE_PROFILE_HANDWRITTEN.to_string());
    let st2 = st.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai_note_refine_task::run_note_refine_task(st2, task_id, note_id, content, profile, mock, dims)
    });
    Ok(AiTaskHandle { task_id, state: AiTaskState::Pending })
}

/// 笔记级采纳落库（版本链 ai-refine + 成本 meta + note_ai_usage 落库）。
///
/// @ai-context: 防覆盖：基线（发起时内容）与该笔记当前内容不一致 → 拒绝
///              （用户已继续编辑——提示重新精修，不静默覆盖最新改动）。
#[tauri::command]
pub fn ai_note_refine_apply(
    state: State<'_, AppState>,
    note_id: i64,
    result: AiRefineResult,
    task_id: Option<u64>,
) -> Result<Note, String> {
    let cur = get_note(&state, note_id)?;
    if cur.content != result.base_markdown {
        return Err("笔记内容已在你精修后被修改——请重新精修（当前版本未被覆盖，可先行查看）".to_string());
    }
    // 审查修复（2026-09-04）：采纳守卫前置于任何写库（重复采纳防重复版本+usage）
    if let Some(tid) = task_id {
        if state.db.is_ai_task_adopted(tid) {
            return Err("该任务结果已采纳落库——请勿重复采纳（可到笔记页查看）".to_string());
        }
    }
    let cost = crate::ai_cost::usage_cost_for_model(
        result.base_markdown.chars().count(),
        result.refined_markdown.chars().count(),
        &result.model,
    );
    let meta = crate::note_version::VersionMeta {
        cost_yuan: Some(cost),
        model: Some(result.model.clone()),
        slices: Some(result.slices),
        merged_from: None,
    };
    state
        .db
        .versioned_save(note_id, &result.refined_markdown, NoteVersionSource::AiRefine, &meta)
        .map_err(|e| e.to_string())?;
    state
        .db
        .record_ai_usage(
            note_id,
            &crate::db_ai_usage::AiUsageInput {
                op_type: "refine",
                tokens_in: result.base_markdown.chars().count(),
                tokens_out: result.refined_markdown.chars().count(),
                cost_yuan: cost,
                model: result.model.clone(),
                slices: result.slices,
            },
        )
        .map_err(|e| e.to_string())?;
    if let Some(tid) = task_id {
        let _ = state.db.mark_ai_task_adopted(tid);
        let _ = state.db.update_ai_task_cost(tid, cost);
    }
    let note = get_note(&state, note_id)?;
    // REQ-278：笔记级采纳落库 → 广播 notes 域
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    Ok(note)
}

/// 笔记存在性校验（统一错误文案——command 层提前失败给明确错误）。
fn get_note(state: &AppState, note_id: i64) -> Result<Note, String> {
    state
        .db
        .get_note(note_id)
        .map_err(|e| format!("读取笔记失败: {}", e))?
        .ok_or_else(|| "笔记不存在".to_string())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_ai_note_refine_tests.rs"]
mod tests;
