//! 闪卡/复习日志/指标事件数据层（v0.11.2）。
//!
//! @ai-context: 三表内聚一域——flashcards（卡）+ review_logs（弹性承诺日志，
//!              无 streak）+ metrics_events（北极星/过程指标，Phase 4 门控判据
//!              从第一天记）；调度纯逻辑在 scheduler.rs，生成纯逻辑在 card_generate.rs。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::Flashcard;

/// flashcards 表统一查询列（列顺序与 row_to_card 严格对应）。
const CARD_COLUMNS: &str =
    "id, group_id, note_id, fragment_id, front, back, kind, state_json, due_at, created_at";

/// 新建闪卡入参（id/created_at 由数据层填充；新卡 state_json=CardState::default 序列化）。
pub struct NewFlashcard {
    pub group_id: i64,
    pub note_id: Option<i64>,
    pub fragment_id: Option<i64>,
    pub front: String,
    pub back: String,
    pub kind: String,
    pub state_json: String,
    pub due_at: i64,
}

impl Db {
    /// 新建闪卡，返回完整记录。
    pub fn create_card(&self, new: &NewFlashcard) -> Result<Flashcard> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO flashcards (group_id, note_id, fragment_id, front, back, kind, state_json, due_at, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    new.group_id, new.note_id, new.fragment_id, new.front, new.back,
                    new.kind, new.state_json, new.due_at, now
                ],
            )?;
            let id = conn.last_insert_rowid();
            Ok(Flashcard {
                id,
                group_id: new.group_id,
                note_id: new.note_id,
                fragment_id: new.fragment_id,
                front: new.front.clone(),
                back: new.back.clone(),
                kind: new.kind.clone(),
                state_json: new.state_json.clone(),
                due_at: new.due_at,
                created_at: now,
            })
        })
    }

    /// 同组同 front 查重（生成幂等键——重复生成不产重卡）。
    pub fn card_front_exists(&self, group_id: i64, front: &str) -> Result<bool> {
        self.with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM flashcards WHERE group_id = ?1 AND front = ?2",
                params![group_id, front],
                |r| r.get(0),
            )?;
            Ok(count > 0)
        })
    }

    /// 按 id 读取单卡；不存在返回 None。
    pub fn get_card(&self, id: i64) -> Result<Option<Flashcard>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare(&format!("SELECT {} FROM flashcards WHERE id = ?1", CARD_COLUMNS))?;
            let mut rows = stmt.query_map(params![id], row_to_card)?;
            match rows.next() {
                Some(Ok(c)) => Ok(Some(c)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 到期复习队列（due_at ≤ now；组过滤可选；到期最紧在前——弹性承诺不追债，
    /// 只按客观到期时刻排序呈现）。
    pub fn list_due_cards(&self, group_id: Option<i64>, now_ms: i64, limit: usize) -> Result<Vec<Flashcard>> {
        self.with_conn(|conn| {
            let (sql, gid): (String, Option<i64>) = match group_id {
                Some(g) => (
                    format!(
                        "SELECT {} FROM flashcards WHERE due_at <= ?1 AND group_id = ?2
                         ORDER BY due_at ASC LIMIT ?3",
                        CARD_COLUMNS
                    ),
                    Some(g),
                ),
                None => (
                    format!(
                        "SELECT {} FROM flashcards WHERE due_at <= ?1
                         ORDER BY due_at ASC LIMIT ?2",
                        CARD_COLUMNS
                    ),
                    None,
                ),
            };
            let mut stmt = conn.prepare(&sql)?;
            let rows = match gid {
                Some(g) => stmt.query_map(params![now_ms, g, limit as i64], row_to_card)?,
                None => stmt.query_map(params![now_ms, limit as i64], row_to_card)?,
            };
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 到期卡计数（组过滤可选——组面板"复习 N"徽标数据源）。
    pub fn count_due_cards(&self, group_id: Option<i64>, now_ms: i64) -> Result<i64> {
        self.with_conn(|conn| {
            let count = match group_id {
                Some(g) => conn.query_row(
                    "SELECT COUNT(*) FROM flashcards WHERE due_at <= ?1 AND group_id = ?2",
                    params![now_ms, g],
                    |r| r.get(0),
                )?,
                None => conn.query_row(
                    "SELECT COUNT(*) FROM flashcards WHERE due_at <= ?1",
                    params![now_ms],
                    |r| r.get(0),
                )?,
            };
            Ok(count)
        })
    }

    /// 更新卡片调度状态（复习后：state_json + due_at）。
    pub fn update_card_schedule(&self, id: i64, state_json: &str, due_at: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE flashcards SET state_json = ?1, due_at = ?2 WHERE id = ?3",
                params![state_json, due_at, id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 记复习日志（弹性承诺：只记事实，不算 streak）。
    pub fn add_review_log(&self, card_id: i64, rating: &str, reviewed_at: i64) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO review_logs (card_id, rating, reviewed_at) VALUES (?1, ?2, ?3)",
                params![card_id, rating, reviewed_at],
            )?;
            Ok(())
        })
    }

    /// 组是否有复习记录（北极星组成①；经 flashcards.group_id 关联）。
    pub fn group_has_reviews(&self, group_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM review_logs l
                 JOIN flashcards c ON c.id = l.card_id
                 WHERE c.group_id = ?1",
                params![group_id],
                |r| r.get(0),
            )?;
            Ok(count > 0)
        })
    }

    /// 记指标事件（kind 契约：card_reviewed / fragment_upgraded / group_settled /
    /// self_test_done——Phase 4 门控判据）。
    pub fn add_metric_event(&self, kind: &str, payload_json: &str) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO metrics_events (kind, payload_json, created_at) VALUES (?1, ?2, ?3)",
                params![kind, payload_json, unix_seconds()],
            )?;
            Ok(())
        })
    }

    /// 指标事件计数（过程指标读数；kind 过滤）。
    pub fn count_metric_events(&self, kind: &str) -> Result<i64> {
        self.with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM metrics_events WHERE kind = ?1",
                params![kind],
                |r| r.get(0),
            )?;
            Ok(count)
        })
    }
}

/// 把 rusqlite 行映射为 Flashcard。
fn row_to_card(row: &rusqlite::Row<'_>) -> rusqlite::Result<Flashcard> {
    Ok(Flashcard {
        id: row.get(0)?,
        group_id: row.get(1)?,
        note_id: row.get(2)?,
        fragment_id: row.get(3)?,
        front: row.get(4)?,
        back: row.get(5)?,
        kind: row.get(6)?,
        state_json: row.get(7)?,
        due_at: row.get(8)?,
        created_at: row.get(9)?,
    })
}

/// 单测独立文件。
#[cfg(test)]
#[path = "db_flashcards_tests.rs"]
mod tests;
