//! 概念模型卡→概念升格命令层（v0.13.2 REQ-207 系统层；commands_knowledge_cards 拆出）。
//!
//! @ai-context: 卡→概念升格四分支（Create/Merge/Hint/Already）——组内 model 卡经 promote_rules
//!              决策升格为体系内概念（思辨面）；只引用不收纳（knowledge_links(target_type=flashcard)）；
//!              锚点为卡背独立行 `→ 概念「name」`（back_has_anchor 幂等防重复回链）。
//! @ai-context: 线宽豁免登记：本文件承载升格命令 + PromoteResult + 四分支编排（同一命令域），
//!              自 commands_knowledge_cards.rs 拆出以保持各文件 ≤300 行（AGENTS.md §3）。

use tauri::State;

use serde::Serialize;

use crate::commands::AppState;
use crate::commands_knowledge::{normalize_text, require_id};
use crate::commands_knowledge_core::link_knowledge_target_inner;
use crate::db::Db;
use crate::knowledge_card::{back_has_anchor, parse_model_card_back};
use crate::knowledge_pure::{PromoteDecision, PromoteInput};
use crate::types::{KnowledgeConcept, KnowledgeLink, KnowledgeSystem, NewKnowledgeConcept};

/// 升格结果（camelCase 序列化回传前端）。
///
/// @ai-context: action ∈ created/merged/hinted/already；decision 透传 promote_rules 决策；
///              concept=落库/命中的概念；link=新建引用（created/merged）或 None
///              （hinted/already——未落库/既有引用）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromoteResult {
    pub action: String,
    pub decision: PromoteDecision,
    pub concept: KnowledgeConcept,
    pub link: Option<KnowledgeLink>,
}

/// 卡→概念升格（Create/Merge/Hint/Already 四分支）。
///
/// @ai-context: target_system_id 缺省取全局体系（无全局 → 引导先建）；前置校验卡存在且
///              kind='model'（非概念卡拒绝）；空名在 normalize_text 拒空（promote_rules panic 前置）。
#[tauri::command]
pub fn promote_card_to_concept(
    state: State<'_, AppState>,
    card_id: i64,
    target_system_id: Option<i64>,
) -> Result<PromoteResult, String> {
    promote_card_to_concept_inner(&state.db, card_id, target_system_id)
}

/// 卡→概念升格（规格 §四 5 步：卡校验→目标体系→AlreadyLinked 免重复→promote_rules→分派）。
pub(crate) fn promote_card_to_concept_inner(
    db: &Db,
    card_id: i64,
    target_system_id: Option<i64>,
) -> Result<PromoteResult, String> {
    require_id(card_id)?;
    let card = db
        .get_card(card_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("卡片不存在: {}", card_id))?;
    if card.kind != "model" {
        return Err("仅概念卡（model 卡）可纳入体系".to_string());
    }
    let target = resolve_target_system(db, target_system_id)?;
    // AlreadyLinked 免重复：目标体系内该卡已有闪卡引用 → 直接返回既有关联（不重跑）
    let links = db
        .list_knowledge_links(target.id, None, None, None)
        .map_err(|e| e.to_string())?;
    if let Some(link) = links.iter().find(|l| {
        l.target_type == "flashcard" && l.target_id == card_id && l.concept_id.is_some()
    }) {
        let cid = link.concept_id.ok_or_else(|| "引用缺少概念".to_string())?;
        let concept = db
            .get_knowledge_concept(cid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("概念不存在: {}", cid))?;
        return Ok(PromoteResult {
            action: "already".to_string(),
            decision: PromoteDecision::AlreadyLinked { concept_id: cid },
            concept,
            link: Some(link.clone()),
        });
    }
    // 组装 PromoteInput：name 归一化前置（拒空——promote_rules 空名 panic 前置）
    let name = normalize_text(&card.front, "概念名")?;
    let existing: Vec<(i64, String, i64)> = db
        .find_concept_by_name(&name)
        .map_err(|e| e.to_string())?
        .map(|c| (c.id, c.name, c.system_id))
        .into_iter()
        .collect();
    let input = PromoteInput {
        card_name: name.clone(),
        existing,
        target_system_id: target.id,
    };
    let decision = crate::knowledge_pure::promote_rules(&input);
    match decision {
        PromoteDecision::Create => {
            let parsed = parse_model_card_back(&card.back);
            let concept = db
                .add_knowledge_concept(&NewKnowledgeConcept {
                    system_id: target.id,
                    name: name.clone(),
                    essence: parsed.essence,
                    boundary: parsed.boundary,
                    relation: parsed.relation,
                })
                .map_err(|e| {
                    let msg = e.to_string();
                    if msg.contains("UNIQUE") {
                        "概念已存在，请合并".to_string()
                    } else {
                        msg
                    }
                })?;
            let link = link_knowledge_target_inner(
                db, target.id, None, Some(concept.id), None, "flashcard".to_string(), card_id,
            )?;
            append_anchor(db, card_id, &card.back, &name)?;
            record_promoted_metric(db, card_id, concept.id);
            Ok(PromoteResult { action: "created".to_string(), decision, concept, link: Some(link) })
        }
        PromoteDecision::Merge { concept_id } => {
            let concept = db
                .get_knowledge_concept(concept_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("概念不存在: {}", concept_id))?;
            let link = link_knowledge_target_inner(
                db, target.id, None, Some(concept.id), None, "flashcard".to_string(), card_id,
            )?;
            append_anchor(db, card_id, &card.back, &name)?;
            record_promoted_metric(db, card_id, concept.id);
            Ok(PromoteResult { action: "merged".to_string(), decision, concept, link: Some(link) })
        }
        PromoteDecision::CrossSystemHint { concept_id, other_system_id: _ } => {
            // 仅提示不落库（v0.13.4 交叉点数据源）；无 link/无 metric/无锚点追加
            let concept = db
                .get_knowledge_concept(concept_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("概念不存在: {}", concept_id))?;
            Ok(PromoteResult { action: "hinted".to_string(), decision, concept, link: None })
        }
        PromoteDecision::AlreadyLinked { concept_id } => {
            // 防御分支（步骤 3 已拦截，基本不达；仍透传既有关联）
            let concept = db
                .get_knowledge_concept(concept_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("概念不存在: {}", concept_id))?;
            let link = db
                .list_knowledge_links(target.id, None, None, None)
                .map_err(|e| e.to_string())?
                .into_iter()
                .find(|l| {
                    l.target_type == "flashcard"
                        && l.target_id == card_id
                        && l.concept_id == Some(concept_id)
                });
            Ok(PromoteResult { action: "already".to_string(), decision, concept, link })
        }
    }
}

/// 目标体系解析：传则校验存在性；未传取全局体系（无→引导先建全局体系）。
fn resolve_target_system(db: &Db, target_system_id: Option<i64>) -> Result<KnowledgeSystem, String> {
    match target_system_id {
        Some(tid) => {
            require_id(tid)?;
            db.get_knowledge_system(tid)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("体系不存在: {}", tid))
        }
        None => db
            .find_global_system()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "请先创建全局体系".to_string()),
    }
}

/// 升格锚点追加（幂等：back_has_anchor 已锚定则不二次追加）。
fn append_anchor(db: &Db, card_id: i64, back: &str, name: &str) -> Result<(), String> {
    if back_has_anchor(back) {
        return Ok(());
    }
    let new_back = format!("{}\n→ 概念「{}」", back, name);
    db.update_card_back(card_id, &new_back).map_err(|e| e.to_string())?;
    Ok(())
}

/// 埋 concept_promoted 指标（best-effort——与 card_reviewed/fragment_upgraded 同口径，
/// Payload 带 cardId/conceptId 供前端与后续体系统计）。
fn record_promoted_metric(db: &Db, card_id: i64, concept_id: i64) {
    let payload = serde_json::json!({ "cardId": card_id, "conceptId": concept_id }).to_string();
    let _ = db.add_metric_event("concept_promoted", &payload);
}
