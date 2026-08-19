//! 会话信号事件读写（REQ-108 / v0.7.0 M1.5）。
//!
//! @ai-context: session_events 表的数据层（与 db_sessions.rs 同 Db 连接，跨文件
//!              impl——db_sessions.rs 行数保护，AGENTS.md §3）。
//! @ai-context: 容量守卫：写入前查现有计数，超预算删除最旧（FIFO 语义防写放大；
//!              上限 2000 条/会话，见 session_events::over_budget）。

use rusqlite::params;

use crate::db::Db;
use crate::error::Result;
use crate::session_events::{EventKind, NewSessionEvent, SessionEvent};

impl Db {
    /// 追加一条信号事件（实时链路写入）。
    pub fn add_event(&self, new: &NewSessionEvent) -> Result<SessionEvent> {
        let conn = self.conn.lock().expect("db lock poisoned");
        // 容量守卫：超预算先删最旧（同一事务，防写放大无限增长）
        if crate::session_events::over_budget(self.count_events_locked(&conn, new.session_id)?) {
            conn.execute(
                "DELETE FROM session_events WHERE id IN (
                     SELECT id FROM session_events WHERE session_id = ?1 ORDER BY timestamp_ms ASC LIMIT 1
                 )",
                params![new.session_id],
            )?;
        }
        conn.execute(
            "INSERT INTO session_events (session_id, kind, timestamp_ms, payload_json)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                new.session_id,
                new.kind.as_str(),
                new.timestamp_ms as i64,
                new.payload.to_string(),
            ],
        )?;
        Ok(SessionEvent {
            id: conn.last_insert_rowid(),
            session_id: new.session_id,
            kind: new.kind,
            timestamp_ms: new.timestamp_ms,
            payload: new.payload.clone(),
        })
    }

    /// 列出会话全部信号事件（按时间轴升序；消费端过滤类型）。
    pub fn list_events(&self, session_id: i64) -> Result<Vec<SessionEvent>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, session_id, kind, timestamp_ms, payload_json
             FROM session_events WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
        )?;
        let rows = stmt.query_map(params![session_id], row_to_event)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 按类型列出事件（章节检测等消费端按需过滤）。
    /// @ai-context: 当前消费端（章节检测）用 list_events 全量 + 内存过滤；
    ///              本入口供 M2（REQ-125/128 播放器行为/前台切换）按类型消费，
    ///              登记豁免 dead_code（V1.0 周报聚合同样需要）。
    #[allow(dead_code)]
    pub fn list_events_by_kind(&self, session_id: i64, kind: EventKind) -> Result<Vec<SessionEvent>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, session_id, kind, timestamp_ms, payload_json
             FROM session_events WHERE session_id = ?1 AND kind = ?2 ORDER BY timestamp_ms ASC",
        )?;
        let rows = stmt.query_map(params![session_id, kind.as_str()], row_to_event)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 会话事件计数（容量守卫内部用；锁已持有）。
    fn count_events_locked(
        &self,
        conn: &rusqlite::Connection,
        session_id: i64,
    ) -> Result<usize> {
        let mut stmt = conn.prepare(
            "SELECT COUNT(*) FROM session_events WHERE session_id = ?1",
        )?;
        let n: i64 = stmt.query_row(params![session_id], |r| r.get(0))?;
        Ok(n as usize)
    }
}

/// 行映射：rusqlite 行 → SessionEvent（脏 kind 跳过——防御旧数据）。
fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionEvent> {
    let kind_str: String = row.get(2)?;
    let kind = EventKind::parse(&kind_str).unwrap_or(EventKind::FrameSwitch);
    Ok(SessionEvent {
        id: row.get(0)?,
        session_id: row.get(1)?,
        kind,
        timestamp_ms: row.get::<_, i64>(3)? as u64,
        payload: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or(serde_json::json!({})),
    })
}

#[cfg(test)]
#[path = "db_session_events_tests.rs"]
mod tests;
