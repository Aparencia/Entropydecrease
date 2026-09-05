//! 后处理收尾命令面（v0.20.3 / REQ-294/295/299/300）。
//!
//! @ai-context: 本文件收敛 v0.20.3 尾部数据面——迁出通道（.todo.txt 文件导出 +
//!              手动回填史，保底三件套之文件/回填；scheme/邮件=复制指引文案
//!              后置）+ 周回顾批决议（batch_weekly_resolve 单事务：正文 [x] 化 +
//!              完成史逐条 + task_index 重建）+ 练习条目打点 + 问题清单
//!              （Me 问题化 open/answered/archived）。UI 触点零新增哲学：
//!              练习/问题入口在行动中心页签（前端）与笔记工具栏「转为问题」。

use serde::Deserialize;
use rusqlite::params;
use tauri::State;

use crate::commands::AppState;
use crate::db::Db;
use crate::db_completion::EV_EXPORT_MANUAL_DONE;
use crate::db_practice::PracticeItem;
use crate::db_questions::QuestionItem;
use crate::tasks_core::{migrate_status, TaskStatus};

/// 迁出文件导出（保存对话框返回路径由用户授权；仅 .txt + 大小护栏）。
#[tauri::command]
pub fn export_write_todotxt_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() != Some("txt") {
        return Err("仅支持 .txt 文件（todo.txt 保底格式）".to_string());
    }
    if content.len() > 1_000_000 {
        return Err("导出内容超限（>1MB）".to_string());
    }
    std::fs::write(p, content).map_err(|e| format!("写入失败: {}", e))
}

/// 手动回填（周回顾）：迁出事件手动标"已完成"入史（出口 G/决策 4——不回填正文）。
#[tauri::command]
pub fn export_manual_fill_done(
    state: State<'_, AppState>,
    text: String,
    note: Option<String>,
) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 1000 {
        return Err("回填文本为空或超长".to_string());
    }
    state
        .db
        .add_completion_event(
            EV_EXPORT_MANUAL_DONE,
            "export",
            None,
            None,
            text,
            note.as_deref(),
            None,
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 周回顾批决议项（每行：裁决动作 done=执行完成 / abandon=有意识放弃）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyDecision {
    pub row_id: i64,
    pub action: String,
    pub reason: Option<String>,
}

/// 批决议结果。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyResolveView {
    pub done: usize,
    pub abandoned: usize,
    pub failed: Vec<String>,
}

/// 周回顾批决议（单事务：正文 [x] 化 + 完成史逐条 + task_index 重建原子提交；
/// 任一步失败整体回滚——不留半态裁决）。
#[tauri::command]
pub fn batch_weekly_resolve(
    state: State<'_, AppState>,
    decisions: Vec<WeeklyDecision>,
) -> Result<WeeklyResolveView, String> {
    if decisions.len() > 200 {
        return Err("单次批决议上限 200 条".to_string());
    }
    weekly_resolve_core(&state.db, &decisions).map_err(|e| e.to_string())
}

pub(crate) fn weekly_resolve_core(
    db: &Db,
    decisions: &[WeeklyDecision],
) -> Result<WeeklyResolveView, String> {
    // 预读：行 → (note_id, line_no, text, 是否 abandon) + 事件载荷
    let mut by_note: std::collections::HashMap<i64, Vec<(i64, String)>> = Default::default();
    let mut view = WeeklyResolveView { done: 0, abandoned: 0, failed: Vec::new() };
    let mut events: Vec<(String, Option<String>, i64)> = Vec::new(); // (text, reason, note_id)
    let mut items: Vec<(i64, i64, String)> = Vec::new(); // (note_id, line_no, action)
    for d in decisions {
        let row = match db.get_task_row(d.row_id) {
            Ok(Some(r)) => r,
            Ok(None) => {
                view.failed.push(format!("行 {} 不存在（已失效）", d.row_id));
                continue;
            }
            Err(e) => {
                view.failed.push(format!("行 {} 读取失败: {}", d.row_id, e));
                continue;
            }
        };
        let action = d.action.clone();
        if !matches!(action.as_str(), "done" | "abandon") {
            view.failed.push(format!("行 {} 非法动作 {}", row.id, action));
            continue;
        }
        items.push((row.note_id, row.line_no, action.clone()));
        by_note.entry(row.note_id).or_default().push((row.line_no, row.task_text.clone()));
        if action == "abandon" {
            events.push((row.task_text.clone(), d.reason.clone(), row.note_id));
        } else {
            events.push((row.task_text.clone(), None, row.note_id));
        }
        if action == "abandon" {
            view.abandoned += 1;
        } else {
            view.done += 1;
        }
    }
    if items.is_empty() {
        return Ok(view);
    }
    // 每笔记单次读正文 + 行变换（字符级迁移）——事务外只读
    let mut contents: std::collections::HashMap<i64, (String, String)> = Default::default(); // note_id -> (title, content)
    for (note_id, lines) in &by_note {
        let note = db
            .get_note(*note_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("笔记 {} 不存在", note_id))?;
        let mut body_lines: Vec<String> = note.content.split('\n').map(|s| s.to_string()).collect();
        for (line_no, _) in lines {
            if let Some(line) = body_lines.get_mut(*line_no as usize) {
                if let Some(next) = migrate_status(line, TaskStatus::Done) {
                    *line = next;
                }
            }
        }
        contents.insert(*note_id, (note.title.clone(), body_lines.join("\n")));
    }
    // 单事务提交：正文/索引/完成史原子
    let now = crate::db::unix_seconds();
    let tx: crate::error::Result<()> = db.with_conn(|conn| {
        conn.execute("BEGIN TRANSACTION", [])?;
        let result = (|| -> rusqlite::Result<()> {
            {
                let mut stmt = conn.prepare("UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3")?;
                for (note_id, (_title, content)) in &contents {
                    stmt.execute(params![content, now, note_id])?;
                    crate::db_task_index::rebuild_note_tasks(conn, *note_id, content);
                }
            }
            {
                let mut stmt = conn.prepare(
                    "INSERT INTO completion_history (ts, event_type, source_type, source_id, note_id, text, note)
                     VALUES (?1, ?2, 'task_line', NULL, ?3, ?4, ?5)",
                )?;
                for (text, reason, note_id) in &events {
                    let event_type = if reason.is_some() { "abandoned" } else { "done" };
                    stmt.execute(params![now, event_type, note_id, text, reason])?;
                }
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                conn.execute("COMMIT", [])?;
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                return Err(e.into());
            }
        }
        Ok(())
    });
    tx.map_err(|e| e.to_string())?;
    Ok(view)
}

/// 练习条目命令（REQ-299）——建/列/打点/状态。
#[tauri::command]
pub fn practice_create(
    state: State<'_, AppState>,
    text: String,
    frequency: Option<String>,
    goal: Option<String>,
) -> Result<i64, String> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 300 {
        return Err("练习文本为空或超长（≤300 字）".to_string());
    }
    state
        .db
        .create_practice_item(text, frequency.as_deref().unwrap_or("manual"), goal.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn practice_list(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<PracticeItem>, String> {
    state
        .db
        .list_practice_items(status.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn practice_tick(
    state: State<'_, AppState>,
    item_id: i64,
    mastery: Option<i64>,
) -> Result<(), String> {
    if let Some(m) = mastery {
        if !(1..=5).contains(&m) {
            return Err("熟练度自评须在 1-5".to_string());
        }
    }
    let ok = state.db.practice_tick(item_id, mastery).map_err(|e| e.to_string())?;
    if !ok {
        return Err("练习条目不存在".to_string());
    }
    Ok(())
}

/// 问题清单命令（REQ-300）——建/列/已答/归档。
#[tauri::command]
pub fn question_create(
    state: State<'_, AppState>,
    text: String,
    note_id: Option<i64>,
    context: Option<String>,
) -> Result<i64, String> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 1000 {
        return Err("问题文本为空或超长".to_string());
    }
    state
        .db
        .create_question(text, note_id, context.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn question_list(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<QuestionItem>, String> {
    state.db.list_questions(status.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn question_answer(
    state: State<'_, AppState>,
    id: i64,
    answer_ref: Option<String>,
) -> Result<(), String> {
    let ok = state.db.answer_question(id, answer_ref.as_deref()).map_err(|e| e.to_string())?;
    if !ok {
        return Err("问题不存在".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn question_set_status(state: State<'_, AppState>, id: i64, status: String) -> Result<(), String> {
    let ok = state.db.set_question_status(id, &status).map_err(|e| e.to_string())?;
    if !ok {
        return Err("问题不存在".to_string());
    }
    Ok(())
}

#[cfg(test)]
#[path = "commands_after_tests.rs"]
mod tests;
