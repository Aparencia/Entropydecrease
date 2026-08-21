//! 结算数据层（v0.11.3；settlements 记录 + 归档候选查询）。
//!
//! @ai-context: 结算历史是周期触发器的判据源（last_settled_at）与北极星
//!              组成③（经历过结算）；归档不删除——fragments.status 翻转可恢复。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;

impl Db {
    /// 记一次结算（stats_json=提炼/合并/归档统计）。
    pub fn create_settlement(&self, group_id: i64, stats_json: &str) -> Result<i64> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settlements (group_id, stats_json, created_at) VALUES (?1, ?2, ?3)",
                params![group_id, stats_json, now],
            )?;
            Ok(conn.last_insert_rowid() as i64)
        })
    }

    /// 组最近一次结算时刻（None=从未结算——周期判定回退建组时刻）。
    pub fn latest_settlement_at(&self, group_id: i64) -> Result<Option<i64>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT created_at FROM settlements WHERE group_id = ?1
                 ORDER BY created_at DESC LIMIT 1",
            )?;
            let mut rows = stmt.query_map(params![group_id], |r| r.get::<_, i64>(0))?;
            match rows.next() {
                Some(Ok(t)) => Ok(Some(t)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 碎片是否有闪卡绑定（归档候选判据：有卡碎片不进归档——学习循环资产）。
    pub fn fragment_has_card(&self, fragment_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM flashcards WHERE fragment_id = ?1",
                params![fragment_id],
                |r| r.get(0),
            )?;
            Ok(count > 0)
        })
    }
}

/// 单测独立文件。
#[cfg(test)]
#[path = "db_settlements_tests.rs"]
mod tests;
