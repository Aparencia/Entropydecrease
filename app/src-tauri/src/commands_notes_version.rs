//! 笔记版本管理 commands（REQ-144 + REQ-143 成本展示，v0.8.0 M4）。
//!
//! @ai-context: 版本时间线数据源（list/diff/rollback）+ 成本记录展示；
//!              写路径统一走 versioned_save（转笔记首快照惰性/精修采纳/
//!              补充采纳/手动保存/回滚=新版本——见 db_notes_versions.rs）。
//! @ai-context: 段级 diff 复用 note_diff.rs（M2 预览内核——任意两版对比）；
//!              回滚不破坏历史链（新版本 parent=目标版本）。

use tauri::State;

use crate::commands::AppState;
use crate::db_ai_usage::AiUsageRecord;
use crate::db_notes_versions::NoteVersion;
use crate::note_diff::{diff_markdown, diff_sections, DiffOp, SectionDiff};
use crate::types::Note;

/// 版本列表（旧→新；含惰性首快照——旧数据迁移兼容）。
#[tauri::command]
pub fn note_versions_list(state: State<'_, AppState>, note_id: i64) -> Result<Vec<NoteVersion>, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state.db.list_versions(note_id).map_err(|e| e.to_string())
}

/// 任意两版段级 diff（版本对比视图数据源——note_diff 内核）。
#[tauri::command]
pub fn note_versions_diff(
    state: State<'_, AppState>,
    note_id: i64,
    v1_id: i64,
    v2_id: i64,
) -> Result<Vec<DiffOp>, String> {
    let v1 = get_version_for_note(&state, note_id, v1_id)?;
    let v2 = get_version_for_note(&state, note_id, v2_id)?;
    Ok(diff_markdown(&v1.content, &v2.content))
}

/// 回滚到目标版本（新版本 user_edit，parent=目标版本——历史链不破坏）。
#[tauri::command]
pub fn note_versions_rollback(
    state: State<'_, AppState>,
    note_id: i64,
    target_version_id: i64,
) -> Result<Note, String> {
    if note_id <= 0 || target_version_id <= 0 {
        return Err("无效的参数".to_string());
    }
    state
        .db
        .rollback_to(note_id, target_version_id)
        .map_err(|e| e.to_string())?;
    // REQ-278 审查补端：回滚 = 笔记内容变更（版本链新枝）→ 广播 notes 域
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    state
        .db
        .get_note(note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())
}

/// 笔记成本记录（版本时间线"费用"列数据源）。
#[tauri::command]
pub fn note_versions_usage(state: State<'_, AppState>, note_id: i64) -> Result<Vec<AiUsageRecord>, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state.db.list_ai_usage(note_id).map_err(|e| e.to_string())
}

/// 按会话 id 查关联笔记（取最新）。
#[tauri::command]
pub fn note_by_session(state: State<'_, AppState>, session_id: i64) -> Result<Option<Note>, String> {
    state.db.find_note_by_session(session_id).map_err(|e| e.to_string())
}

/// 任意两篇 markdown 的章节级分组 diff（VersionPanel 对比用）。
#[tauri::command]
pub fn diff_markdown_sections(old_md: String, new_md: String) -> Vec<SectionDiff> {
    diff_sections(&old_md, &new_md)
}

/// 读版本并校验归属（diff 输入防御）。
fn get_version_for_note(state: &AppState, note_id: i64, version_id: i64) -> Result<NoteVersion, String> {
    let v = state
        .db
        .get_version(version_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("版本不存在: {}", version_id))?;
    if v.note_id != note_id {
        return Err("版本与笔记不匹配".to_string());
    }
    Ok(v)
}
