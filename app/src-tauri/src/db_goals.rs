//! 学习目标数据层（v0.18.0 REQ-248；goals 三表 CRUD + 综合查询）。
//!
//! @ai-context: 意图层对象（规格 §五）——goals 主表 + goal_milestones（判据
//!              型里程碑）+ goal_groups（N:M 绑定，组仍是唯一容器不可破）。
//!              建表幂等（init 在 db_migrations::init_schema 末尾调用）。
//! @ai-context: 一致性契约（规格 §九）——进度聚合查询在 db_goals_progress.rs
//!              （现算）；本文件只做实体 CRUD 与绑定；CASCADE 语义：
//!              goal_groups 随组删除级联清除，goal_milestones.ref_group_id
//!              SET NULL（绑定组被删 → 里程碑降级手动判定，提示 UI 属 M2）。

use rusqlite::{params, Connection};

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::goal_schema::{
    Goal, GoalMilestone, NewGoal, NewMilestone, CRITERIA_GROUP_SETTLED, MILESTONE_DONE,
    MILESTONE_IN_PROGRESS, MILESTONE_PENDING,
};

/// 三表 DDL + 索引（幂等：CREATE TABLE IF NOT EXISTS；旧库升级自动补表）。
pub(crate) fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            domain_tag TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            horizon_end INTEGER,
            success_criteria_json TEXT NOT NULL,
            intent_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            completed_at INTEGER,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
        CREATE TABLE IF NOT EXISTS goal_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            due_at INTEGER,
            order_idx INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            criteria_type TEXT NOT NULL DEFAULT 'manual',
            ref_group_id INTEGER REFERENCES note_groups(id) ON DELETE SET NULL,
            completed_at INTEGER,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_milestones_goal ON goal_milestones(goal_id);
        CREATE TABLE IF NOT EXISTS goal_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
            added_at INTEGER NOT NULL,
            UNIQUE(goal_id, group_id)
        );
        CREATE INDEX IF NOT EXISTS idx_goal_groups_group ON goal_groups(group_id);",
    )?;
    Ok(())
}

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

/// 里程碑插入行（create_goal 事务与 add_milestone 共用；criteria_type 默认 manual）。
fn add_milestone_row(
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

#[cfg(test)]
#[path = "db_goals_tests.rs"]
mod tests;
