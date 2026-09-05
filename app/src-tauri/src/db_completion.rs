//! 完成史统一事件表（v0.20.3 / REQ-298）。
//!
//! @ai-context: done/abandoned/exported/export_manual_done/practice_tick/sop_run
//!              全形态统一留痕——周回顾原料与成长轨迹唯一数据源（完成即证据）；
//!              source_type/source_id 指向事件来源（任务行/练习条目/run/导出），
//!              text=快照（正文后来被改仍可追溯），meta=JSON（迁出通道/链接等）。
//! @ai-context: 只记史不改正文——迁出回填（手动完成）也只在此插 export_manual_done。

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::Db;
use crate::error::Result;

/// 事件类型。
pub const EV_DONE: &str = "done";
pub const EV_ABANDONED: &str = "abandoned";
pub const EV_EXPORTED: &str = "exported";
pub const EV_EXPORT_MANUAL_DONE: &str = "export_manual_done";
pub const EV_PRACTICE_TICK: &str = "practice_tick";
pub const EV_SOP_RUN: &str = "sop_run";

/// 完成史行（表 completion_history 1:1）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionEvent {
    pub id: i64,
    /// Unix 秒
    pub ts: i64,
    /// done | abandoned | exported | export_manual_done | practice_tick | sop_run
    pub event_type: String,
    /// task_line | practice_item | sop_run | learning_action | export
    pub source_type: String,
    pub source_id: Option<i64>,
    pub note_id: Option<i64>,
    /// 事件文本快照（正文可改仍可追溯）
    pub text: String,
    /// 放弃原因等备注
    pub note: Option<String>,
    /// 迁出通道/链接等（JSON 可空）
    pub meta_json: Option<String>,
}

/// 建表（幂等；db_migrations 尾链挂）。
pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS completion_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id INTEGER,
            note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
            text TEXT NOT NULL,
            note TEXT,
            meta_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_completion_ts ON completion_history(ts DESC);
        CREATE INDEX IF NOT EXISTS idx_completion_note ON completion_history(note_id);
        ",
    )?;
    Ok(())
}

impl Db {
    /// 插一条完成史（周回顾原料唯一数据源）。
    pub fn add_completion_event(
        &self,
        event_type: &str,
        source_type: &str,
        source_id: Option<i64>,
        note_id: Option<i64>,
        text: &str,
        note: Option<&str>,
        meta_json: Option<&str>,
    ) -> Result<i64> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO completion_history (ts, event_type, source_type, source_id, note_id, text, note, meta_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    crate::db::unix_seconds(),
                    event_type,
                    source_type,
                    source_id,
                    note_id,
                    text,
                    note,
                    meta_json
                ],
            )?;
            Ok(conn.last_insert_rowid())
        })
    }

    /// 列完成史（limit 有界；event_type=None=全部；note_id=None=全部笔记）。
    pub fn list_completion_events(
        &self,
        event_type: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CompletionEvent>> {
        let limit = limit.min(500) as i64;
        self.with_conn(|conn| {
            let rows = match event_type {
                Some(et) => {
                    let mut stmt = conn.prepare(
                        "SELECT id, ts, event_type, source_type, source_id, note_id, text, note, meta_json
                         FROM completion_history WHERE event_type = ?1
                         ORDER BY ts DESC, id DESC LIMIT ?2",
                    )?;
                    let mapped = stmt.query_map(params![et, limit], row_to_event)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
                None => {
                    let mut stmt = conn.prepare(
                        "SELECT id, ts, event_type, source_type, source_id, note_id, text, note, meta_json
                         FROM completion_history
                         ORDER BY ts DESC, id DESC LIMIT ?1",
                    )?;
                    let mapped = stmt.query_map(params![limit], row_to_event)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
            };
            Ok(rows)
        })
    }
}

fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<CompletionEvent> {
    Ok(CompletionEvent {
        id: row.get(0)?,
        ts: row.get(1)?,
        event_type: row.get(2)?,
        source_type: row.get(3)?,
        source_id: row.get(4)?,
        note_id: row.get(5)?,
        text: row.get(6)?,
        note: row.get(7)?,
        meta_json: row.get(8)?,
    })
}

#[cfg(test)]
#[path = "db_completion_tests.rs"]
mod tests;
