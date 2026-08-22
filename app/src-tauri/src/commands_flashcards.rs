//! 闪卡与复习 commands（v0.11.2 学习循环统一系统层）。
//!
//! @ai-context: 组→闪卡生成为本地规则版（card_generate 纯函数）——AI 生成
//!              为可选增强（复用 ai_client 授权/成本/审计全套），本版不接线。
//! @ai-context: 复习链路=提取优先（前端先 front 后 back 再评分）；调度走
//!              scheduler（FSRS-6）；每次评分落 review_logs + metrics_events
//!              （北极星从第一天记——Phase 4 门控判据）。
//! @ai-context: 本层只做参数校验、编排数据层/纯函数、错误映射（AGENTS.md §6）。

use tauri::State;

use crate::card_generate::{card_from_fragment, cards_from_note};
use crate::commands::AppState;
use crate::db_flashcards::NewFlashcard;
use crate::scheduler::{schedule, CardState, Rating};
use crate::types::Flashcard;

/// 复习队列单次上限（防无界查询）。
const DUE_LIST_LIMIT_MAX: usize = 200;

/// 当前时刻（Unix 毫秒；调度/到期统一口径）。
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 组→闪卡生成（本地规则版；幂等——同组同 front 不重复产卡）。
///
/// @ai-context: 双卡源：组内笔记词汇表块（术语卡）+ 组内碎片（多句卡）；
///              新卡 due_at=now（立即可复习——首次学习也是提取优先）；
///              碎片出卡记 fragment_upgraded 指标（碎片升级率=Phase 4 门控）。
#[tauri::command]
pub fn generate_group_cards(state: State<'_, AppState>, group_id: i64) -> Result<usize, String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    if state.db.get_group(group_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("笔记组不存在: {}", group_id));
    }
    let now = now_ms();
    let new_state = serde_json::to_string(&CardState::default()).unwrap_or_default();
    let mut generated = 0usize;
    // ① 笔记词汇表块 → 术语卡
    let notes = state.db.list_notes_by_group(group_id).map_err(|e| e.to_string())?;
    for note in notes {
        for cand in cards_from_note(&note.content) {
            if state.db.card_front_exists(group_id, &cand.front).map_err(|e| e.to_string())? {
                continue;
            }
            state
                .db
                .create_card(&NewFlashcard {
                    group_id,
                    note_id: Some(note.id),
                    fragment_id: None,
                    front: cand.front,
                    back: cand.back,
                    kind: cand.kind.clone(),
                    state_json: new_state.clone(),
                    due_at: now as i64,
                })
                .map_err(|e| e.to_string())?;
            generated += 1;
        }
    }
    // ② 碎片 → 多句卡（单句碎片诚实不出卡——card_generate 内门控）
    let fragments = state.db.list_fragments_by_group(group_id).map_err(|e| e.to_string())?;
    for frag in fragments {
        let Some(cand) = card_from_fragment(&frag.text) else { continue };
        if state.db.card_front_exists(group_id, &cand.front).map_err(|e| e.to_string())? {
            continue;
        }
        state
            .db
            .create_card(&NewFlashcard {
                group_id,
                note_id: None,
                fragment_id: Some(frag.id),
                front: cand.front,
                back: cand.back,
                kind: cand.kind.clone(),
                state_json: new_state.clone(),
                due_at: now as i64,
            })
            .map_err(|e| e.to_string())?;
        generated += 1;
        // 碎片升级率埋点（Phase 4 门控判据，从第一天记）
        let payload = serde_json::json!({ "fragmentId": frag.id, "groupId": group_id }).to_string();
        let _ = state.db.add_metric_event("fragment_upgraded", &payload);
    }
    Ok(generated)
}

/// 到期复习队列（组过滤可选；到期最紧在前）。
#[tauri::command]
pub fn list_due_cards(
    state: State<'_, AppState>,
    group_id: Option<i64>,
    limit: Option<usize>,
) -> Result<Vec<Flashcard>, String> {
    let limit = limit.unwrap_or(50).min(DUE_LIST_LIMIT_MAX);
    state
        .db
        .list_due_cards(group_id, now_ms() as i64, limit)
        .map_err(|e| e.to_string())
}

/// 到期卡计数（组面板"复习 N"徽标）。
#[tauri::command]
pub fn count_due_cards(state: State<'_, AppState>, group_id: Option<i64>) -> Result<i64, String> {
    state.db.count_due_cards(group_id, now_ms() as i64).map_err(|e| e.to_string())
}

/// 复习评分（提取优先闭环：front→回忆→back→评分→调度推进）。
///
/// @ai-context: state_json 损坏 → 回退新卡状态重学（诚实降级不 panic）；
///              card_reviewed 指标每次必记（北极星组成①的数据源）。
#[tauri::command]
pub fn review_card(
    state: State<'_, AppState>,
    card_id: i64,
    rating: String,
) -> Result<Flashcard, String> {
    if card_id <= 0 {
        return Err("无效的卡片 id".to_string());
    }
    let rating = Rating::parse(&rating).ok_or_else(|| format!("不支持的评分: {}", rating))?;
    let card = state
        .db
        .get_card(card_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("卡片不存在: {}", card_id))?;
    // 状态解析（损坏回退默认——重学比崩溃诚实）
    let current: CardState =
        serde_json::from_str(&card.state_json).unwrap_or_default();
    let now = now_ms();
    let outcome = schedule(
        if current.reps > 0 { Some(&current) } else { None },
        rating,
        now,
    );
    let state_json = serde_json::to_string(&outcome.next).unwrap_or_default();
    state
        .db
        .update_card_schedule(card_id, &state_json, outcome.due_at_ms as i64)
        .map_err(|e| e.to_string())?;
    state
        .db
        .add_review_log(card_id, &rating.to_string_lower(), now as i64)
        .map_err(|e| e.to_string())?;
    // 北极星埋点（组有复习记录=组成①；payload 带组 id 供按组聚合）
    let payload =
        serde_json::json!({ "cardId": card_id, "groupId": card.group_id, "rating": rating.to_string_lower() })
            .to_string();
    let _ = state.db.add_metric_event("card_reviewed", &payload);
    Ok(Flashcard {
        state_json,
        due_at: outcome.due_at_ms as i64,
        ..card
    })
}

/// 组级自测最轻形态（N14 防御：只抽卡不叙事成败）——随机抽 N 张到期/未到期卡。
#[tauri::command]
pub fn quiz_group_cards(
    state: State<'_, AppState>,
    group_id: i64,
    count: Option<usize>,
) -> Result<Vec<Flashcard>, String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    let count = count.unwrap_or(5).min(20);
    // 到期队列优先，不足补新卡（due_at 升序全量取——自测不限到期）
    let mut cards = state
        .db
        .list_due_cards(Some(group_id), i64::MAX, DUE_LIST_LIMIT_MAX)
        .map_err(|e| e.to_string())?;
    cards.truncate(count);
    Ok(cards)
}

impl Rating {
    /// 日志/埋点字符串（lowercase 契约，与 parse 对称）。
    fn to_string_lower(self) -> String {
        match self {
            Rating::Again => "again",
            Rating::Hard => "hard",
            Rating::Good => "good",
            Rating::Easy => "easy",
        }
        .to_string()
    }
}

/// 学习循环指标读数（v4 §8 过程指标可见化——防测量层过度建设的前提是先有读数）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningMetrics {
    pub card_reviewed: i64,
    pub fragment_upgraded: i64,
    pub group_settled: i64,
}

/// 学习循环指标（北极星过程读数：复习次数/碎片升级数/组结算数）。
#[tauri::command]
pub fn learning_metrics(state: State<'_, AppState>) -> Result<LearningMetrics, String> {
    Ok(LearningMetrics {
        card_reviewed: state.db.count_metric_events("card_reviewed").map_err(|e| e.to_string())?,
        fragment_upgraded: state
            .db
            .count_metric_events("fragment_upgraded")
            .map_err(|e| e.to_string())?,
        group_settled: state.db.count_metric_events("group_settled").map_err(|e| e.to_string())?,
    })
}
