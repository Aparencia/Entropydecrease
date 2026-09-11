//! 绑定域：目标↔组绑定（goal_groups）+ 组结算钩子。
//!
//! @ai-context: 由 db_goals.rs 按域拆出（AGENTS.md §3 单文件 ≤300 行）。
//!              mark_group_settled_milestones 由结算链路（commands_settlement.rs）
//!              在结算事务**之外**独立取锁调用——不得把它并进任何事务。
//! @ai-context: goal_groups 的 UNIQUE(goal_id, group_id) 是绑定幂等语义来源
//!              （DDL 在主文件 db_goals.rs 的 init）；另两条插入路径在
//!              db_goals_goal.rs（create_goal）与 db_goals_plan.rs（apply_plan_core）。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::goal_schema::{CRITERIA_GROUP_SETTLED, MILESTONE_DONE, MILESTONE_IN_PROGRESS, MILESTONE_PENDING};

impl Db {
    /// 绑定组到目标（UNIQUE 幂等：重复绑定返回 false；组不存在靠外键报错，
    /// 命令层先行校验）。
    pub fn bind_group(&self, goal_id: i64, group_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "INSERT OR IGNORE INTO goal_groups (goal_id, group_id, added_at) VALUES (?1, ?2, ?3)",
                params![goal_id, group_id, unix_seconds()],
            )?;
            Ok(affected > 0)
        })
    }

    /// 解绑组（不影响组本身：组是唯一容器，绑定只是管道）。
    pub fn unbind_group(&self, goal_id: i64, group_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "DELETE FROM goal_groups WHERE goal_id = ?1 AND group_id = ?2",
                params![goal_id, group_id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 目标绑定组 id 列表（进度聚合/详情视图数据源）。
    pub fn list_goal_group_ids(&self, goal_id: i64) -> Result<Vec<i64>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT group_id FROM goal_groups WHERE goal_id = ?1 ORDER BY id ASC")?;
            let rows = stmt.query_map(params![goal_id], |r| r.get::<_, i64>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 组结算钩子（execute_settlement 后调用）：绑该组的 group_settled
    /// 里程碑 pending/in_progress → done（自动通过，进度信号随之生效）。
    pub fn mark_group_settled_milestones(&self, group_id: i64) -> Result<usize> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let affected = conn.execute(
                &format!(
                    "UPDATE goal_milestones SET status = '{}', completed_at = ?1
                     WHERE criteria_type = '{}' AND ref_group_id = ?2
                       AND status IN ('{}', '{}')",
                    MILESTONE_DONE, CRITERIA_GROUP_SETTLED, MILESTONE_PENDING, MILESTONE_IN_PROGRESS
                ),
                params![now, group_id],
            )?;
            Ok(affected)
        })
    }
}
