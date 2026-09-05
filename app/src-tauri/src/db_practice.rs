//! 练习条目表（v0.20.3 / REQ-299）。
//!
//! @ai-context: 练习=内建「习得」行动（判定树：驱动习得且在熵减上下文内执行），
//!              闪卡之外第二条复利曲线：frequency daily|manual 二型（v1），
//!              mastery 1-5 熟练度人工自评，next_due 由打点推进（daily=次日；
//!              宽容缺勤——只记史不追债，JCR 破罐破摔防御）；打点=completion_history
//!              practice_tick 事件（练习曲线由史聚合，不另建 tick 表——YAGNI）。

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::Db;
use crate::error::Result;

pub const FREQ_DAILY: &str = "daily";
pub const FREQ_MANUAL: &str = "manual";
pub const ITEM_ACTIVE: &str = "active";
pub const ITEM_PAUSED: &str = "paused";
pub const ITEM_ARCHIVED: &str = "archived";

/// 练习条目行。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeItem {
    pub id: i64,
    pub note_id: Option<i64>,
    pub kb_concept_id: Option<i64>,
    pub text: String,
    pub frequency: String,
    pub goal: Option<String>,
    /// 熟练度自评 1-5（None=未评）
    pub mastery: Option<i64>,
    pub next_due: Option<i64>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS practice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
            kb_concept_id INTEGER,
            text TEXT NOT NULL,
            frequency TEXT NOT NULL DEFAULT 'manual',
            goal TEXT,
            mastery INTEGER,
            next_due INTEGER,
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_practice_due ON practice_items(status, next_due);
        ",
    )?;
    Ok(())
}

impl Db {
    pub fn create_practice_item(&self, text: &str, frequency: &str, goal: Option<&str>) -> Result<i64> {
        let freq = if frequency == FREQ_DAILY { FREQ_DAILY } else { FREQ_MANUAL };
        let now = crate::db::unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO practice_items (text, frequency, goal, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'active', ?4, ?4)",
                params![text, freq, goal, now],
            )?;
            Ok(conn.last_insert_rowid())
        })
    }

    pub fn list_practice_items(&self, status: Option<&str>) -> Result<Vec<PracticeItem>> {
        self.with_conn(|conn| {
            let rows = match status {
                Some(s) => {
                    let mut stmt = conn.prepare(
                        "SELECT id, note_id, kb_concept_id, text, frequency, goal, mastery, next_due, status, created_at, updated_at
                         FROM practice_items WHERE status = ?1 ORDER BY next_due IS NOT NULL DESC, next_due ASC, id DESC",
                    )?;
                    let mapped = stmt.query_map(params![s], row_to_item)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
                None => {
                    let mut stmt = conn.prepare(
                        "SELECT id, note_id, kb_concept_id, text, frequency, goal, mastery, next_due, status, created_at, updated_at
                         FROM practice_items ORDER BY next_due IS NOT NULL DESC, next_due ASC, id DESC",
                    )?;
                    let mapped = stmt.query_map([], row_to_item)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
            };
            Ok(rows)
        })
    }

    /// 打点（练习 tick）：事件入史 + 推进 next_due（daily=次日/手动=清空）；
    /// mastery 可随打点更新（1-5 自评）。
    pub fn practice_tick(&self, item_id: i64, mastery: Option<i64>) -> Result<bool> {
        let Some(item) = self.get_practice_item(item_id)? else { return Ok(false) };
        if item.status != ITEM_ACTIVE {
            return Err(crate::error::AppError::Asr("条目非 active 状态不可打点".to_string()));
        }
        let now = crate::db::unix_seconds();
        let next = if item.frequency == FREQ_DAILY { Some(now + 86_400) } else { None };
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE practice_items SET next_due = ?1, mastery = COALESCE(?2, mastery), updated_at = ?3 WHERE id = ?4",
                params![next, mastery, now, item_id],
            )?;
            Ok(())
        })?;
        self.add_completion_event(
            crate::db_completion::EV_PRACTICE_TICK,
            "practice_item",
            Some(item_id),
            item.note_id,
            &item.text,
            None,
            Some(&serde_json::json!({ "frequency": item.frequency }).to_string()),
        )?;
        Ok(true)
    }

    pub fn get_practice_item(&self, item_id: i64) -> Result<Option<PracticeItem>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, note_id, kb_concept_id, text, frequency, goal, mastery, next_due, status, created_at, updated_at
                 FROM practice_items WHERE id = ?1",
            )?;
            let mut mapped = stmt.query_map(params![item_id], row_to_item)?;
            match mapped.next() {
                Some(r) => r.map(Some).map_err(Into::into),
                None => Ok(None),
            }
        })
    }

    pub fn set_practice_status(&self, item_id: i64, status: &str) -> Result<bool> {
        if !matches!(status, ITEM_ACTIVE | ITEM_PAUSED | ITEM_ARCHIVED) {
            return Err(crate::error::AppError::Asr("非法条目状态".to_string()));
        }
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE practice_items SET status = ?1, updated_at = ?2 WHERE id = ?3",
                params![status, crate::db::unix_seconds(), item_id],
            )?;
            Ok(affected > 0)
        })
    }
}

fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<PracticeItem> {
    Ok(PracticeItem {
        id: row.get(0)?,
        note_id: row.get(1)?,
        kb_concept_id: row.get(2)?,
        text: row.get(3)?,
        frequency: row.get(4)?,
        goal: row.get(5)?,
        mastery: row.get(6)?,
        next_due: row.get(7)?,
        status: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[cfg(test)]
#[path = "db_practice_tests.rs"]
mod tests;
