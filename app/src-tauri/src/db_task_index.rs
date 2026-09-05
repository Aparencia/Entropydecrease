//! 任务行增量索引表（v0.20.3 / REQ-292 行动底座）。
//!
//! @ai-context: 正文 md 任务行为唯一真相（不复制正文）——本表只是聚合查询缓存：
//!              保存钩子（notes 写路径）对正文按行重扫重建（行号漂移由"重扫式
//!              刷新"吸收，不做增量行号补丁）；勾选回写仍走既有字符级路径
//!              （NoteMarkdown/前端 → update_note → 本表随保存刷新）。
//! @ai-context: disposition/plan_date 为索引列元数据（行动中心裁决写；不写回
//!              正文——正文只承载任务行本身）。行解析纯逻辑见 tasks_core.rs。
//! @ai-context: 建表幂等（db_migrations init_schema 尾链挂）；删除笔记由 FK
//!              CASCADE 清行。软失败记录（不阻断保存——派生索引职责）。

use rusqlite::{params, Connection};

use crate::db::Db;
use crate::error::Result;
use crate::tasks_core::{parse_task_line, TaskStatus};

/// 任务行索引表（notes 1:N；UNIQUE(note_id, line_no) 幂等重扫）。
pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS task_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            line_no INTEGER NOT NULL,
            task_text TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'todo',
            unrefined INTEGER NOT NULL DEFAULT 0,
            plan_date INTEGER,
            disposition TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE (note_id, line_no)
        );
        CREATE INDEX IF NOT EXISTS idx_task_index_note ON task_index(note_id, status);
        ",
    )?;
    Ok(())
}

/// 任务行视图（队列展示：笔记上下文 JOIN）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskIndexRow {
    pub id: i64,
    pub note_id: i64,
    pub line_no: i64,
    pub task_text: String,
    pub status: String,
    pub unrefined: bool,
    pub plan_date: Option<i64>,
    pub disposition: Option<String>,
    /// 所属笔记标题（队列行上下文）
    pub note_title: String,
    pub updated_at: i64,
}

/// 按正文重扫重建某笔记任务索引（保存钩子；conn 已在写事务/闭包内）。
///
/// @ai-context: 全删全插单事务语义（调用方已在 with_conn 闭包内）——
///              失败打印日志不阻断保存（派生索引可下次刷新，真相仍在正文）。
pub fn rebuild_note_tasks(conn: &Connection, note_id: i64, content: &str) {
    if let Err(e) = rebuild_inner(conn, note_id, content) {
        eprintln!("[task-index] 笔记 {} 任务索引重建失败（可下次保存自动恢复）: {}", note_id, e);
    }
}

fn rebuild_inner(conn: &Connection, note_id: i64, content: &str) -> Result<()> {
    let now = crate::db::unix_seconds();
    // 重扫前读取旧行元数据（plan_date/disposition/created_at）——行号漂移由
    // (note_id,line_no) 键吸收；改期/纠偏为索引列元数据，不得被每次正文保存
    // 的重扫抹除（审查高-1：先删后插必须回填，否则计划分区/徽标失真）
    let mut meta: std::collections::HashMap<i64, (Option<i64>, Option<String>, i64)> = Default::default();
    {
        let mut stmt = conn.prepare(
            "SELECT line_no, plan_date, disposition, created_at FROM task_index WHERE note_id = ?1",
        )?;
        let mapped = stmt.query_map(params![note_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<i64>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })?;
        for row in mapped {
            let (line_no, plan_date, disposition, created_at) = row?;
            meta.insert(line_no, (plan_date, disposition, created_at));
        }
    }
    conn.execute("DELETE FROM task_index WHERE note_id = ?1", params![note_id])?;
    let mut stmt = conn.prepare(
        "INSERT INTO task_index (note_id, line_no, task_text, status, unrefined, plan_date, disposition, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )?;
    for (line_no, line) in content.split('\n').enumerate() {
        if let Some(p) = parse_task_line(line) {
            let status = match p.status {
                TaskStatus::Todo => "todo",
                TaskStatus::Done => "done",
            };
            let (plan_date, disposition, created_at) = match meta.get(&(line_no as i64)) {
                Some((pd, dp, ca)) => (*pd, dp.clone(), *ca),
                None => (None, None, now),
            };
            stmt.execute(params![
                note_id,
                line_no as i64,
                p.payload,
                status,
                p.unrefined as i64,
                plan_date,
                disposition,
                created_at,
                now
            ])?;
        }
    }
    Ok(())
}

impl Db {
    /// 任务队列查询（行动中心数据源；scope_note_id=单笔记过滤，None=跨组全量）。
    pub fn list_task_queue(&self, scope_note_id: Option<i64>) -> Result<Vec<TaskIndexRow>> {
        self.with_conn(|conn| {
            let rows = match scope_note_id {
                Some(nid) => {
                    let mut stmt = conn.prepare(QUEUE_SQL_SCOPE)?;
                    let mapped = stmt.query_map(params![nid], row_to_task)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
                None => {
                    let mut stmt = conn.prepare(QUEUE_SQL)?;
                    let mapped = stmt.query_map([], row_to_task)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
            };
            Ok(rows)
        })
    }
}

const QUEUE_SQL: &str = "SELECT t.id, t.note_id, t.line_no, t.task_text, t.status, t.unrefined,
                        t.plan_date, t.disposition, n.title AS note_title, t.updated_at
                 FROM task_index t JOIN notes n ON n.id = t.note_id
                 ORDER BY t.status = 'done', t.updated_at DESC, t.id DESC";
const QUEUE_SQL_SCOPE: &str = "SELECT t.id, t.note_id, t.line_no, t.task_text, t.status, t.unrefined,
                        t.plan_date, t.disposition, n.title AS note_title, t.updated_at
                 FROM task_index t JOIN notes n ON n.id = t.note_id
                 WHERE t.note_id = ?1
                 ORDER BY t.status = 'done', t.updated_at DESC, t.id DESC";

impl Db {
    /// 取单条任务行（含 note_id/行号——裁决回写正文需要）。
    pub fn get_task_row(&self, row_id: i64) -> Result<Option<TaskIndexRow>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT t.id, t.note_id, t.line_no, t.task_text, t.status, t.unrefined,
                        t.plan_date, t.disposition, n.title AS note_title, t.updated_at
                 FROM task_index t JOIN notes n ON n.id = t.note_id
                 WHERE t.id = ?1",
            )?;
            let mut mapped = stmt.query_map(params![row_id], row_to_task)?;
            match mapped.next() {
                Some(r) => r.map(Some).map_err(Into::into),
                None => Ok(None),
            }
        })
    }

    /// 只落索引列的计划日（不写正文——计划日是元数据）。
    pub fn set_task_plan_date(&self, row_id: i64, plan_date: Option<i64>) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE task_index SET plan_date = ?1, updated_at = ?2 WHERE id = ?3",
                params![plan_date, crate::db::unix_seconds(), row_id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 索引列纠偏（learning|practice|sop|export——提炼/裁决时标注）。
    #[allow(dead_code)] // 纠偏命令面未接线（登记：disposition 标注随提炼/裁决 UI 后置）
    pub fn set_task_disposition(
        &self,
        row_id: i64,
        disposition: Option<&str>,
    ) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE task_index SET disposition = ?1, updated_at = ?2 WHERE id = ?3",
                params![disposition, crate::db::unix_seconds(), row_id],
            )?;
            Ok(affected > 0)
        })
    }
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskIndexRow> {
    Ok(TaskIndexRow {
        id: row.get(0)?,
        note_id: row.get(1)?,
        line_no: row.get(2)?,
        task_text: row.get(3)?,
        status: row.get(4)?,
        unrefined: row.get::<_, i64>(5)? != 0,
        plan_date: row.get(6)?,
        disposition: row.get(7)?,
        note_title: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[cfg(test)]
#[path = "db_task_index_tests.rs"]
mod tests;
