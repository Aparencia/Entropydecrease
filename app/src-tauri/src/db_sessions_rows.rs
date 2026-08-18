//! 会话数据行映射（db_sessions.rs 拆分，保持主文件 ≤300 行——AGENTS.md §3）。
//!
//! @ai-context: row_to_* 为 rusqlite 行 → 领域类型映射纯函数；unix_seconds 为时间工具。

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Row;

use crate::types::{Session, SessionOcrBlock, SessionSegment};

/// 把 rusqlite 行映射为 Session。
pub fn row_to_session(row: &Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        source_window: row.get(2)?,
        started_at: row.get(3)?,
        ended_at: row.get(4)?,
        status: row.get(5)?,
        profile: row.get(6)?,
    })
}

/// 把 rusqlite 行映射为 SessionSegment。
pub fn row_to_segment(row: &Row<'_>) -> rusqlite::Result<SessionSegment> {
    Ok(SessionSegment {
        id: row.get(0)?,
        session_id: row.get(1)?,
        start_ms: row.get::<_, i64>(2)? as u64,
        end_ms: row.get::<_, i64>(3)? as u64,
        text: row.get(4)?,
        source: row.get(5)?,
        confidence: row.get(6)?,
    })
}

/// 把 rusqlite 行映射为 SessionOcrBlock。
pub fn row_to_ocr_block(row: &Row<'_>) -> rusqlite::Result<SessionOcrBlock> {
    Ok(SessionOcrBlock {
        id: row.get(0)?,
        session_id: row.get(1)?,
        timestamp_ms: row.get::<_, i64>(2)? as u64,
        text: row.get(3)?,
        score: row.get(4)?,
        region: row.get(5)?,
    })
}

/// 当前 Unix 秒。
pub fn unix_seconds() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}
