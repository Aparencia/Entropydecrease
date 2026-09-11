//! 采纳落库 + 任务历史（批 0-C3 Task 4 拆分，原 commands_ai_refine.rs 332–445 行）。
//!
//! @ai-context: 采纳 = ① 以规则基线建笔记（首快照）→ ② 精修版按版本化写路径落库
//!              （ai-refine + 成本 meta）→ ③ 成本落 note_ai_usage → ④ 标记任务已采纳
//!              / 回填成本 → ⑤ 广播 notes 域。
//! @ai-context: 顺序铁律（逐字搬运不得重排）：**采纳守卫前置于任何写库**（2026-09-04
//!              审查修复：后置会留孤儿半态且早退不播 Notes）；守卫失败必须早退。
//! @ai-context: 既有缺陷只搬不改：`mark_ai_task_adopted` / `update_ai_task_cost` 的
//!              返回值被 `let _ =` 静默吞掉（分析 §R7）；`ai_task_history` 的
//!              op_type 白名单与 `unwrap_or(50).min(200)` 两个魔法上界原样保留。

use tauri::State;

use crate::commands::AppState;
use crate::types::{NewNote, Note};

use super::dto::AiRefineResult;

/// 任务历史（F2 任务中心：前端面板数据源——按类型列最近任务）。
#[tauri::command]
pub fn ai_task_history(
    state: State<'_, AppState>,
    op_type: String,
    limit: Option<usize>,
) -> Result<Vec<crate::db_ai_tasks::AiTaskRecord>, String> {
    if op_type != "refine" && op_type != "enrich" {
        return Err("无效的任务类型（refine|enrich）".to_string());
    }
    state
        .db
        .list_ai_tasks(&op_type, limit.unwrap_or(50).min(200))
        .map_err(|e| e.to_string())
}

/// 采纳落库（REQ-141：diff 预览后用户采纳；v0.8.0 M4 版本化写路径——
/// ① 以规则基线建笔记（首快照）→ ② 精修版 = 新版本（ai-refine，含成本
/// meta）→ ③ 成本落库 note_ai_usage）。
/// @ai-context: F2（2026-08-21）：task_id 可选——传入时标记任务已采纳
///              （防重启后从任务中心重复采纳产生重复笔记）。
#[tauri::command]
pub fn ai_refine_apply(
    state: State<'_, AppState>,
    session_id: i64,
    result: AiRefineResult,
    task_id: Option<u64>,
) -> Result<Note, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;
    let fallback = format!("{}（AI 精修）", session.title);
    let title = crate::commands::normalize_title(result.title.clone(), &fallback);
    // 审查修复（2026-09-04）：采纳守卫**前置**于任何写库——F2 注释自称"服务端
    // 前置校验"但实为后置（先建基线笔记/写版本/记 usage 再拒，重复采纳会留
    // 孤儿半态且 Err 早退不播 Notes）；双点/陈旧面板/多入口并发兜底依赖此处。
    if let Some(tid) = task_id {
        if state.db.is_ai_task_adopted(tid) {
            return Err("该任务结果已采纳落库——请勿重复采纳（可到笔记页查看）".to_string());
        }
    }
    // ① 规则基线建笔记（版本链首快照原料——可回溯精修前内容）
    let new = NewNote {
        title: title.clone(),
        content: result.base_markdown.clone(),
        source: "classroom".to_string(),
        session_id: Some(session_id),
        rule_version: Some("rule".to_string()),
        purify_stats: None,
        tags: None,
        properties: None,
        // v0.11.0：精修基线笔记继承会话组归属（组化接线在会话转笔记链路写入，
        // 精修新建基线同样归组——同会话同组，防组内资产漏登）
        group_id: crate::note_group_assign::group_of_session(&state.db, session_id).ok().flatten(),
    };
    let note = state.db.create_note(&new).map_err(|e| e.to_string())?;
    // ② 精修版落库（新版本 ai-refine + 成本 meta）
    // 审查修复（2026-08-21）：落库成本用模型感知单价（与预估同口径——
    // 付费模型预估 ¥X 不再记 ¥0）
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
        .versioned_save(
            note.id,
            &result.refined_markdown,
            crate::note_version::NoteVersionSource::AiRefine,
            &meta,
        )
        .map_err(|e| e.to_string())?;
    // ③ 成本落库（token 估算与预估同口径——校准单价表数据源）
    state
        .db
        .record_ai_usage(
            note.id,
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
    // F2 任务中心：标记采纳 + 成本回填（task_id 可选——旧前端调用不传则跳过；
    // 防重启后从任务中心重复采纳产生重复笔记——采纳守卫已前置于写库前）
    if let Some(tid) = task_id {
        let _ = state.db.mark_ai_task_adopted(tid);
        let _ = state.db.update_ai_task_cost(tid, cost);
    }
    let note_row = state
        .db
        .get_note(note.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())?;
    // REQ-278：采纳落库 = 笔记内容变更 → 广播 notes 域（任务中心/会话页采纳后笔记页即时刷新）
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    Ok(note_row)
}
