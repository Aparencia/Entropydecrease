//! 目标域：goals 实体 CRUD（含事务建目标）+ goals 行映射。
//!
//! @ai-context: 由 db_goals.rs 按域拆出（AGENTS.md §3 单文件 ≤300 行）。create_goal
//!              是**唯一**跨表显式事务写（goals + goal_milestones 草案 + goal_groups
//!              初始绑定）；里程碑插入复用 db_goals_milestone.rs 的 add_milestone_row
//!              （与 db_goals_plan.rs 的 apply_plan_core 共用同一份实现）。
//! @ai-context: 副作用/边界：with_conn 单锁不可重入——事务闭包内不得再调 self.*；
//!              返回值在事务内组装、**不重读库**（既有语义，勿改成 get_goal 重读）。
//! @ai-context: `SELECT *` + 位置索引（row_to_goal）与主文件 init 的列顺序是隐性
//!              契约——给 goals 加列必须两处同步。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::goal_schema::{Goal, NewGoal};

use super::milestone::add_milestone_row;

impl Db {
    /// 新建目标（事务：goal + 里程碑草案 + 初始绑定组；status=active 一步到位）。
    pub fn create_goal(&self, new: &NewGoal) -> Result<Goal> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;
            tx.execute(
                "INSERT INTO goals (name, domain_tag, status, horizon_end, success_criteria_json, intent_json, created_at, updated_at)
                 VALUES (?1, ?2, 'active', ?3, ?4, ?5, ?6, ?6)",
                params![
                    new.name,
                    new.domain_tag,
                    new.horizon_end,
                    new.success_criteria_json,
                    new.intent_json,
                    now
                ],
            )?;
            let goal_id = tx.last_insert_rowid();
            for (idx, m) in new.milestones.iter().enumerate() {
                add_milestone_row(&tx, goal_id, m, idx as i64, now)?;
            }
            for gid in &new.group_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO goal_groups (goal_id, group_id, added_at) VALUES (?1, ?2, ?3)",
                    params![goal_id, gid, now],
                )?;
            }
            tx.commit()?;
            Ok(Goal {
                id: goal_id,
                name: new.name.clone(),
                domain_tag: new.domain_tag.clone(),
                status: "active".to_string(),
                horizon_end: new.horizon_end,
                success_criteria_json: new.success_criteria_json.clone(),
                intent_json: new.intent_json.clone(),
                created_at: now,
                completed_at: None,
                updated_at: now,
            })
        })
    }

    /// 全部目标（列表页；按创建时间倒序——同秒并列时按 id 倒序，顺序确定）。
    pub fn list_goals(&self) -> Result<Vec<Goal>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT * FROM goals ORDER BY created_at DESC, id DESC")?;
            let rows = stmt.query_map([], row_to_goal)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 按 id 读取目标（不存在 → None）。
    pub fn get_goal(&self, id: i64) -> Result<Option<Goal>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT * FROM goals WHERE id = ?1")?;
            let mut rows = stmt.query_map(params![id], row_to_goal)?;
            match rows.next() {
                Some(Ok(g)) => Ok(Some(g)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 更新目标元数据（名称/领域/时限/判据配方/访谈答案——重访谈配方重推入口）。
    pub fn update_goal_core(
        &self,
        id: i64,
        name: &str,
        domain_tag: Option<&str>,
        horizon_end: Option<i64>,
        success_criteria_json: &str,
        intent_json: &str,
    ) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE goals SET name = ?2, domain_tag = ?3, horizon_end = ?4,
                 success_criteria_json = ?5, intent_json = ?6, updated_at = ?7
                 WHERE id = ?1",
                params![id, name, domain_tag, horizon_end, success_criteria_json, intent_json, unix_seconds()],
            )?;
            Ok(affected > 0)
        })
    }

    /// 状态转移（graduated/abandoned 时写 completed_at；恢复后清空）。
    pub fn set_goal_status(&self, id: i64, status: &str) -> Result<bool> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE goals SET status = ?2, completed_at = CASE WHEN ?3 THEN ?4 ELSE NULL END, updated_at = ?4
                 WHERE id = ?1",
                params![id, status, status == "graduated" || status == "abandoned", now],
            )?;
            Ok(affected > 0)
        })
    }

    /// 删除目标（里程碑/绑定随 FK CASCADE；毕业快照保留属 M2——M1 无快照表）。
    pub fn delete_goal(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM goals WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }
}

/// goals 行 → Goal。
fn row_to_goal(row: &rusqlite::Row<'_>) -> rusqlite::Result<Goal> {
    Ok(Goal {
        id: row.get(0)?,
        name: row.get(1)?,
        domain_tag: row.get(2)?,
        status: row.get(3)?,
        horizon_end: row.get(4)?,
        success_criteria_json: row.get(5)?,
        intent_json: row.get(6)?,
        created_at: row.get(7)?,
        completed_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}
