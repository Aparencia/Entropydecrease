//! 标签颜色命令（v0.14 B 视觉系统）。
//!
//! @ai-context: 四级颜色体系中的「标签级」——薄壳命令层，SQL 全部下沉
//!              db_colors.rs（可内存库单测）；组级颜色命令（update_group_color）
//!              挂在 commands_groups.rs——组命令内聚，本文件只管标签色。

use tauri::State;

use crate::db_colors::TagColor;
use crate::AppState;

/// 全部标签颜色（空表返回空数组，非错误）。
#[tauri::command]
pub fn list_tag_colors(state: State<'_, AppState>) -> Result<Vec<TagColor>, String> {
    state.db.list_tag_colors().map_err(|e| e.to_string())
}

/// 设置标签颜色（upsert：已存在覆盖；tag/color 空白拒绝）。
#[tauri::command]
pub fn set_tag_color(
    state: State<'_, AppState>,
    tag: String,
    color: String,
) -> Result<(), String> {
    let tag = tag.trim();
    let color = color.trim();
    if tag.is_empty() {
        return Err("标签名不能为空".to_string());
    }
    if color.is_empty() {
        return Err("颜色不能为空".to_string());
    }
    state
        .db
        .set_tag_color(tag, color)
        .map_err(|e| e.to_string())
}

/// 重置标签颜色（删除条目；不存在时静默成功——幂等）。
#[tauri::command]
pub fn reset_tag_color(state: State<'_, AppState>, tag: String) -> Result<(), String> {
    state
        .db
        .reset_tag_color(tag.trim())
        .map_err(|e| e.to_string())
}
