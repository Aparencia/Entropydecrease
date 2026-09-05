//! SOP 功能区命令面（v0.20.3 / REQ-296/297）。
//!
//! @ai-context: 只做校验与编排（AGENTS.md §6）：模板=行范围引用（无双写——
//!              编辑段落即编辑模板）；run 启动校验行范围/步数，证据路径白名单
//!              `notes-images/`（G3：图片三入口落盘目录）；结束写完成史
//!              （sop_run——完成即证据）；修订建议 v1 纯本地聚合（步骤 N
//!              失败 M 次提示——AI 拟稿后置，AiSettings 闸门默认关，G4）。

use tauri::State;

use crate::commands::AppState;
use crate::db_sop::{
    lines_to_steps, EVIDENCE_PREFIX, MAX_SOP_STEPS, MODE_READDO, RUN_ABORTED,
    RUN_DONE, SopRunDetail, SopTemplate,
};

/// 建模板（编辑器工具栏「生成 SOP」入口：当前选中段落行范围）。
#[tauri::command]
pub fn sop_template_create(
    state: State<'_, AppState>,
    note_id: i64,
    name: String,
    start_line: i64,
    end_line: i64,
    mode: Option<String>,
) -> Result<i64, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("模板名不能为空".to_string());
    }
    if name.chars().count() > 60 {
        return Err("模板名过长（≤60 字符）".to_string());
    }
    if start_line < 0 || end_line < start_line {
        return Err("行范围非法".to_string());
    }
    let note = state
        .db
        .get_note(note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())?;
    let steps = lines_to_steps(&note.content, start_line, end_line);
    if steps.is_empty() {
        return Err("所选段落无内容（无法生成空 SOP）".to_string());
    }
    if steps.len() > MAX_SOP_STEPS {
        return Err(format!("所选段落超过 {} 步上限——请缩小范围", MAX_SOP_STEPS));
    }
    let mode = mode.unwrap_or_else(|| MODE_READDO.to_string());
    state
        .db
        .create_sop_template(note_id, name, start_line, end_line, &mode)
        .map_err(|e| e.to_string())
}

/// 模板列表（None=全部；行动中心「SOP 库」页签数据源）。
#[tauri::command]
pub fn sop_template_list(
    state: State<'_, AppState>,
    note_id: Option<i64>,
) -> Result<Vec<SopTemplate>, String> {
    state.db.list_sop_templates(note_id).map_err(|e| e.to_string())
}

/// 删除模板（只删引用不动正文）。
#[tauri::command]
pub fn sop_template_delete(state: State<'_, AppState>, template_id: i64) -> Result<(), String> {
    let ok = state
        .db
        .delete_sop_template(template_id)
        .map_err(|e| e.to_string())?;
    if !ok {
        return Err("模板不存在".to_string());
    }
    Ok(())
}

/// 启动 run（快照当前行范围步骤；返回 run id）。
#[tauri::command]
pub fn sop_run_start(state: State<'_, AppState>, template_id: i64) -> Result<i64, String> {
    let tmpl = state
        .db
        .get_sop_template(template_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "模板不存在".to_string())?;
    // 有进行中的 run 拒绝并发执行（同一模板同时只跑一个——防双开重复证据）
    let running = state
        .db
        .list_sop_runs(template_id, 50)
        .map_err(|e| e.to_string())?
        .iter()
        .any(|r| r.status == "active");
    if running {
        return Err("该模板已有进行中的执行——请先结算或中止".to_string());
    }
    state.db.start_sop_run(&tmpl).map_err(|e| e.to_string())
}

/// run 详情（执行面数据源：轨迹/步骤/保鲜 diff）。
#[tauri::command]
pub fn sop_run_detail(state: State<'_, AppState>, run_id: i64) -> Result<SopRunDetail, String> {
    state
        .db
        .sop_run_detail(run_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "run 不存在".to_string())
}

/// 步更新（done|skipped|failed；证据路径白名单 notes-images/；failed 可留因）。
#[tauri::command]
pub fn sop_step_update(
    state: State<'_, AppState>,
    run_id: i64,
    step_no: i64,
    status: String,
    evidence_path: Option<String>,
    failure_note: Option<String>,
) -> Result<(), String> {
    if !matches!(status.as_str(), "done" | "skipped" | "failed") {
        return Err("非法步状态（done/skipped/failed）".to_string());
    }
    if let Some(ev) = &evidence_path {
        if !ev.starts_with(EVIDENCE_PREFIX) {
            return Err(format!("证据路径须在 {} 下", EVIDENCE_PREFIX));
        }
        if ev.len() > 260 {
            return Err("证据路径过长".to_string());
        }
    }
    if let Some(n) = &failure_note {
        if n.chars().count() > 500 {
            return Err("失败原因过长（≤500 字）".to_string());
        }
    }
    if let Some(run) = state.db.get_sop_run(run_id).map_err(|e| e.to_string())? {
        if run.status != "active" {
            return Err("run 已结束，不能再更新步骤".to_string());
        }
    }
    let ok = state
        .db
        .update_sop_step(run_id, step_no, &status, evidence_path.as_deref(), failure_note.as_deref())
        .map_err(|e| e.to_string())?;
    if !ok {
        return Err("步骤不存在（run 已结束或步号越界）".to_string());
    }
    Ok(())
}

/// 结算 run（done=全流程完成；aborted=中止；写完成史 + 保鲜 diff 回传）。
#[tauri::command]
pub fn sop_run_finish(
    state: State<'_, AppState>,
    run_id: i64,
    status: String,
) -> Result<SopRunDetail, String> {
    let status = if status == RUN_ABORTED { RUN_ABORTED } else { RUN_DONE };
    state.db.finish_sop_run(run_id, status).map_err(|e| e.to_string())
}

/// run 轨迹回看（模板维度）。
#[tauri::command]
pub fn sop_run_list(
    state: State<'_, AppState>,
    template_id: i64,
    limit: Option<usize>,
) -> Result<Vec<crate::db_sop::SopRun>, String> {
    state
        .db
        .list_sop_runs(template_id, limit.unwrap_or(20))
        .map_err(|e| e.to_string())
}

/// 修订建议（v1 纯本地：失败步聚合——"步骤 N 累计失败 M 次"；AI 拟稿后置）。
#[tauri::command]
pub fn sop_revision_suggestions(
    state: State<'_, AppState>,
    template_id: i64,
) -> Result<Vec<String>, String> {
    let agg = state
        .db
        .sop_failure_aggregate(template_id)
        .map_err(|e| e.to_string())?;
    Ok(agg
        .into_iter()
        .map(|(no, text, count)| {
            format!("步骤 {}（{}）累计失败 {} 次——建议复核该步做法或预期结果", no, truncate(&text, 20), count)
        })
        .collect())
}

fn truncate(s: &str, n: usize) -> String {
    let t: String = s.chars().take(n).collect();
    if s.chars().count() > n { format!("{}…", t) } else { t }
}
