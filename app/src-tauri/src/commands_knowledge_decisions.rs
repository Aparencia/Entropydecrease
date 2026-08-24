//! 决策/应用命令层（v0.13.3 REQ-208~210 系统层；决策日志 + 记一次使用"一表两面"）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；编排 `fn xxx_inner(db, …)`
//!              为纯函数（:memory: 可测），薄 `#[tauri::command]` 壳只取 state.db 调 inner。一表两面：
//!              kind 区分 decision（思辨面）/application（学习面·记一次使用），不双表双记、只记"我的决策"。
//! @ai-context: used_refs 结构契约在 knowledge_pure::validate_decision_input（纯函数）；本层其后做
//!              **存在性校验**（require_refs_exist——引用 id 不存在→"引用不存在: kind/id"）与 application
//!              挂载规则（概念/体系至少一；概念模式需引用该概念；体系模式需 ≥1 证据引用）。指标 best-effort。
//! @ai-context: log_application 事务遵循 promote_fragment_to_note 手法——db 层 create_application_tx
//!              单方法内显式事务（插行 + 可选 set_concept_applied），任一步失败整体回滚，杜绝半态。

use tauri::State;

use crate::commands::AppState;
use crate::commands_knowledge::{normalize_text, require_id};
use crate::db::{unix_seconds, Db};
use crate::knowledge_pure::validate_decision_input;
use crate::types::{KnowledgeDecision, NewKnowledgeDecision};

/// used_refs 规范化 JSON 的解析结果（本层存在性校验用；键域与 validate_decision_input 一致，
/// snake_case——纯函数存储态即 snake_case，与 UsedRefs 类型的 camelCase 序列化无关）。
struct ParsedRefs {
    node_ids: Vec<i64>,
    concept_ids: Vec<i64>,
    model_ids: Vec<i64>,
    group_id: Option<i64>,
    card_id: Option<i64>,
    note_id: Option<i64>,
    fragment_id: Option<i64>,
}

/// 解析规范化 used_refs JSON（snake_case 键）为结构；纯函数已保证形状与键合法。
fn parse_refs(normalized: &str) -> Result<ParsedRefs, String> {
    let v: serde_json::Value = serde_json::from_str(normalized).map_err(|_| "引用格式错误".to_string())?;
    let obj = v.as_object().ok_or_else(|| "引用格式错误".to_string())?;
    let ids = |key: &str| -> Vec<i64> {
        obj.get(key)
            .and_then(|x| x.as_array())
            .map(|a| a.iter().filter_map(|n| n.as_i64()).collect())
            .unwrap_or_default()
    };
    let one = |key: &str| -> Option<i64> { obj.get(key).and_then(|x| x.as_i64()) };
    Ok(ParsedRefs {
        node_ids: ids("node_ids"),
        concept_ids: ids("concept_ids"),
        model_ids: ids("model_ids"),
        group_id: one("group_id"),
        card_id: one("card_id"),
        note_id: one("note_id"),
        fragment_id: one("fragment_id"),
    })
}

/// 校验 used_refs 中所有引用目标存在（实体/证据；任一缺失报"引用不存在: kind/id"）。
///
/// @ai-context: 结构契约（validate_decision_input）成立后才查询——此处是**证据契约**
///              （防挂空引用膨胀；引用必填但还需真实存在）。实体走 get_knowledge_node/
///              concept/model，证据走 get_group/get_card/get_note/get_fragment。
fn require_refs_exist(db: &Db, refs: &ParsedRefs) -> Result<(), String> {
    for nid in &refs.node_ids {
        if db.get_knowledge_node(*nid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: node/{}", nid));
        }
    }
    for cid in &refs.concept_ids {
        if db.get_knowledge_concept(*cid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: concept/{}", cid));
        }
    }
    for mid in &refs.model_ids {
        if db.get_knowledge_model(*mid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: model/{}", mid));
        }
    }
    if let Some(g) = refs.group_id {
        if db.get_group(g).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: group/{}", g));
        }
    }
    if let Some(c) = refs.card_id {
        if db.get_card(c).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: card/{}", c));
        }
    }
    if let Some(n) = refs.note_id {
        if db.get_note(n).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: note/{}", n));
        }
    }
    if let Some(f) = refs.fragment_id {
        if db.get_fragment(f).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: fragment/{}", f));
        }
    }
    Ok(())
}

/// 可选文本字段 trim + 空串转 None（四行法可选字段，避免存空字符串/纯空白）。
fn opt_trim(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// 记一条决策（思辨面；kind 硬置 decision；引用必填且须真实存在）。
///
/// @ai-context: 只记"我的决策"——content 为决策内容，四行法（expectation/actual/reflection）
///              可选；体系必在；question_id 可选挂问题树节点（若给须存在）。used_refs 经
///              纯函数规范化 + 存在性校验后落库（防挂空引用膨胀）；decision_logged 审计计数。
#[tauri::command]
#[allow(clippy::too_many_arguments)] // 字段 = 命令入参契约（决策四行法 + 引用），非冗余设计
pub fn log_decision(
    state: State<'_, AppState>,
    system_id: i64,
    question_id: Option<i64>,
    content: String,
    expectation: Option<String>,
    actual: Option<String>,
    reflection: Option<String>,
    used_refs: String,
) -> Result<KnowledgeDecision, String> {
    log_decision_inner(&state.db, system_id, question_id, content, expectation, actual, reflection, used_refs)
}

/// 记一条应用"记一次使用"（学习面；kind=application；概念/体系挂载规则见下）。
///
/// @ai-context: 挂载规则（决策 R-A）——concept_id 与 system_id **至少其一**（空应用拒绝）；
///              概念模式：concept 须存在，system_id 若同时传且 ≠ concept.system_id 拒绝，
///              used_refs 须含 concept_ids=[concept_id]；体系模式（仅 system_id）：used_refs 须含
///              ≥1 证据引用（group/card/note/fragment）。事务在 db 层 create_application_tx
///              （插行 + 可选 set_concept_applied 同步原子），application_logged 审计计数。
#[tauri::command]
#[allow(clippy::too_many_arguments)] // 字段 = 命令入参契约（挂载 + 四行法 + 引用），非冗余设计
pub fn log_application(
    state: State<'_, AppState>,
    concept_id: Option<i64>,
    system_id: Option<i64>,
    content: String,
    expectation: Option<String>,
    actual: Option<String>,
    reflection: Option<String>,
    used_refs: String,
) -> Result<KnowledgeDecision, String> {
    log_application_inner(&state.db, concept_id, system_id, content, expectation, actual, reflection, used_refs)
}

/// 列出决策/应用（system_id/kind 过滤可选；limit 默认 50、须 1~500）。
///
/// @ai-context: 一表两面合表返回，前端按 kind 分 tab；kind ∈ {decision, application} 白名单；
///              limit 为条数上限（非法 → 报错，防任意大查询）。
#[tauri::command]
pub fn list_decisions(
    state: State<'_, AppState>,
    system_id: Option<i64>,
    kind: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<KnowledgeDecision>, String> {
    list_decisions_inner(&state.db, system_id, kind, limit)
}

/// 读单条决策/应用（不存在报错）。
#[tauri::command]
pub fn get_decision(state: State<'_, AppState>, id: i64) -> Result<KnowledgeDecision, String> {
    get_decision_inner(&state.db, id)
}

/// 删单条决策/应用（幂等——不存在返回 false 不报错）。
#[tauri::command]
pub fn delete_decision(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    delete_decision_inner(&state.db, id)
}

/// 记决策编排（校验 + 规范化 + 存在性 + 落库 + 审计计数）。
#[allow(clippy::too_many_arguments)] // 字段 = 命令入参契约，与命令壳对齐
pub(crate) fn log_decision_inner(
    db: &Db,
    system_id: i64,
    question_id: Option<i64>,
    content: String,
    expectation: Option<String>,
    actual: Option<String>,
    reflection: Option<String>,
    used_refs: String,
) -> Result<KnowledgeDecision, String> {
    require_id(system_id)?;
    if db.get_knowledge_system(system_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("体系不存在: {}", system_id));
    }
    if let Some(qid) = question_id {
        require_id(qid)?;
        if db.get_knowledge_node(qid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("引用不存在: node/{}", qid));
        }
    }
    let content = normalize_text(&content, "决策内容")?;
    let normalized = validate_decision_input(&used_refs, "decision")?;
    let parsed = parse_refs(&normalized)?;
    require_refs_exist(db, &parsed)?;
    let rec = db
        .create_decision(&NewKnowledgeDecision {
            kind: "decision".to_string(),
            system_id: Some(system_id),
            question_id,
            used_refs: normalized,
            content,
            expectation: opt_trim(expectation),
            actual: opt_trim(actual),
            reflection: opt_trim(reflection),
        })
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "systemId": system_id, "questionId": question_id }).to_string();
    let _ = db.add_metric_event("decision_logged", &payload);
    Ok(rec)
}

/// 记应用编排（挂载规则 + 校验 + 存在性 + 事务落库 + 审计计数）。
#[allow(clippy::too_many_arguments)] // 字段 = 命令入参契约，与命令壳对齐
pub(crate) fn log_application_inner(
    db: &Db,
    concept_id: Option<i64>,
    system_id: Option<i64>,
    content: String,
    expectation: Option<String>,
    actual: Option<String>,
    reflection: Option<String>,
    used_refs: String,
) -> Result<KnowledgeDecision, String> {
    if concept_id.is_none() && system_id.is_none() {
        return Err("应用记录必须挂概念或体系".to_string());
    }
    if let Some(cid) = concept_id {
        require_id(cid)?;
    }
    if let Some(sid) = system_id {
        require_id(sid)?;
    }
    let content = normalize_text(&content, "应用内容")?;
    let normalized = validate_decision_input(&used_refs, "application")?;
    let parsed = parse_refs(&normalized)?;

    let mut applied_concept_id: Option<i64> = None;
    let final_system_id: Option<i64>;
    if let Some(cid) = concept_id {
        let concept = db
            .get_knowledge_concept(cid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("概念不存在: {}", cid))?;
        if !parsed.concept_ids.contains(&cid) {
            return Err("应用记录需引用该概念".to_string());
        }
        if let Some(sid) = system_id {
            if sid != concept.system_id {
                return Err("应用概念不属于该体系".to_string());
            }
        }
        applied_concept_id = Some(cid);
        final_system_id = Some(concept.system_id);
    } else {
        let sid = system_id.ok_or_else(|| "应用记录必须挂概念或体系".to_string())?;
        if db.get_knowledge_system(sid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("体系不存在: {}", sid));
        }
        if parsed.group_id.is_none()
            && parsed.card_id.is_none()
            && parsed.note_id.is_none()
            && parsed.fragment_id.is_none()
        {
            return Err("体系级应用需证据引用".to_string());
        }
        final_system_id = Some(sid);
    }

    require_refs_exist(db, &parsed)?;
    let now = unix_seconds();
    let rec = db
        .create_application_tx(
            &NewKnowledgeDecision {
                kind: "application".to_string(),
                system_id: final_system_id,
                question_id: None,
                used_refs: normalized,
                content,
                expectation: opt_trim(expectation),
                actual: opt_trim(actual),
                reflection: opt_trim(reflection),
            },
            applied_concept_id,
            now,
        )
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "conceptId": concept_id, "systemId": final_system_id }).to_string();
    let _ = db.add_metric_event("application_logged", &payload);
    Ok(rec)
}

/// 列出决策/应用编排（kind 白名单 + limit 范围）。
pub(crate) fn list_decisions_inner(
    db: &Db,
    system_id: Option<i64>,
    kind: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<KnowledgeDecision>, String> {
    if let Some(sid) = system_id {
        require_id(sid)?;
    }
    if let Some(k) = kind.as_deref() {
        if k != "decision" && k != "application" {
            return Err(format!("不支持的类型: {}（支持: decision/application）", k));
        }
    }
    let limit = limit.unwrap_or(50);
    if limit <= 0 || limit > 500 {
        return Err(format!("limit 需在 1~500 之间: {}", limit));
    }
    db.list_decisions(system_id, kind.as_deref(), limit as usize).map_err(|e| e.to_string())
}

/// 读单条编排（不存在报错）。
pub(crate) fn get_decision_inner(db: &Db, id: i64) -> Result<KnowledgeDecision, String> {
    require_id(id)?;
    db.get_decision(id).map_err(|e| e.to_string())?.ok_or_else(|| format!("决策不存在: {}", id))
}

/// 删单条编排（幂等）。
pub(crate) fn delete_decision_inner(db: &Db, id: i64) -> Result<bool, String> {
    require_id(id)?;
    db.delete_decision(id).map_err(|e| e.to_string())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_knowledge_decisions_tests.rs"]
mod tests;
