//! 知识概念/模型/引用/审计命令层（v0.13.1 REQ-202~205 系统层；commands 9-18）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；编排逻辑
//!              `fn xxx_inner(db, ...)` 为纯函数（:memory: 可测），薄 `#[tauri::command]`
//!              壳只取 state.db 调 inner。概念 name 全库唯一（归一化后落库 + 查重）；
//!              模型 disciplines JSON 字符串（≥1 学科）；引用是体系↔外部内容唯一通道；
//!              audit_due_for_system 为 v0.13.4 审计前置读。
//! @ai-context: 线宽豁免登记（AGENTS.md §3 300-600 带）：源 commands_knowledge.rs（18 命令
//!              + 校验 + 测试）预估超 300 行，按规格 §四拆 commands_knowledge_systems.rs
//!              （体系/问题树）与本文件（概念/模型/引用/审计）；本文件承载 commands 9-18，
//!              实测 469 行，登记于 docs/standards/line-limit-exemptions.md（300-600 带，
//!              commands 薄壳 + inner 纯函数 + @ai-context 注释内聚于命令域）。
//! @ai-context: 入参出参契约——id>0；status 白名单；target_type 白名单；命名归一化；
//!              错误信息中文 + 业务语义（沿用 commands_groups 口径）。

use tauri::{AppHandle, Emitter, State};

use serde::Serialize;

use crate::commands::AppState;
use crate::commands_knowledge::{
    normalize_disciplines, normalize_text, parse_target_type, require_id, require_status,
};
use crate::db::Db;
use crate::knowledge_pure::AuditSignal;
use crate::types::{
    KnowledgeConcept, KnowledgeLink, KnowledgeModel, NewKnowledgeConcept, NewKnowledgeLink,
    NewKnowledgeModel,
};

/// 审计探测返回结构（v0.13.1 前置读；UI 依据 `due` 提示"该审计了"）。
///
/// @ai-context: `{due, signal}` 结构性返回——pure 函数 audit_due 只判定到期，
///              信号由调用方聚合；前端据 due 显示提示，signal 供调试/后续审计编排。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditDueResult {
    /// 是否到期（pure 函数 audit_due 判定）
    pub due: bool,
    /// 审计信号（毫秒口径；字段级 camelCase）
    pub signal: AuditSignal,
}

/// 可选文本字段 trim + 空串转 None（三问/命题可选字段，避免存空字符串/纯空白）。
fn opt_trim(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// 可选文本更新两层 Option：外层 None=不改，内层 None=清空为 NULL（贴合 db 层契约）。
fn opt_field(v: Option<String>) -> Option<Option<String>> {
    v.map(|s| opt_trim(Some(s)))
}

/// 在体系下新建概念（name 归一化后落库 + 查重）。
///
/// @ai-context: name UNIQUE 全局——重名冲突经 precheck 给友好错误（"概念已存在"），
///              UNIQUE 索引兜底并发插入；三问（本质/边界/联系）可选。
#[tauri::command]
pub fn add_knowledge_concept(
    state: State<'_, AppState>,
    system_id: i64,
    name: String,
    essence: Option<String>,
    boundary: Option<String>,
    relation: Option<String>,
) -> Result<KnowledgeConcept, String> {
    add_knowledge_concept_inner(&state.db, system_id, name, essence, boundary, relation)
}

/// 更新概念可选字段（name 归一化 + 查重；status 白名单），返回更新后实体。
///
/// @ai-context: essence/boundary/relation 可清空（Some 空串→置 NULL）；name 若改必须
///              归一化后不与既有概念重名（排除自身——改名不改名的自我比较）。
#[tauri::command]
pub fn update_knowledge_concept(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    essence: Option<String>,
    boundary: Option<String>,
    relation: Option<String>,
    status: Option<String>,
) -> Result<KnowledgeConcept, String> {
    update_knowledge_concept_inner(&state.db, id, name, essence, boundary, relation, status)
}

/// 列出概念（体系/状态过滤可选）。
///
/// @ai-context: 只读；体系过滤可选（None=全库概念——交叉点判定数据源），状态过滤可选。
#[tauri::command]
pub fn list_knowledge_concepts(
    state: State<'_, AppState>,
    system_id: Option<i64>,
    status: Option<String>,
) -> Result<Vec<KnowledgeConcept>, String> {
    list_knowledge_concepts_inner(&state.db, system_id, status)
}

/// 在体系下新建模型（disciplines 前 JSON 数组字符串→校验 ≥1 非空→序列化落库）。
///
/// @ai-context: disciplines 经 normalize_disciplines 解析校验并紧凑序列化（存储态规范），
///              命题三要素 claim/valid_when/invalid_when 可选；cross_checks v0.13.1 预埋置空。
#[tauri::command]
pub fn add_knowledge_model(
    state: State<'_, AppState>,
    system_id: i64,
    name: String,
    disciplines: String,
    claim: Option<String>,
    valid_when: Option<String>,
    invalid_when: Option<String>,
) -> Result<KnowledgeModel, String> {
    add_knowledge_model_inner(&state.db, system_id, name, disciplines, claim, valid_when, invalid_when)
}

/// 更新模型可选字段（disciplines 同 add 校验），返回更新后实体。
///
/// @ai-context: claim/valid_when/invalid_when 可清空；cross_checks 不在本命令改
///              （v0.13.1 预埋，v0.13.4 接线）。
// 字段多 = Tauri 命令签名契约（模型可改字段 7 项）；与 import.rs 同惯例豁免
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_knowledge_model(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    disciplines: Option<String>,
    claim: Option<String>,
    valid_when: Option<String>,
    invalid_when: Option<String>,
    status: Option<String>,
) -> Result<KnowledgeModel, String> {
    update_knowledge_model_inner(&state.db, id, name, disciplines, claim, valid_when, invalid_when, status)
}

/// 列出体系内模型。
///
/// @ai-context: 只读；按 id 升序（前端详情/模型面板数据源）。
#[tauri::command]
pub fn list_knowledge_models(state: State<'_, AppState>, system_id: i64) -> Result<Vec<KnowledgeModel>, String> {
    list_knowledge_models_inner(&state.db, system_id)
}

/// 引用外部内容到体系（node/concept/model 至少一；target 存在性校验）。
///
/// @ai-context: 体系只引用、不收纳——本命令是唯一引用通道；每个给到的实体必须属于该体系；
///              target 四类（组/笔记/闪卡/碎片）经 link_target_exists 校验存在。
///              @side-effect 同 (system, entity, target) 幂等返回现有——防 UI 双击双链。
///              @side-effect v0.14 C3：成功后广播 knowledge:links-changed——跨页即时同步
///              （笔记页挂接 → 体系页引用区/图谱即时刷新，spec §3.3 refreshToken 机制）。
#[tauri::command]
pub fn link_knowledge_target(
    app: AppHandle,
    state: State<'_, AppState>,
    system_id: i64,
    node_id: Option<i64>,
    concept_id: Option<i64>,
    model_id: Option<i64>,
    target_type: String,
    target_id: i64,
) -> Result<KnowledgeLink, String> {
    let link = link_knowledge_target_inner(
        &state.db, system_id, node_id, concept_id, model_id, target_type, target_id,
    )?;
    let _ = app.emit("knowledge:links-changed", ());
    Ok(link)
}

/// 列出引用（体系必选；node/concept/model 过滤可选）。
///
/// @ai-context: 只读；M1 list_knowledge_links 需 system_id——前端详情面板必有体系上下文，
///              此处强制提供（None 报"必须指定体系"）。
#[tauri::command]
pub fn list_knowledge_links(
    state: State<'_, AppState>,
    system_id: Option<i64>,
    node_id: Option<i64>,
    concept_id: Option<i64>,
    model_id: Option<i64>,
) -> Result<Vec<KnowledgeLink>, String> {
    list_knowledge_links_inner(&state.db, system_id, node_id, concept_id, model_id)
}

/// 撤销引用（幂等——重复删除不报错，返回是否删除成功）。
///
/// @ai-context: 只删引用键，不动目标内容（target 删除后引用键保留由 ON DELETE SET NULL
///              语义保证——本命令只撤销体系侧指向）。
///              @side-effect v0.14 C3：成功后广播 knowledge:links-changed（同挂接）。
#[tauri::command]
pub fn delete_knowledge_link(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let ok = delete_knowledge_link_inner(&state.db, id)?;
    let _ = app.emit("knowledge:links-changed", ());
    Ok(ok)
}

/// 反查：按目标实体查引用（内容侧 → 体系侧；v0.14 C3）。
///
/// @ai-context: 与 list_knowledge_links（体系侧正查）互补——本命令不限定体系，
///              从内容（笔记/组/卡/碎片）看"被哪些体系/实体挂接"。spec §4.3
///              参数为 (体系, 实体)，落位为全局反查：调用场景（笔记挂接反查）
///              天然不知体系；体系侧需求由聚合视图（list_knowledge_links 全量）覆盖。
#[tauri::command]
pub fn list_links_by_target(
    state: State<'_, AppState>,
    target_type: String,
    target_id: i64,
) -> Result<Vec<KnowledgeLink>, String> {
    list_links_by_target_inner(&state.db, target_type, target_id)
}

/// 反查 inner（target_type 白名单 + id 校验）。
pub(crate) fn list_links_by_target_inner(
    db: &Db,
    target_type: String,
    target_id: i64,
) -> Result<Vec<KnowledgeLink>, String> {
    require_id(target_id)?;
    parse_target_type(&target_type)?;
    db.list_links_by_target(&target_type, target_id).map_err(|e| e.to_string())
}

/// 审计探测（返回结构性 {due, signal}——v0.13.4 审计界面的前置读）。
///
/// @ai-context: 信号聚合——item_count=节点/概念/模型数；last_audit_at_ms 取最近审计毫秒
///              （无则 None）；created_at_ms 由体系 created_at(秒)×1000；now_ms 注入当前。
///              纯函数 audit_due 只判到期（无时间调用——聚合后喂给 pure），可 :memory: 测。
#[tauri::command]
pub fn audit_due_for_system(state: State<'_, AppState>, system_id: i64) -> Result<AuditDueResult, String> {
    audit_due_for_system_inner(&state.db, system_id)
}

/// 新建概念（归一化 + 查重 + 体系存在性）。
pub(crate) fn add_knowledge_concept_inner(
    db: &Db,
    system_id: i64,
    name: String,
    essence: Option<String>,
    boundary: Option<String>,
    relation: Option<String>,
) -> Result<KnowledgeConcept, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    let name = normalize_text(&name, "概念名称")?;
    if db.find_concept_by_name(&name).map_err(|e| e.to_string())?.is_some() {
        return Err(format!("概念已存在: {}", name));
    }
    db.add_knowledge_concept(&NewKnowledgeConcept {
        system_id,
        name,
        essence: opt_trim(essence),
        boundary: opt_trim(boundary),
        relation: opt_trim(relation),
    })
    .map_err(|e| e.to_string())
}

/// 更新概念（返回更新后实体；存在性 + 改名查重 + 状态白名单）。
pub(crate) fn update_knowledge_concept_inner(
    db: &Db,
    id: i64,
    name: Option<String>,
    essence: Option<String>,
    boundary: Option<String>,
    relation: Option<String>,
    status: Option<String>,
) -> Result<KnowledgeConcept, String> {
    require_id(id)?;
    if db.get_knowledge_concept(id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("概念不存在: {}", id));
    }
    let name = name.as_deref().map(|n| normalize_text(n, "概念名称")).transpose()?;
    if let Some(st) = status.as_deref() {
        require_status("concept", st)?;
    }
    if let Some(n) = name.as_deref() {
        if let Some(existing) = db.find_concept_by_name(n).map_err(|e| e.to_string())? {
            if existing.id != id {
                return Err(format!("概念已存在: {}", n));
            }
        }
    }
    let essence_db = opt_field(essence);
    let boundary_db = opt_field(boundary);
    let relation_db = opt_field(relation);
    db.update_knowledge_concept(
        id,
        name.as_deref(),
        essence_db.as_ref().map(|i| i.as_deref()),
        boundary_db.as_ref().map(|i| i.as_deref()),
        relation_db.as_ref().map(|i| i.as_deref()),
        status.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    db.get_knowledge_concept(id).map_err(|e| e.to_string())?.ok_or_else(|| format!("概念不存在: {}", id))
}

/// 列出概念（体系/状态过滤；无体系→全库）。
pub(crate) fn list_knowledge_concepts_inner(
    db: &Db,
    system_id: Option<i64>,
    status: Option<String>,
) -> Result<Vec<KnowledgeConcept>, String> {
    if let Some(sid) = system_id {
        require_id(sid)?;
    }
    let status = status.as_deref().filter(|s| !s.trim().is_empty());
    if let Some(st) = status {
        require_status("concept", st)?;
    }
    db.list_knowledge_concepts(system_id, status).map_err(|e| e.to_string())
}

/// 新建模型（disciplines 校验 + 体系存在性）。
pub(crate) fn add_knowledge_model_inner(
    db: &Db,
    system_id: i64,
    name: String,
    disciplines: String,
    claim: Option<String>,
    valid_when: Option<String>,
    invalid_when: Option<String>,
) -> Result<KnowledgeModel, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    let name = normalize_text(&name, "模型名称")?;
    let disciplines = normalize_disciplines(&disciplines)?;
    db.add_knowledge_model(&NewKnowledgeModel {
        system_id,
        name,
        disciplines,
        claim: opt_trim(claim),
        valid_when: opt_trim(valid_when),
        invalid_when: opt_trim(invalid_when),
        cross_checks: None,
    })
    .map_err(|e| e.to_string())
}

/// 更新模型（返回更新后实体；存在性 + disciplines/status 校验）。
/// 更新模型编排（命令壳 ↔ db 层；可改字段 7 项）。
// 同命令壳豁免：字段=模型可改契约，非重复参数设计
#[allow(clippy::too_many_arguments)]
pub(crate) fn update_knowledge_model_inner(
    db: &Db,
    id: i64,
    name: Option<String>,
    disciplines: Option<String>,
    claim: Option<String>,
    valid_when: Option<String>,
    invalid_when: Option<String>,
    status: Option<String>,
) -> Result<KnowledgeModel, String> {
    require_id(id)?;
    if db.get_knowledge_model(id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("模型不存在: {}", id));
    }
    let name = name.as_deref().map(|n| normalize_text(n, "模型名称")).transpose()?;
    let disciplines = disciplines.as_deref().map(normalize_disciplines).transpose()?;
    if let Some(st) = status.as_deref() {
        require_status("model", st)?;
    }
    let claim_db = opt_field(claim);
    let valid_db = opt_field(valid_when);
    let invalid_db = opt_field(invalid_when);
    db.update_knowledge_model(
        id,
        name.as_deref(),
        disciplines.as_deref(),
        claim_db.as_ref().map(|i| i.as_deref()),
        valid_db.as_ref().map(|i| i.as_deref()),
        invalid_db.as_ref().map(|i| i.as_deref()),
        None,
        status.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    db.get_knowledge_model(id).map_err(|e| e.to_string())?.ok_or_else(|| format!("模型不存在: {}", id))
}

/// 列出体系内模型。
pub(crate) fn list_knowledge_models_inner(db: &Db, system_id: i64) -> Result<Vec<KnowledgeModel>, String> {
    require_id(system_id)?;
    db.list_knowledge_models(system_id).map_err(|e| e.to_string())
}

/// 引用外部内容（校验 + 幂等防双链）。
pub(crate) fn link_knowledge_target_inner(
    db: &Db,
    system_id: i64,
    node_id: Option<i64>,
    concept_id: Option<i64>,
    model_id: Option<i64>,
    target_type: String,
    target_id: i64,
) -> Result<KnowledgeLink, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    if node_id.is_none() && concept_id.is_none() && model_id.is_none() {
        return Err("节点/概念/模型至少指定一个".to_string());
    }
    for oid in [node_id, concept_id, model_id].into_iter().flatten() {
        require_id(oid)?;
    }
    if let Some(nid) = node_id {
        let n = db.get_knowledge_node(nid).map_err(|e| e.to_string())?;
        match n {
            Some(n) if n.system_id != system_id => return Err("引用实体不属于该体系".to_string()),
            Some(_) => {}
            None => return Err(format!("节点不存在: {}", nid)),
        }
    }
    if let Some(cid) = concept_id {
        let c = db.get_knowledge_concept(cid).map_err(|e| e.to_string())?;
        match c {
            Some(c) if c.system_id != system_id => return Err("引用实体不属于该体系".to_string()),
            Some(_) => {}
            None => return Err(format!("概念不存在: {}", cid)),
        }
    }
    if let Some(mid) = model_id {
        let m = db.get_knowledge_model(mid).map_err(|e| e.to_string())?;
        match m {
            Some(m) if m.system_id != system_id => return Err("引用实体不属于该体系".to_string()),
            Some(_) => {}
            None => return Err(format!("模型不存在: {}", mid)),
        }
    }
    require_id(target_id)?;
    let target = parse_target_type(&target_type)?;
    if !db.link_target_exists(target, target_id).map_err(|e| e.to_string())? {
        return Err(format!("目标不存在: {}/{}", target_type, target_id));
    }
    // 幂等防双链：同 (system, entity, target) 返回现有（UI 双击不重复建链）
    let existing = db.list_knowledge_links(system_id, None, None, None).map_err(|e| e.to_string())?;
    if let Some(link) = existing.iter().find(|l| {
        l.node_id == node_id
            && l.concept_id == concept_id
            && l.model_id == model_id
            && l.target_type == target_type
            && l.target_id == target_id
    }) {
        return Ok(link.clone());
    }
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id,
        node_id,
        concept_id,
        model_id,
        target_type,
        target_id,
    })
    .map_err(|e| e.to_string())
}

/// 列出引用（体系必选；entity 过滤可选）。
pub(crate) fn list_knowledge_links_inner(
    db: &Db,
    system_id: Option<i64>,
    node_id: Option<i64>,
    concept_id: Option<i64>,
    model_id: Option<i64>,
) -> Result<Vec<KnowledgeLink>, String> {
    if let Some(sid) = system_id {
        require_id(sid)?;
    }
    if let Some(v) = node_id {
        require_id(v)?;
    }
    if let Some(v) = concept_id {
        require_id(v)?;
    }
    if let Some(v) = model_id {
        require_id(v)?;
    }
    let system_id = system_id.ok_or_else(|| "必须指定体系".to_string())?;
    db.list_knowledge_links(system_id, node_id, concept_id, model_id).map_err(|e| e.to_string())
}

/// 撤销引用（幂等）。
pub(crate) fn delete_knowledge_link_inner(db: &Db, id: i64) -> Result<bool, String> {
    require_id(id)?;
    db.delete_knowledge_link(id).map_err(|e| e.to_string())
}

/// 审计探测（聚合信号 → pure 判定）。
pub(crate) fn audit_due_for_system_inner(db: &Db, system_id: i64) -> Result<AuditDueResult, String> {
    require_id(system_id)?;
    let system = db.get_knowledge_system(system_id).map_err(|e| e.to_string())?;
    let system = system.ok_or_else(|| format!("体系不存在: {}", system_id))?;
    // item_count = 节点 + 概念 + 模型（"学习内容"计数，审计仪式对象）
    let item_count = db.list_knowledge_nodes(system_id).map_err(|e| e.to_string())?.len()
        + db.list_knowledge_concepts(Some(system_id), None).map_err(|e| e.to_string())?.len()
        + db.list_knowledge_models(system_id).map_err(|e| e.to_string())?.len();
    let last_audit_at_ms = db.latest_audit_at_ms(system_id).map_err(|e| e.to_string())?.map(|v| v.max(0) as u64);
    let now_ms = (crate::db::unix_seconds().max(0) as u64).saturating_mul(1000);
    let created_at_ms = (system.created_at.max(0) as u64).saturating_mul(1000);
    let signal = AuditSignal {
        item_count,
        last_audit_at_ms,
        created_at_ms,
        now_ms,
    };
    let due = crate::knowledge_pure::audit_due(&signal);
    Ok(AuditDueResult { due, signal })
}
