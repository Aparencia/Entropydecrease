//! 学习目标数据层（v0.18.0 REQ-248；goals 三表 CRUD + 综合查询）。
//!
//! @ai-context: 意图层对象（规格 §五）——goals 主表 + goal_milestones（判据
//!              型里程碑）+ goal_groups（N:M 绑定，组仍是唯一容器不可破）。
//!              建表幂等（init 在 db_migrations::init_schema 末尾调用）。
//! @ai-context: 一致性契约（规格 §九）——进度聚合查询在 db_goals_progress.rs
//!              （现算）；本文件只做实体 CRUD 与绑定；CASCADE 语义：
//!              goal_groups 随组删除级联清除，goal_milestones.ref_group_id
//!              SET NULL（绑定组被删 → 里程碑降级手动判定，提示 UI 属 M2）。

use rusqlite::Connection;

use crate::error::Result;

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
/// 绑定域：目标↔组绑定 + 组结算钩子。
#[path = "db_goals_binding.rs"]
mod binding;
/// 毕业报告域：goal_graduation_reports 快照表读写。
#[path = "db_goals_graduation.rs"]
mod graduation;

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

#[cfg(test)]
#[path = "db_goals_tests.rs"]
mod tests;
