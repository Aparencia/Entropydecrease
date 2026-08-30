//! 知识体系画布命令层（v0.13.8 系统层；4 命令）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；编排逻辑
//!              `fn xxx_inner(db, ...)` 为纯函数（:memory: 可测），薄 `#[tauri::command]`
//!              壳只取 state.db 调 inner。画布=手动画布非自动图（REQ-029 P3）——
//!              位置只由用户拖拽（update）/辐射布局初始化（batch）/「自动排列」（batch）写入。
//! @ai-context: 入参出参契约——id>0；坐标必须为有限值（拒绝 NaN/Infinity——
//!              JS 侧拖拽坐标可能混入数学异常，防损坏值入库）；zoom 必须 >0 且 ≤10
//!              （防御性上界，防错误缩放值把画布缩到不可见）。
//! @ai-context: 设计规格 §4.6 列 3 条命令；规格同时要求"切回画布视口恢复"，
//!              恢复需要读路径——补 `get_canvas_viewport`（第 4 条）补齐读写闭环，
//!              已在版本文档 v0.13.8 交付记录登记（规格增补，非契约变更）。

use tauri::State;

use crate::commands::AppState;
use crate::commands_knowledge::require_id;
use crate::db::Db;
use crate::types::{CanvasNodePosition, CanvasPrefs, CanvasViewport};

/// 连线样式白名单（v0.14.1；前端枚举同口径——未知值拒绝，防字符串入库）。
const EDGE_STYLES: [&str; 4] = ["straight", "bezier", "smoothstep", "step"];

/// 布局算法白名单（v0.14.1；前端枚举同口径）。
const LAYOUT_ALGORITHMS: [&str; 6] = ["radial", "mindmap", "treeRight", "org", "fishbone", "dualRing"];

/// 保存节点画布位置（拖拽落点；防抖后调用；幂等覆盖）。
///
/// @ai-context: 不触发列表刷新（位置不入树视图）；不存在或跨体系由存在性校验兜底。
#[tauri::command]
pub fn update_node_canvas_position(
    state: State<'_, AppState>,
    node_id: i64,
    canvas_x: f64,
    canvas_y: f64,
) -> Result<bool, String> {
    update_node_canvas_position_inner(&state.db, node_id, canvas_x, canvas_y)
}

/// 批量写入节点画布位置（辐射布局首批初始化 / 「自动排列」覆盖）。
///
/// @ai-context: 全量校验通过才落库（单事务）；同一 nodeId 重复出现时后端拒绝
///              （前端不会构造重复项，重复即契约异常——防幂等遗漏导致歧义）。
#[tauri::command]
pub fn batch_initialize_canvas_positions(
    state: State<'_, AppState>,
    system_id: i64,
    positions: Vec<CanvasNodePosition>,
) -> Result<bool, String> {
    batch_initialize_canvas_positions_inner(&state.db, system_id, positions)
}

/// 保存体系画布视口（切换/缩放结束时防抖调用；upsert）。
#[tauri::command]
pub fn save_canvas_viewport(
    state: State<'_, AppState>,
    system_id: i64,
    viewport_x: f64,
    viewport_y: f64,
    zoom: f64,
) -> Result<bool, String> {
    save_canvas_viewport_inner(&state.db, system_id, viewport_x, viewport_y, zoom)
}

/// 读取体系画布视口（从未保存返回 None——前端按内容 fitView 兜底）。
///
/// @ai-context: 设计规格 §4.5「切回画布视口恢复」的读路径（读写闭环）。
#[tauri::command]
pub fn get_canvas_viewport(
    state: State<'_, AppState>,
    system_id: i64,
) -> Result<Option<CanvasViewport>, String> {
    get_canvas_viewport_inner(&state.db, system_id)
}

/// 校验坐标有限值（拒绝 NaN/Infinity——浮点拖拽坐标的异常防护）。
fn require_coord(v: f64, label: &str) -> Result<(), String> {
    if v.is_finite() {
        Ok(())
    } else {
        Err(format!("{}无效（必须为有限数值）", label))
    }
}

/// 保存单个节点位置（节点存在性校验 + 坐标校验）。
pub(crate) fn update_node_canvas_position_inner(
    db: &Db,
    node_id: i64,
    canvas_x: f64,
    canvas_y: f64,
) -> Result<bool, String> {
    require_id(node_id)?;
    require_coord(canvas_x, "画布 X 坐标")?;
    require_coord(canvas_y, "画布 Y 坐标")?;
    if db.get_knowledge_node(node_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("节点不存在: {}", node_id));
    }
    db.update_node_canvas_position(node_id, canvas_x, canvas_y).map_err(|e| e.to_string())
}

/// 批量写入节点位置（体系存在 + 每节点存在且属该体系；事务原子）。
pub(crate) fn batch_initialize_canvas_positions_inner(
    db: &Db,
    system_id: i64,
    positions: Vec<CanvasNodePosition>,
) -> Result<bool, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    if positions.is_empty() {
        return Err("位置列表不能为空".to_string());
    }
    // 全量预校验（任何一项失败整体拒绝——事务前校验，无部分写入）
    let mut seen: Vec<i64> = Vec::new();
    for p in &positions {
        require_id(p.node_id)?;
        require_coord(p.x, "X 坐标")?;
        require_coord(p.y, "Y 坐标")?;
        if seen.contains(&p.node_id) {
            return Err(format!("节点位置重复: {}", p.node_id));
        }
        seen.push(p.node_id);
        let node = db.get_knowledge_node(p.node_id).map_err(|e| e.to_string())?;
        match node {
            Some(n) => {
                if n.system_id != system_id {
                    return Err(format!("节点 {} 不属于该体系", p.node_id));
                }
            }
            None => return Err(format!("节点不存在: {}", p.node_id)),
        }
    }
    let tuples: Vec<(i64, f64, f64)> = positions.into_iter().map(|p| (p.node_id, p.x, p.y)).collect();
    db.set_node_canvas_positions(&tuples).map_err(|e| e.to_string())
}

/// 保存视口（坐标/缩放校验后 upsert）。
pub(crate) fn save_canvas_viewport_inner(
    db: &Db,
    system_id: i64,
    viewport_x: f64,
    viewport_y: f64,
    zoom: f64,
) -> Result<bool, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    require_coord(viewport_x, "视口 X")?;
    require_coord(viewport_y, "视口 Y")?;
    if !(zoom.is_finite() && zoom > 0.0 && zoom <= 10.0) {
        return Err(format!("缩放无效: {}（必须为 (0, 10] 的有限数值）", zoom));
    }
    db.save_canvas_viewport(system_id, viewport_x, viewport_y, zoom).map_err(|e| e.to_string())
}

/// 读取视口（体系存在性校验；无记录返回 None）。
pub(crate) fn get_canvas_viewport_inner(
    db: &Db,
    system_id: i64,
) -> Result<Option<CanvasViewport>, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    db.get_canvas_viewport(system_id)
        .map(|v| v.map(|(x, y, z)| CanvasViewport { viewport_x: x, viewport_y: y, zoom: z }))
        .map_err(|e| e.to_string())
}

/// 读取体系画布偏好（v0.14.1；从未保存 → None——前端回落默认值）。
#[tauri::command]
pub fn get_canvas_prefs(state: State<'_, AppState>, system_id: i64) -> Result<Option<CanvasPrefs>, String> {
    get_canvas_prefs_inner(&state.db, system_id)
}

/// 保存体系画布偏好（upsert；枚举白名单校验）。
#[tauri::command]
pub fn save_canvas_prefs(
    state: State<'_, AppState>,
    system_id: i64,
    edge_style: String,
    edge_arrows: bool,
    layout_algorithm: String,
) -> Result<bool, String> {
    save_canvas_prefs_inner(&state.db, system_id, &edge_style, edge_arrows, &layout_algorithm)
}

pub(crate) fn get_canvas_prefs_inner(db: &Db, system_id: i64) -> Result<Option<CanvasPrefs>, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    db.get_canvas_prefs(system_id).map_err(|e| e.to_string())
}

pub(crate) fn save_canvas_prefs_inner(
    db: &Db,
    system_id: i64,
    edge_style: &str,
    edge_arrows: bool,
    layout_algorithm: &str,
) -> Result<bool, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    if !EDGE_STYLES.contains(&edge_style) {
        return Err(format!(
            "不支持的连线样式: {}（支持: {}）",
            edge_style,
            EDGE_STYLES.join("/")
        ));
    }
    if !LAYOUT_ALGORITHMS.contains(&layout_algorithm) {
        return Err(format!(
            "不支持的布局算法: {}（支持: {}）",
            layout_algorithm,
            LAYOUT_ALGORITHMS.join("/")
        ));
    }
    db.save_canvas_prefs(system_id, edge_style, edge_arrows, layout_algorithm)
        .map_err(|e| e.to_string())
}

/// 命令层单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_knowledge_canvas_tests.rs"]
mod tests;
