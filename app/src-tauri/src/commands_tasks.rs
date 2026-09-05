//! 行动裁决命令族（v0.20.3 / REQ-293/294/298 数据面）。
//!
//! @ai-context: 裁决漏斗哲学（v0.20.md 决策 #2）——不留死尸的机制是裁决不是
//!              自动清理：✓完成=正文字符级 [x]（tasks_core 原子层）+ 完成史；
//!              ✗放弃=同 [x] + 史留原因；📅改期=只落索引列（计划日是元数据，
//!              不进正文——不污染可复跑模板）；🎴转卡=G7 预留接口（UI 置灰）。
//! @ai-context: 提炼（产物 ☑️ 行 → 标准 `- [ ]`）走 replace_line 写回正文后
//!              update_note（自动触发 task_index 重扫）；状态写回全入口收敛
//!              于 tasks_core（勾选/裁决同源）。
//! @ai-context: 完成史事件（REQ-298）逐裁决落 completion_history——周回顾原料。

use serde::Serialize;
use tauri::State;

use crate::commands::AppState;
use crate::db::Db;
use crate::db_completion::{CompletionEvent, EV_ABANDONED, EV_DONE};
use crate::db_task_index::TaskIndexRow;
use crate::tasks_core::{migrate_status, replace_line, TaskStatus};

/// 队列分区标签。
pub const TAB_OVERDUE: &str = "overdue";
pub const TAB_PLANNED: &str = "planned";
pub const TAB_SOMEDAY: &str = "someday";
pub const TAB_UNREFINED: &str = "unrefined";

/// 任务行 + 裁决上下文（队列视图行）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionQueueRow {
    pub id: i64,
    pub note_id: i64,
    pub line_no: i64,
    pub text: String,
    pub status: String,
    pub unrefined: bool,
    pub plan_date: Option<i64>,
    pub disposition: Option<String>,
    pub note_title: String,
}

fn today_start_secs() -> i64 {
    crate::db::unix_seconds() / 86_400 * 86_400
}

/// 分区过滤（纯函数）：overdue=计划日已过；planned=计划日≥今天；someday=未排期；
/// unrefined=产物遗留行（仅 todo 语义行参与裁决分区）。
pub fn partition_rows<'a>(rows: &'a [TaskIndexRow], tab: &str) -> Vec<&'a TaskIndexRow> {
    let today = today_start_secs();
    let todo = |r: &TaskIndexRow| r.status == "todo";
    match tab {
        TAB_OVERDUE => rows.iter().filter(|r| todo(r) && !r.unrefined && r.plan_date.is_some_and(|d| d < today)).collect(),
        TAB_PLANNED => rows.iter().filter(|r| todo(r) && !r.unrefined && r.plan_date.is_some_and(|d| d >= today)).collect(),
        TAB_SOMEDAY => rows.iter().filter(|r| todo(r) && !r.unrefined && r.plan_date.is_none()).collect(),
        TAB_UNREFINED => rows.iter().filter(|r| r.unrefined && r.status == "todo").collect(),
        _ => Vec::new(),
    }
}

fn to_action(row: &TaskIndexRow) -> ActionQueueRow {
    ActionQueueRow {
        id: row.id,
        note_id: row.note_id,
        line_no: row.line_no,
        text: row.task_text.clone(),
        status: row.status.clone(),
        unrefined: row.unrefined,
        plan_date: row.plan_date,
        disposition: row.disposition.clone(),
        note_title: row.note_title.clone(),
    }
}

/// 行动队列（tab 分区；None scope=跨组全量，Some=单笔记）。
#[tauri::command]
pub fn list_action_queue(
    state: State<'_, AppState>,
    tab: String,
    note_id: Option<i64>,
) -> Result<Vec<ActionQueueRow>, String> {
    let rows = state.db.list_task_queue(note_id).map_err(|e| e.to_string())?;
    let filtered = partition_rows(&rows, &tab);
    Ok(filtered.into_iter().map(to_action).collect())
}

/// 行动徽标数（逾期+到期 todo 计数——组侧栏 ✅ 徽标数据源）。
#[tauri::command]
pub fn action_badge_count(state: State<'_, AppState>) -> Result<u64, String> {
    let rows = state.db.list_task_queue(None).map_err(|e| e.to_string())?;
    let today = today_start_secs();
    let n = rows
        .iter()
        .filter(|r| r.status == "todo" && !r.unrefined && r.plan_date.is_some_and(|d| d < today))
        .count() as u64;
    Ok(n)
}

/// 正文写回统一出口：取笔记 → 行变换 → update_note（触发索引重扫/广播）。
fn rewrite_body(db: &Db, row: &TaskIndexRow, transform: impl FnOnce(&str) -> Option<String>) -> Result<(), String> {
    let note = db
        .get_note(row.note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在（可能已删除）".to_string())?;
    let new_content = transform(&note.content).ok_or_else(|| "任务行已失效（正文变化请刷新）".to_string())?;
    db.update_note(row.note_id, &note.title, &new_content)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// ✓ 完成（裁决）：正文 [x] + done 入史。核心逻辑注入 Db 可单测。
pub fn complete_task_core(db: &Db, row_id: i64) -> Result<String, String> {
    let row = db.get_task_row(row_id).map_err(|e| e.to_string())?.ok_or_else(|| "任务不存在".to_string())?;
    if row.unrefined {
        return Err("产物遗留行请先「提炼为任务行」再裁决".to_string());
    }
    let payload = row.task_text.clone();
    rewrite_body(db, &row, |body| {
        let lines: Vec<&str> = body.split('\n').collect();
        let line = *lines.get(row.line_no as usize)?;
        let migrated = migrate_status(line, TaskStatus::Done)?;
        replace_line(body, row.line_no as usize, &migrated)
    })?;
    db.add_completion_event(EV_DONE, "task_line", Some(row_id), Some(row.note_id), &payload, None, None)
        .map_err(|e| e.to_string())?;
    Ok(format!("✓ 已完成：{}", payload))
}

/// ✗ 放弃（裁决留因）：正文 [x] + abandoned 入史（原因随行）。
pub fn abandon_task_core(db: &Db, row_id: i64, reason: &str) -> Result<String, String> {
    let row = db.get_task_row(row_id).map_err(|e| e.to_string())?.ok_or_else(|| "任务不存在".to_string())?;
    if row.unrefined {
        return Err("产物遗留行请先「提炼为任务行」再裁决".to_string());
    }
    let payload = row.task_text.clone();
    rewrite_body(db, &row, |body| {
        let lines: Vec<&str> = body.split('\n').collect();
        let line = *lines.get(row.line_no as usize)?;
        let migrated = migrate_status(line, TaskStatus::Done)?;
        replace_line(body, row.line_no as usize, &migrated)
    })?;
    let reason = reason.trim();
    db.add_completion_event(
        EV_ABANDONED,
        "task_line",
        Some(row_id),
        Some(row.note_id),
        &payload,
        (!reason.is_empty()).then_some(reason),
        None,
    )
    .map_err(|e| e.to_string())?;
    Ok(format!("已放弃（留因）：{}", payload))
}

/// 提炼（产物 ☑️ 行 → 标准 `- [ ] payload`，插回同位置）。
pub fn refine_unrefined_core(db: &Db, row_id: i64) -> Result<String, String> {
    let row = db.get_task_row(row_id).map_err(|e| e.to_string())?.ok_or_else(|| "任务不存在".to_string())?;
    if !row.unrefined {
        return Err("仅产物遗留行（☑️）可提炼".to_string());
    }
    let payload = row.task_text.clone();
    rewrite_body(db, &row, |body| {
        let lines: Vec<&str> = body.split('\n').collect();
        let line = *lines.get(row.line_no as usize)?;
        let indent = &line[..line.find('-').unwrap_or(0)];
        replace_line(body, row.line_no as usize, &format!("{}- [ ] {}", indent, payload))
    })?;
    Ok(format!("已提炼为任务行：{}", payload))
}

/// ✓ 完成（IPC）。
#[tauri::command]
pub fn task_complete(state: State<'_, AppState>, row_id: i64) -> Result<String, String> {
    complete_task_core(&state.db, row_id)
}

/// ✗ 放弃（IPC；reason 可空）。
#[tauri::command]
pub fn task_abandon(state: State<'_, AppState>, row_id: i64, reason: Option<String>) -> Result<String, String> {
    abandon_task_core(&state.db, row_id, reason.as_deref().unwrap_or(""))
}

/// 提炼（IPC）。
#[tauri::command]
pub fn task_refine_unrefined(state: State<'_, AppState>, row_id: i64) -> Result<String, String> {
    refine_unrefined_core(&state.db, row_id)
}

/// 📅 改期（只落索引列；date=None 清除=归入「搁置」）。
#[tauri::command]
pub fn task_set_plan_date(
    state: State<'_, AppState>,
    row_id: i64,
    plan_date: Option<i64>,
) -> Result<(), String> {
    state
        .db
        .set_task_plan_date(row_id, plan_date)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 完成史列表（周回顾/成长轨迹原料）。
#[tauri::command]
pub fn completion_history_list(
    state: State<'_, AppState>,
    event_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<CompletionEvent>, String> {
    state
        .db
        .list_completion_events(event_type.as_deref(), limit.unwrap_or(200))
        .map_err(|e| e.to_string())
}

/// 占位导出（todo.txt 行文本——REQ-295 保底三件套的「复制」面由前端剪贴板完成）。
#[allow(dead_code)] // 文件导出由前端拼接行内容（保底通道）——本纯函数留作校验/复现用
pub fn export_todotxt_lines(rows: &[ActionQueueRow]) -> String {
    rows.iter()
        .map(|r| format!("[ ] {} (via:{})", r.text, r.note_title))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
#[path = "commands_tasks_tests.rs"]
mod tests;
