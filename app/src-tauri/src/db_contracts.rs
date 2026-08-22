//! 周契约数据层（v0.11.4 REQ-200；弹性承诺呈现层）。
//!
//! @ai-context: contracts 表按 (group_id, week_start) 唯一——每周每组一份契约，
//!              upsert 幂等覆盖本周（改目标即改承诺，不产生历史噪音）；
//!              完成度取数（review_logs JOIN flashcards 按组+周过滤）在本层，
//!              聚合纯函数在 week_contract.rs（周界/去重口径单一）。
//! @ai-context: 弹性承诺纪律——本层只读写事实，不算 streak、不追债、不惩罚。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::WeekContract;
use crate::week_contract::WEEK_SECS;

/// contracts 表统一查询列（列顺序与 row_to_contract 严格对应）。
const CONTRACT_COLUMNS: &str = "id, group_id, week_start, target_days, target_cards, created_at";

impl Db {
    /// 幂等写入本周契约（同组同周已存在 → 覆盖目标值；created_at 刷新）。
    ///
    /// @ai-context: ON CONFLICT DO UPDATE——用户改目标即改承诺（无历史版本，
    ///              弹性承诺不记恩怨，只记当前约定）；外键组不存在报错。
    pub fn upsert_week_contract(
        &self,
        group_id: i64,
        week_start: i64,
        target_days: i64,
        target_cards: i64,
    ) -> Result<WeekContract> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO contracts (group_id, week_start, target_days, target_cards, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(group_id, week_start) DO UPDATE SET
                     target_days = excluded.target_days,
                     target_cards = excluded.target_cards,
                     created_at = excluded.created_at",
                params![group_id, week_start, target_days, target_cards, now],
            )?;
            let id = conn.last_insert_rowid();
            Ok(WeekContract {
                id,
                group_id,
                week_start,
                target_days,
                target_cards,
                created_at: now,
            })
        })
    }

    /// 读取指定周契约（无 → None——本周未立约，UI 显示设定表单）。
    pub fn get_week_contract(&self, group_id: i64, week_start: i64) -> Result<Option<WeekContract>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM contracts WHERE group_id = ?1 AND week_start = ?2",
                CONTRACT_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![group_id, week_start], row_to_contract)?;
            match rows.next() {
                Some(Ok(c)) => Ok(Some(c)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 组在某周（含）之后的复习时刻列表（周契约实际完成度取数）。
    ///
    /// @ai-context: JOIN flashcards 按组过滤（review_logs 无组概念，弹性承诺
    ///              日志只记卡）；范围 [week_start, week_start+7d) 左闭右开——
    ///              下一周周一零点归下周，周界不重叠。
    /// @ai-context: 审查修复（2026-08-22）：review_logs.reviewed_at 由 review_card
    ///              以毫秒写入（now_ms），而 week_start 为秒——边界须乘 1000
    ///              转毫秒，否则秒级边界永远小于毫秒级数据（完成度恒零）。
    pub fn review_ats_in_week(&self, group_id: i64, week_start: i64) -> Result<Vec<i64>> {
        self.with_conn(|conn| {
            let start_ms = week_start * 1000;
            let end_ms = (week_start + WEEK_SECS) * 1000;
            let mut stmt = conn.prepare(
                "SELECT l.reviewed_at FROM review_logs l
                 JOIN flashcards c ON c.id = l.card_id
                 WHERE c.group_id = ?1 AND l.reviewed_at >= ?2 AND l.reviewed_at < ?3
                 ORDER BY l.reviewed_at ASC",
            )?;
            let rows = stmt.query_map(params![group_id, start_ms, end_ms], |r| r.get(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
}

/// 把 rusqlite 行映射为 WeekContract。
fn row_to_contract(row: &rusqlite::Row<'_>) -> rusqlite::Result<WeekContract> {
    Ok(WeekContract {
        id: row.get(0)?,
        group_id: row.get(1)?,
        week_start: row.get(2)?,
        target_days: row.get(3)?,
        target_cards: row.get(4)?,
        created_at: row.get(5)?,
    })
}

/// 单测独立文件。
#[cfg(test)]
#[path = "db_contracts_tests.rs"]
mod tests;
