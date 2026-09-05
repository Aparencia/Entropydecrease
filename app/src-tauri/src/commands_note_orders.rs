//! 笔记手动排序命令（REQ-287，v0.19.7）。
//!
//! @ai-context: 命令薄壳——scope 校验（防注入/越界：仅 `g:{数字}`/`none`）、
//!              量级守卫（≤2000/scope）、保存=整表覆写快照（事务单命令）；
//!              变更广播 notes 域（列表刷新即时可见）。DB 读写见 db_note_orders.rs。
//! @ai-context: 排序语义互斥：scope 有手动序=该区手排；清空=回自动。前端树
//!              视图默认消费，搜索/标签/非默认排序平铺态不应用（交互矩阵锁定）。

use tauri::State;

use crate::commands::AppState;
use crate::db_note_orders::is_valid_scope;

/// 单 scope 手动序量级上限（防御 IPC/DB 滥用）。
const SCOPE_IDS_MAX: usize = 2000;

fn validate(scope: &str) -> Result<(), String> {
    if !is_valid_scope(scope) {
        return Err("非法的排序范围（应为 g:{组id} 或 none）".to_string());
    }
    Ok(())
}

/// 全量手动序（scope 升序；量小直接返回）。
#[tauri::command]
pub fn note_order_list(state: State<'_, AppState>) -> Result<Vec<(String, i64, i64)>, String> {
    state.db.load_note_orders().map_err(|e| e.to_string())
}

/// 保存某 scope 完整手动序（整表覆写快照；首启=前端写当前可见序）。
#[tauri::command]
pub fn note_order_save(state: State<'_, AppState>, scope: String, note_ids: Vec<i64>) -> Result<(), String> {
    validate(&scope)?;
    if note_ids.len() > SCOPE_IDS_MAX {
        return Err(format!("笔记数超上限（{} > {}）", note_ids.len(), SCOPE_IDS_MAX));
    }
    let mut seen = std::collections::HashSet::new();
    if !note_ids.iter().all(|id| *id > 0 && seen.insert(*id)) {
        return Err("笔记 id 非法或重复".to_string());
    }
    state.db.save_note_order(&scope, &note_ids).map_err(|e| e.to_string())?;
    // REQ-278：notes 域广播（排序变化 → 列表刷新）
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    Ok(())
}

/// 清除某 scope 手动序（=回自动排序；幂等）。
#[tauri::command]
pub fn note_order_clear(state: State<'_, AppState>, scope: String) -> Result<(), String> {
    validate(&scope)?;
    let cleared = state.db.clear_note_order(&scope).map_err(|e| e.to_string())?;
    if cleared {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn validate_accepts_only_scoped_values() {
        assert!(validate("g:1").is_ok());
        assert!(validate("none").is_ok());
        assert!(validate("g:1; DROP TABLE notes").is_err());
        assert!(validate("").is_err());
    }
}
