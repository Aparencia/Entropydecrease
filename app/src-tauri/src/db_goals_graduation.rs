//! 毕业报告域：goal_graduation_reports 快照表读写（v0.18.1 REQ-255/256）。
//!
//! @ai-context: 由 db_goals.rs 按域拆出（AGENTS.md §3 单文件 ≤300 行）。快照表 FK
//!              goal_id ON DELETE SET NULL ⇒ 目标删除后报告仍可读（毕业档案区）；
//!              goal_name 冗余列即为此保留（同 notes_versions「回滚不破坏历史」哲学）。
//! @ai-context: 报告 JSON 的解析在命令层（AppError 无 serde 变体）——本文件只存取
//!              字符串；单份读 ORDER BY id DESC LIMIT 1 与全量读 ORDER BY id ASC 的
//!              不对称是既有口径（勿顺手统一）。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;

impl Db {
    // ─────────────────────── v0.18.1 毕业报告（REQ-255/256） ───────────────────────

    /// 写毕业报告快照（目标删除后保留；goal_id SET NULL——报告独立于 goals 行）。
    pub fn create_graduation_report(&self, goal_id: i64, goal_name: &str, report_json: &str) -> Result<i64> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO goal_graduation_reports (goal_id, goal_name, report_json, created_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![goal_id, goal_name, report_json, unix_seconds()],
            )?;
            Ok(conn.last_insert_rowid())
        })
    }

    /// 目标的毕业报告 JSON（无 → None——毕业仪式只发一次，防重复确认；
    /// 解析在命令层——AppError 无 serde 变体，存储态原样返回）。
    pub fn get_graduation_report_json(&self, goal_id: i64) -> Result<Option<String>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT report_json FROM goal_graduation_reports WHERE goal_id = ?1 ORDER BY id DESC LIMIT 1",
            )?;
            let mut rows = stmt.query_map(params![goal_id], |r| r.get::<_, String>(0))?;
            match rows.next() {
                Some(Ok(json)) => Ok(Some(json)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 全部毕业报告 JSON（档案区；已删目标的报告仍列出——解析在命令层）。
    pub fn list_graduation_reports_json(&self) -> Result<Vec<String>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT report_json FROM goal_graduation_reports ORDER BY id ASC")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
}
