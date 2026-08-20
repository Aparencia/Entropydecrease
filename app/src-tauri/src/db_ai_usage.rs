//! AI 成本记录数据层（REQ-143 完整：note_ai_usage 落库）。
//!
//! @ai-context: 操作类型（refine/enrich）/token 输入输出/费用/模型/切片数
//!              逐条落库——预估与实际偏差比对的数据源（校准单价表，M4）；
//!              版本时间线 UI 与逐会话成本报表（UI 待需求，数据已备——
//!              v0.8.0 明确不做报表 UI）消费本表。

use rusqlite::{params, Connection};

use crate::db::Db;
use crate::error::Result;

/// AI 成本记录行。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageRecord {
    pub id: i64,
    pub note_id: i64,
    /// 操作类型：refine | enrich
    pub op_type: String,
    pub tokens_in: usize,
    pub tokens_out: usize,
    pub cost_yuan: f64,
    pub model: String,
    pub slices: usize,
    pub created_at: i64,
}

/// 建表（幂等——db.rs open 调用；删笔记级联清理）。
pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS note_ai_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            op_type TEXT NOT NULL,
            tokens_in INTEGER NOT NULL,
            tokens_out INTEGER NOT NULL,
            cost_yuan REAL NOT NULL,
            model TEXT NOT NULL,
            slices INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_note ON note_ai_usage(note_id, created_at);",
    )?;
    Ok(())
}

/// AI 成本记录入参（record_ai_usage 聚合——避免 8 参数元组，clippy too_many_arguments）。
#[derive(Debug, Clone)]
pub struct AiUsageInput {
    pub op_type: &'static str,
    pub tokens_in: usize,
    pub tokens_out: usize,
    pub cost_yuan: f64,
    pub model: String,
    pub slices: usize,
}

impl Db {
    /// 落库一条成本记录（token 估算见 ai_cost——与预估同口径）。
    pub fn record_ai_usage(&self, note_id: i64, input: &AiUsageInput) -> Result<AiUsageRecord> {
        let now = crate::db_sessions_rows::unix_seconds();
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO note_ai_usage (note_id, op_type, tokens_in, tokens_out, cost_yuan, model, slices, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                note_id,
                input.op_type,
                input.tokens_in,
                input.tokens_out,
                input.cost_yuan,
                input.model,
                input.slices,
                now
            ],
        )?;
        let id = conn.last_insert_rowid();
        Ok(AiUsageRecord {
            id,
            note_id,
            op_type: input.op_type.to_string(),
            tokens_in: input.tokens_in,
            tokens_out: input.tokens_out,
            cost_yuan: input.cost_yuan,
            model: input.model.clone(),
            slices: input.slices,
            created_at: now,
        })
    }

    /// 笔记成本记录（旧→新；版本时间线展示）。
    pub fn list_ai_usage(&self, note_id: i64) -> Result<Vec<AiUsageRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, note_id, op_type, tokens_in, tokens_out, cost_yuan, model, slices, created_at
             FROM note_ai_usage WHERE note_id = ?1 ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![note_id], |r| {
            Ok(AiUsageRecord {
                id: r.get(0)?,
                note_id: r.get(1)?,
                op_type: r.get(2)?,
                tokens_in: r.get(3)?,
                tokens_out: r.get(4)?,
                cost_yuan: r.get(5)?,
                model: r.get(6)?,
                slices: r.get(7)?,
                created_at: r.get(8)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}
