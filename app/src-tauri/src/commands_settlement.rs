//! 组结算 commands（v0.11.3；防沼泽仪式系统层）。
//!
//! @ai-context: 结算必须是用户可见的仪式而非静默后台（v4 路线图 Step 6）：
//!              settlement_plan 先呈现候选（重复合并对 + 归档候选），用户
//!              确认后 execute_settlement 执行；核心提炼为本地规则版组核心笔记。
//! @ai-context: 归档不删除（fragments.status=archived 可恢复）；合并=保留长文本
//!              归档短重复项；结算记录落 settlements + metrics(group_settled)
//!              （北极星组成③）。
//! @ai-context: 本层只做参数校验、编排数据层/纯函数、错误映射（AGENTS.md §6）。

use serde::Serialize;
use tauri::State;

use crate::commands::AppState;
use crate::settlement::{find_merge_pairs, settlement_due, SettlementSignals, ARCHIVE_AGE_DAYS};
use crate::types::NewNote;

/// 合并对呈现（前端展示由用户确认）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePairView {
    pub keep_id: i64,
    pub drop_id: i64,
    pub keep_text: String,
    pub drop_text: String,
}

/// 归档候选呈现。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCandidateView {
    pub id: i64,
    pub text: String,
}

/// 结算计划（仪式第一步：呈现——用户看见沼泽全貌）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementPlan {
    pub item_count: usize,
    pub due: bool,
    pub last_settled_at: Option<i64>,
    pub merge_pairs: Vec<MergePairView>,
    pub archive_candidates: Vec<ArchiveCandidateView>,
}

/// 结算结果（仪式收尾：留痕可溯）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementResult {
    pub merged: usize,
    pub archived: usize,
    pub core_note_id: Option<i64>,
}

/// 生成结算计划（阈值/周期判定 + 重复合并对 + 归档候选）。
#[tauri::command]
pub fn settlement_plan(state: State<'_, AppState>, group_id: i64) -> Result<SettlementPlan, String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    settlement_plan_inner(&state, group_id)
}

/// 执行结算（仪式第二步：按用户选择应用合并/归档 + 核心提炼 + 留痕）。
///
/// @ai-context: 计划在执行时重算（防陈旧计划误伤——呈现与执行间的窗口内
///              可能有新碎片进组）；核心提炼为本地规则版（组核心笔记：笔记
///              目录 + 活跃碎片摘要），AI 精修可选增强留 V1.0。
#[tauri::command]
pub fn execute_settlement(
    state: State<'_, AppState>,
    group_id: i64,
    apply_merges: bool,
    apply_archives: bool,
) -> Result<SettlementResult, String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    // 重算计划（新鲜口径）
    let state_clone: AppState = (*state).clone();
    let plan = settlement_plan_inner(&state_clone, group_id)?;
    let mut merged = 0usize;
    let mut archived = 0usize;
    if apply_merges {
        for pair in &plan.merge_pairs {
            if state.db.set_fragment_status(pair.drop_id, "archived").map_err(|e| e.to_string())? {
                merged += 1;
            }
        }
    }
    if apply_archives {
        for cand in &plan.archive_candidates {
            if state.db.set_fragment_status(cand.id, "archived").map_err(|e| e.to_string())? {
                archived += 1;
            }
        }
    }
    // 核心提炼：组核心笔记（本地规则——笔记目录 + 碎片摘要，落组内）。
    // 审查修复（2026-08-22）：无合并无归档的空转结算不产核心笔记——
    // 防反复点击结算刷出重复笔记（仪式留痕靠 settlements 记录即可）。
    let core_note_id = if merged > 0 || archived > 0 {
        create_core_note(&state_clone, group_id)?
    } else {
        None
    };
    // 留痕：结算记录 + 北极星埋点（组成③经历过结算）
    let stats = serde_json::json!({
        "merged": merged, "archived": archived, "coreNoteId": core_note_id,
        "itemCountBefore": plan.item_count,
    })
    .to_string();
    state.db.create_settlement(group_id, &stats).map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "groupId": group_id, "merged": merged, "archived": archived }).to_string();
    let _ = state.db.add_metric_event("group_settled", &payload);
    Ok(SettlementResult { merged, archived, core_note_id })
}

/// settlement_plan 的内部实现（command 与 execute 复用，避免 State 二次借用）。
fn settlement_plan_inner(state: &AppState, group_id: i64) -> Result<SettlementPlan, String> {
    let group = state
        .db
        .get_group(group_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("笔记组不存在: {}", group_id))?;
    let fragments = state.db.list_fragments_by_group(group_id).map_err(|e| e.to_string())?;
    let notes = state.db.list_notes_by_group(group_id).map_err(|e| e.to_string())?;
    let now_secs = crate::db::unix_seconds();
    let last_settled_at = state.db.latest_settlement_at(group_id).map_err(|e| e.to_string())?;
    let item_count = fragments.len() + notes.len();
    let due = settlement_due(&SettlementSignals {
        item_count,
        last_settled_at,
        created_at: group.created_at,
        now_secs,
    });
    let items: Vec<(i64, String)> =
        fragments.iter().take(200).map(|f| (f.id, f.text.clone())).collect();
    let texts: std::collections::HashMap<i64, &str> =
        fragments.iter().map(|f| (f.id, f.text.as_str())).collect();
    let merge_pairs = find_merge_pairs(&items)
        .into_iter()
        .filter_map(|(keep, drop)| {
            Some(MergePairView {
                keep_id: keep,
                drop_id: drop,
                keep_text: texts.get(&keep)?.to_string(),
                drop_text: texts.get(&drop)?.to_string(),
            })
        })
        .collect();
    let age_cutoff = now_secs - ARCHIVE_AGE_DAYS * 86_400;
    // 审查修复（2026-08-22）：有卡绑定判定改单条 SQL 全集（替代逐碎片 N+1）
    let card_bound = state.db.fragment_ids_with_cards().map_err(|e| e.to_string())?;
    let mut archive_candidates = Vec::new();
    for f in &fragments {
        if f.created_at < age_cutoff && !card_bound.contains(&f.id) {
            archive_candidates.push(ArchiveCandidateView { id: f.id, text: f.text.clone() });
        }
    }
    Ok(SettlementPlan { item_count, due, last_settled_at, merge_pairs, archive_candidates })
}

/// 组核心笔记（本地规则提炼：笔记目录 + 活跃碎片摘要）。
fn create_core_note(state: &AppState, group_id: i64) -> Result<Option<i64>, String> {
    let group = match state.db.get_group(group_id).map_err(|e| e.to_string())? {
        Some(g) => g,
        None => return Ok(None),
    };
    let notes = state.db.list_notes_by_group(group_id).map_err(|e| e.to_string())?;
    let fragments = state.db.list_fragments_by_group(group_id).map_err(|e| e.to_string())?;
    if notes.is_empty() && fragments.is_empty() {
        return Ok(None); // 空组无核心可提炼（诚实不造假燃料）
    }
    let mut md = format!("# {} · 结算提炼\n\n", group.name);
    if !notes.is_empty() {
        md.push_str("## 组内笔记\n\n");
        for n in &notes {
            md.push_str(&format!("- {}\n", n.title));
        }
        md.push('\n');
    }
    if !fragments.is_empty() {
        md.push_str("## 活跃碎片摘要\n\n");
        for f in fragments.iter().take(30) {
            let excerpt: String = f.text.chars().take(50).collect();
            md.push_str(&format!("- {}\n", excerpt));
        }
    }
    let note = state
        .db
        .create_note(&NewNote {
            title: format!("{} · 结算提炼", group.name),
            content: md,
            source: "manual".to_string(),
            session_id: None,
            rule_version: None,
            purify_stats: None,
            tags: None,
            properties: None,
            group_id: Some(group_id),
        })
        .map_err(|e| e.to_string())?;
    Ok(Some(note.id))
}
