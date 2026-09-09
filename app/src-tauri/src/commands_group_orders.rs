//! 组排序/置顶命令（REQ-315，v0.20.11 批 6）。
//!
//! @ai-context: 命令薄壳——kind 白名单（防任意分区字符串）/量级守卫/归属校验
//!              （防陈旧序污染分区，note_orders 同款三防）；保存=分区快照覆写
//!              （空 ids=分区回自动）；变更广播 NoteGroups 域（组列表即时可见）。
//!              DB 读写见 db_note_group_orders.rs；渲染排序=前端纯函数（组侧栏/
//!              树组头/过滤平铺共用，utils/groupOrder.ts），本层不做排序。

use tauri::State;

use crate::commands::AppState;
use crate::db_note_group_orders::is_valid_group_order_kind;

/// 单分区手动序量级上限（防御 IPC/DB 滥用；组数远小于笔记数，上限对齐 note_orders）。
const GROUP_IDS_MAX: usize = 2000;

fn validate_kind(kind: &str) -> Result<(), String> {
    if is_valid_group_order_kind(kind) {
        Ok(())
    } else {
        Err(format!("非法的手动排序分区: {}（支持: course/topic/standalone/feed）", kind))
    }
}

/// 组置顶/取消置顶（pin=1/0——数据字段沿 notes.pin，措辞统一为「置顶」）。
#[tauri::command]
pub fn update_note_group_pin(
    state: State<'_, AppState>,
    id: i64,
    pin: i64,
) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的组 id".to_string());
    }
    if pin != 0 && pin != 1 {
        return Err("置顶参数只能为 0（取消）或 1（置顶）".to_string());
    }
    let ok = state
        .db
        .update_note_group_pin(id, pin)
        .map_err(|e| e.to_string())?;
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::NoteGroups);
    }
    Ok(ok)
}

/// 全量组手动序（(group_id, seq)；量小整拉——前端按分区过滤消费）。
#[tauri::command]
pub fn note_group_order_list(state: State<'_, AppState>) -> Result<Vec<(i64, i64)>, String> {
    state.db.load_group_orders().map_err(|e| e.to_string())
}

/// 保存某 kind 分区完整手动序（分区快照先删后插单事务；空 group_ids=分区回自动）。
#[tauri::command]
pub fn note_group_order_save(
    state: State<'_, AppState>,
    kind: String,
    group_ids: Vec<i64>,
) -> Result<(), String> {
    validate_kind(&kind)?;
    if group_ids.len() > GROUP_IDS_MAX {
        return Err(format!("组数超上限（{} > {}）", group_ids.len(), GROUP_IDS_MAX));
    }
    let mut seen = std::collections::HashSet::new();
    if !group_ids.iter().all(|id| *id > 0 && seen.insert(*id)) {
        return Err("组 id 非法或重复".to_string());
    }
    // 归属校验：全部 id 必须当前属于该 kind 且未置顶（陈旧/置顶序整体拒绝——
    // 置顶组由 pin 列置顶区表达，不占手动序位）
    let ok = state
        .db
        .verify_group_order_membership(&kind, &group_ids)
        .map_err(|e| e.to_string())?;
    if !ok {
        return Err("部分组不属于该分区或已置顶——请刷新后再排序".to_string());
    }
    state
        .db
        .save_group_order(&kind, &group_ids)
        .map_err(|e| e.to_string())?;
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::NoteGroups);
    Ok(())
}

/// 清除单组手动位（=该组回自动区；幂等——无行零动作不广播）。
#[tauri::command]
pub fn note_group_order_clear(state: State<'_, AppState>, group_id: i64) -> Result<(), String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    let cleared = state
        .db
        .clear_group_order(group_id)
        .map_err(|e| e.to_string())?;
    if cleared {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::NoteGroups);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_kind;

    #[test]
    fn kind_whitelist_enforced() {
        assert!(validate_kind("course").is_ok());
        assert!(validate_kind("topic").is_ok());
        assert!(validate_kind("standalone").is_ok());
        assert!(validate_kind("feed").is_ok());
        assert!(validate_kind("").is_err());
        assert!(validate_kind("note; DROP TABLE note_groups").is_err());
        assert!(validate_kind("Course").is_err());
    }
}
