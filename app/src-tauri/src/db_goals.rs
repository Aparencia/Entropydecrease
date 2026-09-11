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
use crate::goal_schema::{CRITERIA_GROUP_SETTLED, MILESTONE_DONE, MILESTONE_IN_PROGRESS, MILESTONE_PENDING};

// 子模块声明（AGENTS.md §3 单文件 ≤300 行；#[path] 使兄弟文件平铺在同目录，各自带 @ai-context）。
/// 里程碑域：里程碑 CRUD + 三写路径共用的插入行 helper。
#[path = "db_goals_milestone.rs"]
mod milestone;
/// AI 规划域：规划落库事务 / 体系链接 / 概念活动 / 规划上下文。
#[path = "db_goals_plan.rs"]
mod plan;
/// 目标域：goals 实体 CRUD（含事务建目标）+ goals 行映射。
#[path = "db_goals_goal.rs"]
mod goal;
/// 回顾域：结算快照 / 复习统计 / 成果物清单聚合取数。
#[path = "db_goals_retro.rs"]
mod retro;

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
        CREATE INDEX IF NOT EXISTS idx_goal_groups_group ON goal_groups(group_id);
        -- v0.18.1（REQ-255）：毕业报告快照——目标删除后 FK SET NULL 报告仍保留
        -- （同 notes_versions「回滚不破坏历史」哲学；goal_name 冗余便于档案列表展示）
        CREATE TABLE IF NOT EXISTS goal_graduation_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
            goal_name TEXT NOT NULL,
            report_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_graduation_goal ON goal_graduation_reports(goal_id);",
    )?;
    Ok(())
}

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

#[cfg(test)]
#[path = "db_goals_tests.rs"]
mod tests;
