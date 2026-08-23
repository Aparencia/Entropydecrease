//! 知识审计数据层（v0.13.1 REQ-202；db_* 拆分模式同款）。
//!
//! @ai-context: knowledge_audits 表读写。v0.13.1 仅留表（审计界面/结算属 v0.13.4），
//!              本层已备好"记录 + 最近审计时刻"读取，供 audit_due 探测用
//!              （M2 `audit_due_for_system` 前置读）。
//! @ai-context: 时间戳一律 unix_seconds()（秒）；latest_audit_at_ms 特供审计信号
//!              纯函数（毫秒口径），故换算返回。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic）。
//!
//! @ai-context: M1 数据层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::KnowledgeAudit;

/// knowledge_audits 表统一查询列（列顺序与 row_to_audit 严格对应）。
const AUDIT_COLUMNS: &str = "id, system_id, items_json, stats_json, created_at";

impl Db {
    /// 记录一次审计（v0.13.4 起 items/stats 有真实载荷；v0.13.1 先落空档）。
    pub fn add_knowledge_audit(
        &self,
        system_id: i64,
        items_json: &str,
        stats_json: &str,
    ) -> Result<KnowledgeAudit> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_audits (system_id, items_json, stats_json, created_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![system_id, items_json, stats_json, now],
            )?;
            let id = conn.last_insert_rowid();
            Ok(KnowledgeAudit {
                id,
                system_id,
                items_json: items_json.to_string(),
                stats_json: stats_json.to_string(),
                created_at: now,
            })
        })
    }

    /// 列出体系审计记录（新→旧）。
    pub fn list_knowledge_audits(&self, system_id: i64) -> Result<Vec<KnowledgeAudit>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_audits WHERE system_id = ?1 ORDER BY created_at DESC, id DESC",
                AUDIT_COLUMNS
            ))?;
            let rows = stmt.query_map(params![system_id], row_to_audit)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 最近审计时刻（毫秒；None=从未审计——审计信号 last_audit_at_ms 用）。
    ///
    /// @ai-context: DB 以秒存储（unix_seconds 惯例），审计信号纯函数 audit_due
    ///              约定毫秒口径（spec §三 AuditSignal）——此处换算为毫秒返回，
    ///              M2 探测直接喂入 audit_due 无需再转。
    pub fn latest_audit_at_ms(&self, system_id: i64) -> Result<Option<i64>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT created_at FROM knowledge_audits WHERE system_id = ?1
                 ORDER BY created_at DESC, id DESC LIMIT 1",
            )?;
            let mut rows = stmt.query_map(params![system_id], |r| r.get::<_, i64>(0))?;
            match rows.next() {
                Some(Ok(secs)) => Ok(Some(secs * 1000)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }
}

/// 把 rusqlite 行映射为 KnowledgeAudit。
fn row_to_audit(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeAudit> {
    Ok(KnowledgeAudit {
        id: row.get(0)?,
        system_id: row.get(1)?,
        items_json: row.get(2)?,
        stats_json: row.get(3)?,
        created_at: row.get(4)?,
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_knowledge_audits_tests.rs"]
mod tests;
