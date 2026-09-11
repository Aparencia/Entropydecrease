//! 里程碑域：`goal_milestones` 实体 CRUD + 里程碑插入行 helper + 行映射。
//!
//! @ai-context: 由 db_goals.rs 按域拆出（AGENTS.md §3 单文件 ≤300 行）；主文件
//!              db_goals.rs 只留模块文档 + schema init + 子模块声明 + 测试接线。
//! @ai-context: `add_milestone_row` 是 goal_milestones **三条插入路径中两条**的
//!              共用实现——建目标事务在 db_goals_goal.rs（create_goal）、AI 规划
//!              事务在 db_goals_plan.rs（apply_plan_core）；第三条 add_milestone
//!              内联 INSERT 保持原样。**只此一份，禁止在别处复制**。
//! @ai-context: 副作用/边界：方法都走 Db::with_conn 单锁（std::sync::Mutex
//!              **不可重入**）；调用方若已持锁（事务闭包内）只能调
//!              `add_milestone_row(&Connection, …)`，不得再进 self.*。

use rusqlite::{params, Connection};

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::goal_schema::{GoalMilestone, NewMilestone, MILESTONE_DONE, MILESTONE_PENDING};

impl Db {
    /// 目标里程碑清单（order_idx 升序——计划顺序即创建语义）。
    pub fn list_milestones(&self, goal_id: i64) -> Result<Vec<GoalMilestone>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT * FROM goal_milestones WHERE goal_id = ?1 ORDER BY order_idx ASC, id ASC",
            )?;
            let rows = stmt.query_map(params![goal_id], row_to_milestone)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 新增里程碑（order_idx ≤0 时自动追加在末尾；criteria_type 白名单在命令层）。
    pub fn add_milestone(&self, goal_id: i64, new: &NewMilestone) -> Result<GoalMilestone> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let idx = conn.query_row(
                "SELECT COALESCE(MAX(order_idx), -1) + 1 FROM goal_milestones WHERE goal_id = ?1",
                params![goal_id],
                |r| r.get::<_, i64>(0),
            )?;
            let order = if new.order_idx > 0 { new.order_idx } else { idx };
            conn.execute(
                "INSERT INTO goal_milestones (goal_id, title, due_at, order_idx, status, criteria_type, ref_group_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7)",
                params![
                    goal_id, new.title, new.due_at, order, new.criteria_type,
                    new.ref_group_id, now
                ],
            )?;
            Ok(GoalMilestone {
                id: conn.last_insert_rowid(),
                goal_id,
                title: new.title.clone(),
                due_at: new.due_at,
                order_idx: order,
                status: MILESTONE_PENDING.to_string(),
                criteria_type: new.criteria_type.clone(),
                ref_group_id: new.ref_group_id,
                completed_at: None,
                created_at: now,
            })
        })
    }

    /// 更新里程碑（整段覆盖：标题/期限；顺序不在此改——增删即重排语义）。
    pub fn update_milestone(&self, id: i64, title: &str, due_at: Option<i64>) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE goal_milestones SET title = ?2, due_at = ?3 WHERE id = ?1",
                params![id, title, due_at],
            )?;
            Ok(affected > 0)
        })
    }

    /// 按 id 读取里程碑（旧状态读取——状态流转前判据，不存在 → None）。
    pub fn get_milestone(&self, id: i64) -> Result<Option<GoalMilestone>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT * FROM goal_milestones WHERE id = ?1")?;
            let mut rows = stmt.query_map(params![id], row_to_milestone)?;
            match rows.next() {
                Some(Ok(m)) => Ok(Some(m)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 删除里程碑（不存在 → false）。
    pub fn delete_milestone(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM goal_milestones WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }

    /// 里程碑状态流转（done 写 completed_at；非完成态清空——状态机白名单在命令层）。
    pub fn set_milestone_status(&self, id: i64, status: &str) -> Result<bool> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE goal_milestones SET status = ?2,
                 completed_at = CASE WHEN ?3 THEN ?4 ELSE NULL END
                 WHERE id = ?1",
                params![id, status, status == MILESTONE_DONE, now],
            )?;
            Ok(affected > 0)
        })
    }
}

/// 里程碑插入行（create_goal 事务与 add_milestone 共用；criteria_type 默认 manual）。
pub(super) fn add_milestone_row(
    conn: &Connection,
    goal_id: i64,
    m: &NewMilestone,
    order_idx: i64,
    now: i64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO goal_milestones (goal_id, title, due_at, order_idx, status, criteria_type, ref_group_id, created_at)
         VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7)",
        params![goal_id, m.title, m.due_at, order_idx, m.criteria_type, m.ref_group_id, now],
    )?;
    Ok(())
}

/// goal_milestones 行 → GoalMilestone。
fn row_to_milestone(row: &rusqlite::Row<'_>) -> rusqlite::Result<GoalMilestone> {
    Ok(GoalMilestone {
        id: row.get(0)?,
        goal_id: row.get(1)?,
        title: row.get(2)?,
        due_at: row.get(3)?,
        order_idx: row.get(4)?,
        status: row.get(5)?,
        criteria_type: row.get(6)?,
        ref_group_id: row.get(7)?,
        completed_at: row.get(8)?,
        created_at: row.get(9)?,
    })
}
