//! 知识体系/问题树命令层（v0.13.1 REQ-202~205 系统层；commands 1-8）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；编排逻辑
//!              `fn xxx_inner(db, ...)` 为纯函数（:memory: 可测），薄 `#[tauri::command]`
//!              壳只取 state.db 调 inner。体系是问题的容器——global 全库唯一、
//!              core_question 必填；问题树节点挂体系、parent 自引用成同级树。
//! @ai-context: 线宽豁免登记：源 commands_knowledge.rs（18 命令超 300 行）按规格 §四
//!              拆分；本文件承载体系/问题树（commands 1-8），≤300 行。
//! @ai-context: 入参出参契约——所有 id>0；kind/type/status 白名单；name/text 归一化
//!              ≤2000；错误信息中文 + 业务语义（沿用 commands_groups 口径）。

use tauri::State;

use crate::commands::AppState;
use crate::commands_knowledge::{normalize_text, require_id, require_kind, require_node_type, require_status};
use crate::db::Db;
use crate::types::{KnowledgeNode, KnowledgeSystem, NewKnowledgeNode, NewKnowledgeSystem};

/// 列出全部知识体系（含节点/概念/模型计数；camelCase 序列化）。
///
/// @ai-context: 直供前端体系树/领域列表——计数由 list 查询子查询填充（随子表实时变化，
///              不冗余存储）；只读无副作用，无入参无需校验。
#[tauri::command]
pub fn list_knowledge_systems(state: State<'_, AppState>) -> Result<Vec<KnowledgeSystem>, String> {
    list_knowledge_systems_inner(&state.db)
}

/// 新建知识体系（global 唯一校验；domain 可选挂 global）。
///
/// @ai-context: kind=global 时 core_question 必填且不能挂父体系（全局体系是唯一核心问题域，
///              有父会稀释"唯一"语义）；kind=domain 时父可选但若给则必须存在且 kind=global
///              （领域体系挂全局，验收路径"领域体系挂全局"）。global 唯一先预查给友好错误，
///              DB 唯一索引兜底并发插入。
/// @ai-context: 边界——名称归一化后落库；core_question 仅 trim 非空（非名称，不做空白折叠）。
#[tauri::command]
pub fn create_knowledge_system(
    state: State<'_, AppState>,
    name: String,
    kind: String,
    parent_system_id: Option<i64>,
    core_question: Option<String>,
) -> Result<KnowledgeSystem, String> {
    create_knowledge_system_inner(&state.db, name, kind, parent_system_id, core_question)
}

/// 更新知识体系可选字段，返回更新后实体（name 归一化；status 白名单）。
///
/// @ai-context: core_question 经本命令只能"设置"（None=不改，Some 非空=置值）——前端
///              无法借此清空至 NULL（字段可空，清空语义未在签名内暴露，登记为限制）。
#[tauri::command]
pub fn update_knowledge_system(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    core_question: Option<String>,
    status: Option<String>,
) -> Result<KnowledgeSystem, String> {
    update_knowledge_system_inner(&state.db, id, name, core_question, status)
}

/// 幂等归档体系（status=archived；已归档再归档仍返回 true）。
///
/// @ai-context: 归档是软删除——体系仍保留（节点/概念/模型/引用不级联清空），
///              仅状态标记；无副作用于子表。
#[tauri::command]
pub fn archive_knowledge_system(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    archive_knowledge_system_inner(&state.db, id)
}

/// 在体系下新建问题树节点（parent 校验同体系）。
///
/// @ai-context: 系统类型不限——问题树在领域体系与全局体系都允许（全局承接领域入口/场景，
///              验收步骤 1/2）；parent_id 若给必须存在且同体系（跨体系报"父节点不属于该体系"）。
#[tauri::command]
pub fn add_knowledge_node(
    state: State<'_, AppState>,
    system_id: i64,
    parent_id: Option<i64>,
    node_type: String,
    text: String,
) -> Result<KnowledgeNode, String> {
    add_knowledge_node_inner(&state.db, system_id, parent_id, node_type, text)
}

/// 更新节点可选字段（text 归一化；status 白名单），返回更新后实体。
///
/// @ai-context: order_idx 为同级排序（前端拖拽序），0 合法、不设下限——负值由调用方
///              保证不出现（前端排序从 0 递增），本命令只透传。
#[tauri::command]
pub fn update_knowledge_node(
    state: State<'_, AppState>,
    id: i64,
    text: Option<String>,
    order_idx: Option<i64>,
    status: Option<String>,
) -> Result<KnowledgeNode, String> {
    update_knowledge_node_inner(&state.db, id, text, order_idx, status)
}

/// 删除节点（级联删子树——外键已处理，command 只校验存在性）。
///
/// @ai-context: 子树经 knowledge_nodes.parent ON DELETE CASCADE 自动级联清空，
///              引用该节点的 knowledge_links.node_id 自动 SET NULL（DB 兜底）；
///              command 层只校验存在性——防误删由前端二次确认（规格 §四）。
#[tauri::command]
pub fn delete_knowledge_node(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    delete_knowledge_node_inner(&state.db, id)
}

/// 列出体系内全部节点（扁平全树，前端组树；按 order_idx, id 排序）。
///
/// @ai-context: 只读无副作用；返回层级扁平结构——前端依 parent_id 组装树并展开/折叠。
#[tauri::command]
pub fn list_knowledge_nodes(state: State<'_, AppState>, system_id: i64) -> Result<Vec<KnowledgeNode>, String> {
    list_knowledge_nodes_inner(&state.db, system_id)
}

/// 列出全部体系（含计数）。
pub(crate) fn list_knowledge_systems_inner(db: &Db) -> Result<Vec<KnowledgeSystem>, String> {
    db.list_knowledge_systems().map_err(|e| e.to_string())
}

/// 新建体系（校验 + 全球唯一预查 + 错误映射）。
pub(crate) fn create_knowledge_system_inner(
    db: &Db,
    name: String,
    kind: String,
    parent_system_id: Option<i64>,
    core_question: Option<String>,
) -> Result<KnowledgeSystem, String> {
    require_kind(&kind)?;
    let name = normalize_text(&name, "体系名称")?;
    let core_question_norm = core_question.as_deref().map(str::trim).filter(|q| !q.is_empty()).map(str::to_string);
    if kind == "global" {
        if parent_system_id.is_some() {
            return Err("全局体系不能挂父体系".to_string());
        }
        if core_question_norm.is_none() {
            return Err("全局体系必须填写核心问题".to_string());
        }
        // 全球唯一预查（友好错误）；DB 唯一索引兜底并发插入
        if db.find_global_system().map_err(|e| e.to_string())?.is_some() {
            return Err("已存在全局体系".to_string());
        }
    } else if let Some(pid) = parent_system_id {
        require_id(pid)?;
        let parent = db.get_knowledge_system(pid).map_err(|e| e.to_string())?;
        match parent {
            Some(p) => {
                if p.kind != "global" {
                    return Err("领域体系只能挂全局体系".to_string());
                }
            }
            // parent 若给但不存在——业务错误（"领域体系挂全局"验收路径）
            None => return Err(format!("父体系不存在: {}", pid)),
        }
    }
    // 唯一索引兜底：预查通过但并发插入被拒时转友好错误
    db.create_knowledge_system(&NewKnowledgeSystem {
        name,
        kind: kind.clone(),
        parent_system_id,
        core_question: core_question_norm,
    })
    .map_err(|e| {
        let msg = e.to_string();
        if kind == "global" && msg.contains("UNIQUE") {
            "全局体系唯一，请编辑现有体系".to_string()
        } else {
            msg
        }
    })
}

/// 更新体系（返回更新后实体；不存在报错）。
pub(crate) fn update_knowledge_system_inner(
    db: &Db,
    id: i64,
    name: Option<String>,
    core_question: Option<String>,
    status: Option<String>,
) -> Result<KnowledgeSystem, String> {
    require_id(id)?;
    if db.get_knowledge_system(id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", id));
    }
    let name = name.as_deref().map(|n| normalize_text(n, "体系名称")).transpose()?;
    if let Some(st) = status.as_deref() {
        require_status("system", st)?;
    }
    if let Some(cq) = core_question.as_deref() {
        if cq.trim().is_empty() {
            return Err("核心问题不能为空".to_string());
        }
    }
    db.update_knowledge_system(
        id,
        name.as_deref(),
        core_question.as_deref().map(Some),
        status.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    db.get_knowledge_system(id).map_err(|e| e.to_string())?.ok_or_else(|| format!("体系不存在: {}", id))
}

/// 幂等归档体系（存在性校验后置 archived；已归档仍 true）。
pub(crate) fn archive_knowledge_system_inner(db: &Db, id: i64) -> Result<bool, String> {
    require_id(id)?;
    if db.get_knowledge_system(id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", id));
    }
    db.archive_knowledge_system(id).map_err(|e| e.to_string())
}

/// 新建节点（system_id 存在；parent 同体系校验）。
pub(crate) fn add_knowledge_node_inner(
    db: &Db,
    system_id: i64,
    parent_id: Option<i64>,
    node_type: String,
    text: String,
) -> Result<KnowledgeNode, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    require_node_type(&node_type)?;
    let text = normalize_text(&text, "节点内容")?;
    if let Some(pid) = parent_id {
        require_id(pid)?;
        let parent = db.get_knowledge_node(pid).map_err(|e| e.to_string())?;
        match parent {
            Some(p) => {
                if p.system_id != system_id {
                    return Err("父节点不属于该体系".to_string());
                }
            }
            None => return Err(format!("父节点不存在: {}", pid)),
        }
    }
    db.add_knowledge_node(&NewKnowledgeNode {
        system_id,
        parent_id,
        r#type: node_type,
        text,
        order_idx: 0,
    })
    .map_err(|e| e.to_string())
}

/// 更新节点（返回更新后实体；不存在报错）。
pub(crate) fn update_knowledge_node_inner(
    db: &Db,
    id: i64,
    text: Option<String>,
    order_idx: Option<i64>,
    status: Option<String>,
) -> Result<KnowledgeNode, String> {
    require_id(id)?;
    if db.get_knowledge_node(id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("节点不存在: {}", id));
    }
    let text = text.as_deref().map(|t| normalize_text(t, "节点内容")).transpose()?;
    if let Some(st) = status.as_deref() {
        require_status("node", st)?;
    }
    db.update_knowledge_node(id, text.as_deref(), order_idx, status.as_deref()).map_err(|e| e.to_string())?;
    db.get_knowledge_node(id).map_err(|e| e.to_string())?.ok_or_else(|| format!("节点不存在: {}", id))
}

/// 删除节点（存在性校验后删除；子树级联由 DB 处理）。
pub(crate) fn delete_knowledge_node_inner(db: &Db, id: i64) -> Result<bool, String> {
    require_id(id)?;
    if db.get_knowledge_node(id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("节点不存在: {}", id));
    }
    db.delete_knowledge_node(id).map_err(|e| e.to_string())
}

/// 列出体系内节点（扁平全树）。
pub(crate) fn list_knowledge_nodes_inner(db: &Db, system_id: i64) -> Result<Vec<KnowledgeNode>, String> {
    require_id(system_id)?;
    db.list_knowledge_nodes(system_id).map_err(|e| e.to_string())
}
