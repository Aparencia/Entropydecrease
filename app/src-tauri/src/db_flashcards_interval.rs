//! flashcards 行映射域（列序契约 `CARD_COLUMNS` + ②域行派生 intervalDays）。
//!
//! @ai-context: 从 db_flashcards.rs 拆出（批 6 · T20b，原 300/300 零余量）——
//!              `CARD_COLUMNS` 与 `row_to_card` 是同一列序契约的两面（5 个查询
//!              方法共用），`interval_days_from` 是 PB2 裁决**②域（整天粒度）**的
//!              唯一实现：由 `due_at − stateJson.lastReviewMs` 反推（DB 无 interval
//!              列，f32 原值不可恢复）。**①域（精确值）不在此处**——它只在
//!              commands_flashcards.rs 的 review_card 返回体里当场显式覆写。
//! @ai-context: 副作用边界——本文件只读行、不写库、不含 SQL 文本（SQL 仍全在
//!              db_flashcards.rs）；劣化输入（无复习记录 / lastReviewMs ≥ due_at）
//!              ⇒ `0.0`（不发明数字、不 panic；确切时刻看 `dueAt`）。

use crate::scheduler::CardState;
use crate::types::Flashcard;

/// flashcards 表统一查询列（列顺序与 row_to_card 严格对应）。
pub(crate) const CARD_COLUMNS: &str =
    "id, group_id, note_id, fragment_id, front, back, kind, state_json, due_at, created_at";

/// 把 rusqlite 行映射为 Flashcard（列序契约的唯一消费点）。
///
/// 列序 0..9 **各读一次**（读序与拆分前逐字相同），再整体装配——`state_json` /
/// `due_at` 先落到局部量，②域行派生直接复用，不再对同一列二次取值。
pub(crate) fn row_to_card(row: &rusqlite::Row<'_>) -> rusqlite::Result<Flashcard> {
    let id: i64 = row.get(0)?;
    let group_id: i64 = row.get(1)?;
    let note_id: Option<i64> = row.get(2)?;
    let fragment_id: Option<i64> = row.get(3)?;
    let front: String = row.get(4)?;
    let back: String = row.get(5)?;
    let kind: String = row.get(6)?;
    let state_json: String = row.get(7)?;
    let due_at: i64 = row.get(8)?;
    let created_at: i64 = row.get(9)?;
    let interval_days = interval_days_from(due_at, &state_json);
    Ok(Flashcard {
        id,
        group_id,
        note_id,
        fragment_id,
        front,
        back,
        kind,
        state_json,
        due_at,
        created_at,
        interval_days,
    })
}

/// 行派生间隔（**②域 · 整天粒度**）：`due_at − stateJson.lastReviewMs` 反推；
/// 无复习记录 / 劣化输入 ⇒ `0.0`（不发明数字；确切时刻看 `dueAt`）。
fn interval_days_from(due_at: i64, state_json: &str) -> f32 {
    let s: CardState = serde_json::from_str(state_json).unwrap_or_default();
    let days = (due_at.saturating_sub(s.last_review_ms as i64)) as f64 / 86_400_000.0;
    if s.last_review_ms == 0 || days <= 0.0 {
        0.0
    } else {
        days.round().max(1.0) as f32
    }
}
