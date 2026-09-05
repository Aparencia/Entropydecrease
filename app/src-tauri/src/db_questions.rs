//! 问题清单表（v0.20.3 / REQ-300 —— Me 问题化正式机制）。
//!
//! @ai-context: 洞见/疑问提炼为问题（独立问题清单——不混入笔记流）：text=用户
//!              改写问句或原疑问；context=来源段快照+回链（JSON）；status
//!              open|answered|archived；answer_ref=答沉淀处回链（笔记/卡 id 语义
//!              JSON）——答沉淀后可转复习卡（G7 同接口，P2 登记）。

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::Db;
use crate::error::Result;

pub const Q_OPEN: &str = "open";
pub const Q_ANSWERED: &str = "answered";
pub const Q_ARCHIVED: &str = "archived";

/// 问题行。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionItem {
    pub id: i64,
    pub note_id: Option<i64>,
    pub kb_concept_id: Option<i64>,
    pub text: String,
    /// 来源段快照+回链（JSON，可空）
    pub context: Option<String>,
    pub status: String,
    /// 答沉淀处回链（JSON {kind:note|card,id}）
    pub answer_ref: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
            kb_concept_id INTEGER,
            text TEXT NOT NULL,
            context TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            answer_ref TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status, created_at DESC);
        ",
    )?;
    Ok(())
}

impl Db {
    pub fn create_question(&self, text: &str, note_id: Option<i64>, context: Option<&str>) -> Result<i64> {
        let now = crate::db::unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO questions (note_id, text, context, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'open', ?4, ?4)",
                params![note_id, text, context, now],
            )?;
            Ok(conn.last_insert_rowid())
        })
    }

    pub fn list_questions(&self, status: Option<&str>) -> Result<Vec<QuestionItem>> {
        self.with_conn(|conn| {
            let rows = match status {
                Some(s) => {
                    let mut stmt = conn.prepare(
                        "SELECT id, note_id, kb_concept_id, text, context, status, answer_ref, created_at, updated_at
                         FROM questions WHERE status = ?1 ORDER BY created_at DESC, id DESC",
                    )?;
                    let mapped = stmt.query_map(params![s], row_to_q)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
                None => {
                    let mut stmt = conn.prepare(
                        "SELECT id, note_id, kb_concept_id, text, context, status, answer_ref, created_at, updated_at
                         FROM questions ORDER BY created_at DESC, id DESC",
                    )?;
                    let mapped = stmt.query_map([], row_to_q)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
            };
            Ok(rows)
        })
    }

    /// 标记已答（answer_ref=答沉淀处回链 JSON）+ 归档由命令层转调。
    pub fn answer_question(&self, id: i64, answer_ref: Option<&str>) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE questions SET status = 'answered', answer_ref = ?1, updated_at = ?2 WHERE id = ?3",
                params![answer_ref, crate::db::unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    pub fn set_question_status(&self, id: i64, status: &str) -> Result<bool> {
        if !matches!(status, Q_OPEN | Q_ANSWERED | Q_ARCHIVED) {
            return Err(crate::error::AppError::Asr("非法问题状态".to_string()));
        }
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE questions SET status = ?1, updated_at = ?2 WHERE id = ?3",
                params![status, crate::db::unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }
}

fn row_to_q(row: &rusqlite::Row<'_>) -> rusqlite::Result<QuestionItem> {
    Ok(QuestionItem {
        id: row.get(0)?,
        note_id: row.get(1)?,
        kb_concept_id: row.get(2)?,
        text: row.get(3)?,
        context: row.get(4)?,
        status: row.get(5)?,
        answer_ref: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

#[cfg(test)]
#[path = "db_questions_tests.rs"]
mod tests;
