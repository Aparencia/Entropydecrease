//! 笔记组 commands（v0.11.0 REQ-195~198 系统层）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              路由决策在 group_route.rs（纯函数），组化编排在 note_group_assign.rs。
//! @ai-context: REQ-198 可见可改——override_group_route 落"修改即记忆"标记，
//!              改判样本（route_reason）留痕供后续阈值校准。

use tauri::State;

use crate::commands::{normalize_title, AppState};
use crate::types::{NewNoteGroup, Note, NoteGroup};
use crate::video_profile_domain::DomainKind;

/// 组类别白名单（非法值拒绝——前端枚举同口径）。
const GROUP_KINDS: [&str; 3] = ["course", "topic", "standalone"];

/// 组类别校验（白名单前置，防任意字符串入库）。
fn require_kind(kind: &str) -> Result<(), String> {
    if GROUP_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(format!("不支持的组类别: {}（支持: {}）", kind, GROUP_KINDS.join("/")))
    }
}

/// 领域标签校验（kebab-case 白名单；空 → None）。
fn parse_domain(domain_tag: Option<String>) -> Result<Option<String>, String> {
    match domain_tag {
        Some(t) if !t.trim().is_empty() => DomainKind::parse(t.trim())
            .map(|k| Some(k.as_str().to_string()))
            .ok_or_else(|| format!("不支持的领域标签: {}", t)),
        _ => Ok(None),
    }
}

/// 列出笔记组（含组内笔记数；terrain 可选过滤 container/feed）。
#[tauri::command]
pub fn list_note_groups(
    state: State<'_, AppState>,
    terrain: Option<String>,
) -> Result<Vec<NoteGroup>, String> {
    let terrain = terrain.as_deref().filter(|t| !t.trim().is_empty());
    if let Some(t) = terrain {
        if t != "container" && t != "feed" {
            return Err(format!("不支持的地形: {}（支持: container/feed）", t));
        }
    }
    state.db.list_groups(terrain).map_err(|e| e.to_string())
}

/// 单个组详情（不存在 → 错误；前端按 id 刷新用）。
#[tauri::command]
pub fn get_note_group(state: State<'_, AppState>, id: i64) -> Result<NoteGroup, String> {
    if id <= 0 {
        return Err("无效的组 id".to_string());
    }
    state
        .db
        .get_group(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("笔记组不存在: {}", id))
}

/// 组内笔记列表（组详情面板数据源）。
#[tauri::command]
pub fn list_group_notes(state: State<'_, AppState>, group_id: i64) -> Result<Vec<Note>, String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    state.db.list_notes_by_group(group_id).map_err(|e| e.to_string())
}

/// 用户自建主题组（manual——契约一：粒度对齐领域，领域标签必填）。
#[tauri::command]
pub fn create_topic_group(
    state: State<'_, AppState>,
    name: String,
    domain_tag: String,
    terrain: Option<String>,
) -> Result<NoteGroup, String> {
    let name = normalize_title(name, "未命名组");
    let domain = parse_domain(Some(domain_tag))?
        .ok_or_else(|| "主题组必须指定领域标签".to_string())?;
    let terrain = terrain.unwrap_or_else(|| "container".to_string());
    if terrain != "container" && terrain != "feed" {
        return Err(format!("不支持的地形: {}", terrain));
    }
    // 同领域同地形已有主题组 → 直接复用（契约一防重复抽屉）
    if let Some(existing) = state.db.find_topic_group(&domain, &terrain).map_err(|e| e.to_string())? {
        return Ok(existing);
    }
    let label = DomainKind::parse(&domain).map(|k| k.label()).unwrap_or("主题组");
    state
        .db
        .create_group(&NewNoteGroup {
            name: if name == "未命名组" { label.to_string() } else { name },
            terrain,
            kind: "topic".to_string(),
            domain_tag: Some(domain),
            source: "manual".to_string(),
            series_key: None,
            route_reason: None,
        })
        .map_err(|e| e.to_string())
}

/// 重命名组。
#[tauri::command]
pub fn rename_note_group(
    state: State<'_, AppState>,
    id: i64,
    name: String,
) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的组 id".to_string());
    }
    let name = normalize_title(name, "未命名组");
    state.db.rename_group(id, &name).map_err(|e| e.to_string())
}

/// 路由改判（REQ-198 修改即记忆）：改组类别/领域，留痕 route_reason。
#[tauri::command]
pub fn override_group_route(
    state: State<'_, AppState>,
    id: i64,
    kind: String,
    domain_tag: Option<String>,
) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的组 id".to_string());
    }
    require_kind(&kind)?;
    let domain = parse_domain(domain_tag)?;
    // 主题组改判必须带领域（契约一：主题组粒度对齐领域）
    if kind == "topic" && domain.is_none() {
        return Err("改判为主题组必须指定领域标签".to_string());
    }
    let reason = format!(
        "用户改判：{}{}",
        kind,
        domain.as_deref().map(|d| format!("（{}）", d)).unwrap_or_default()
    );
    state
        .db
        .override_group_route(id, &kind, domain.as_deref(), &reason)
        .map_err(|e| e.to_string())
}

/// 移动笔记到组（group_id=None 移出组——手动纠错路由误判的兜底路径）。
#[tauri::command]
pub fn move_note_to_group(
    state: State<'_, AppState>,
    note_id: i64,
    group_id: Option<i64>,
) -> Result<bool, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    if let Some(gid) = group_id {
        if gid <= 0 {
            return Err("无效的组 id".to_string());
        }
        if state.db.get_group(gid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("笔记组不存在: {}", gid));
        }
    }
    state.db.update_note_group(note_id, group_id).map_err(|e| e.to_string())
}
