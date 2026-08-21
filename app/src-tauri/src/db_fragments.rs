//! 碎片数据层（v0.11.1；fragments 原料层 CRUD）。
//!
//! @ai-context: 碎片与笔记分表是 v4 契约明确要求（不与课程笔记混装）；
//!              本层只管读写——DomainTag 归组判定在 commands_fragments.rs
//!              （复用 detect_domain 纯函数），组 CRUD 在 db_note_groups.rs。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::Fragment;

/// fragments 表统一查询列（列顺序与 row_to_fragment 严格对应）。
const FRAGMENT_COLUMNS: &str =
    "id, text, image_path, domain_tag, group_id, source, status, created_at";

/// 新建碎片入参（id/created_at 由数据层填充）。
pub struct NewFragment {
    pub text: String,
    pub image_path: Option<String>,
    pub domain_tag: Option<String>,
    pub group_id: Option<i64>,
    pub source: String,
}

impl Db {
    /// 新建碎片，返回完整记录。
    pub fn create_fragment(&self, new: &NewFragment) -> Result<Fragment> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO fragments (text, image_path, domain_tag, group_id, source, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)",
                params![new.text, new.image_path, new.domain_tag, new.group_id, new.source, now],
            )?;
            let id = conn.last_insert_rowid();
            Ok(Fragment {
                id,
                text: new.text.clone(),
                image_path: new.image_path.clone(),
                domain_tag: new.domain_tag.clone(),
                group_id: new.group_id,
                source: new.source.clone(),
                status: "active".to_string(),
                created_at: now,
            })
        })
    }

    /// 列出碎片（status 过滤：active/archived/None=全部；按创建时间倒序，
    /// 同秒按 id 倒序——id 单调递增，后者更新，排序稳定）。
    pub fn list_fragments(&self, status: Option<&str>, limit: usize) -> Result<Vec<Fragment>> {
        self.with_conn(|conn| {
            let sql = match status {
                Some(_) => format!(
                    "SELECT {} FROM fragments WHERE status = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2",
                    FRAGMENT_COLUMNS
                ),
                None => format!(
                    "SELECT {} FROM fragments ORDER BY created_at DESC, id DESC LIMIT ?1",
                    FRAGMENT_COLUMNS
                ),
            };
            let mut stmt = conn.prepare(&sql)?;
            let rows = match status {
                Some(s) => stmt.query_map(params![s, limit as i64], row_to_fragment)?,
                None => stmt.query_map(params![limit as i64], row_to_fragment)?,
            };
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 按组列出碎片（组详情/结算消费；仅 active——归档项不进学习循环）。
    pub fn list_fragments_by_group(&self, group_id: i64) -> Result<Vec<Fragment>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM fragments
                 WHERE group_id = ?1 AND status = 'active'
                 ORDER BY created_at DESC, id DESC",
                FRAGMENT_COLUMNS
            ))?;
            let rows = stmt.query_map(params![group_id], row_to_fragment)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 碎片计数（组结算触发信号；按组+status 统计）。
    /// 登记豁免 dead_code：结算触发器当前用 list 长度折算，计数接口留
    /// 给 v0.11.3+ 阈值埋点面板消费。
    #[allow(dead_code)]
    pub fn count_fragments(&self, group_id: Option<i64>, status: Option<&str>) -> Result<i64> {
        self.with_conn(|conn| {
            let mut sql = "SELECT COUNT(*) FROM fragments WHERE 1=1".to_string();
            if group_id.is_some() {
                sql.push_str(" AND group_id = ?1");
            }
            if status.is_some() {
                sql.push_str(if group_id.is_some() { " AND status = ?2" } else { " AND status = ?1" });
            }
            let mut stmt = conn.prepare(&sql)?;
            let count = match (group_id, status) {
                (Some(g), Some(s)) => stmt.query_row(params![g, s], |r| r.get(0))?,
                (Some(g), None) => stmt.query_row(params![g], |r| r.get(0))?,
                (None, Some(s)) => stmt.query_row(params![s], |r| r.get(0))?,
                (None, None) => stmt.query_row([], |r| r.get(0))?,
            };
            Ok(count)
        })
    }

    /// 移动碎片到组（None=移出；用户纠错/结算归组共用）。
    /// 登记豁免 dead_code：碎片移动 UI 随 v0.11.3+ 结算面建设接线。
    #[allow(dead_code)]
    pub fn update_fragment_group(&self, id: i64, group_id: Option<i64>) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE fragments SET group_id = ?1 WHERE id = ?2",
                params![group_id, id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 标记碎片状态（v0.11.3 结算归档：active↔archived）。
    pub fn set_fragment_status(&self, id: i64, status: &str) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE fragments SET status = ?1 WHERE id = ?2",
                params![status, id],
            )?;
            Ok(affected > 0)
        })
    }
}

/// 把 rusqlite 行映射为 Fragment。
fn row_to_fragment(row: &rusqlite::Row<'_>) -> rusqlite::Result<Fragment> {
    Ok(Fragment {
        id: row.get(0)?,
        text: row.get(1)?,
        image_path: row.get(2)?,
        domain_tag: row.get(3)?,
        group_id: row.get(4)?,
        source: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get(7)?,
    })
}

/// 单测独立文件。
#[cfg(test)]
#[path = "db_fragments_tests.rs"]
mod tests;
