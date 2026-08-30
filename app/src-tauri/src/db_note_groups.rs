//! 笔记组数据层（v0.11.0 REQ-195；db_* 拆分模式同款）。
//!
//! @ai-context: note_groups 表 CRUD + 幂等查找（课程组 series_key / 主题组
//!              domain_tag）；组是统一产物层唯一容器（v4 §7.4），本层只管读写，
//!              路由决策在 group_route.rs（纯函数）、组化编排在 note_group_assign.rs。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic，db_notes 同口径）。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{GroupDeleteImpact, NewNoteGroup, NoteGroup};

/// note_groups 表统一查询列（列顺序与 row_to_group 严格对应）。
const GROUP_COLUMNS: &str = "id, name, terrain, kind, domain_tag, source, series_key, route_reason, route_overridden, color, created_at, updated_at";

impl Db {
    /// 新建笔记组，返回含 id 与时间戳的完整记录。
    pub fn create_group(&self, new: &NewNoteGroup) -> Result<NoteGroup> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO note_groups (name, terrain, kind, domain_tag, source, series_key, route_reason, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![
                    new.name, new.terrain, new.kind, new.domain_tag, new.source,
                    new.series_key, new.route_reason, now
                ],
            )?;
            let id = conn.last_insert_rowid();
            Ok(NoteGroup {
                id,
                name: new.name.clone(),
                terrain: new.terrain.clone(),
                kind: new.kind.clone(),
                domain_tag: new.domain_tag.clone(),
                source: new.source.clone(),
                series_key: new.series_key.clone(),
                route_reason: new.route_reason.clone(),
                route_overridden: 0,
                note_count: 0,
                color: None,
                created_at: now,
                updated_at: now,
            })
        })
    }

    /// 按 id 读取单个组；不存在返回 None（note_count 不填充，单查场景不消费）。
    pub fn get_group(&self, id: i64) -> Result<Option<NoteGroup>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM note_groups WHERE id = ?1",
                GROUP_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![id], row_to_group)?;
            match rows.next() {
                Some(Ok(g)) => Ok(Some(g)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 按系列键查找课程组（series_detect 系列名幂等键；无 → None）。
    pub fn find_group_by_series_key(&self, key: &str) -> Result<Option<NoteGroup>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM note_groups WHERE series_key = ?1",
                GROUP_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![key], row_to_group)?;
            match rows.next() {
                Some(Ok(g)) => Ok(Some(g)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 按领域查找主题组（契约一：粒度对齐领域——同 domain_tag + terrain 唯一消费）。
    pub fn find_topic_group(&self, domain_tag: &str, terrain: &str) -> Result<Option<NoteGroup>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM note_groups
                 WHERE domain_tag = ?1 AND terrain = ?2 AND kind = 'topic'
                 ORDER BY updated_at DESC LIMIT 1",
                GROUP_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![domain_tag, terrain], row_to_group)?;
            match rows.next() {
                Some(Ok(g)) => Ok(Some(g)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 列出组（含组内笔记数；terrain 过滤 None=全部；按更新时间倒序）。
    ///
    /// @ai-context: LEFT JOIN 计数——空组也呈现（待确认/新建主题组不能被隐藏）；
    ///              v4 §7.5 按钟分域由前端按 terrain/kind 分区展示。
    pub fn list_groups(&self, terrain: Option<&str>) -> Result<Vec<NoteGroup>> {
        self.with_conn(|conn| {
            let (sql, filter): (String, Option<String>) = match terrain {
                Some(t) => (
                    format!(
                        "SELECT {}, COUNT(n.id) FROM note_groups g
                         LEFT JOIN notes n ON n.group_id = g.id
                         WHERE g.terrain = ?1
                         GROUP BY g.id ORDER BY g.updated_at DESC",
                        prefix_columns()
                    ),
                    Some(t.to_string()),
                ),
                None => (
                    format!(
                        "SELECT {}, COUNT(n.id) FROM note_groups g
                         LEFT JOIN notes n ON n.group_id = g.id
                         GROUP BY g.id ORDER BY g.updated_at DESC",
                        prefix_columns()
                    ),
                    None,
                ),
            };
            let mut stmt = conn.prepare(&sql)?;
            let rows = match filter {
                Some(t) => stmt.query_map(params![t], row_to_group_with_count)?,
                None => stmt.query_map([], row_to_group_with_count)?,
            };
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 重命名组（用户可改；updated_at 刷新）。
    pub fn rename_group(&self, id: i64, name: &str) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE note_groups SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 路由改判（REQ-198 修改即记忆）：覆盖 kind/domain_tag，reason 追加来源，
    /// route_overridden 置 1——后续自动路由不得覆盖用户裁决。
    ///
    /// @ai-context: 审查修复（2026-08-22）：改判为非课程组时同步清空 series_key——
    /// 残留的系列键会让后续同系列会话经 find_group_by_series_key 误归入
    /// 已被改判的组（路由误判 ★★★★ 死法的改判侧漏洞）。
    pub fn override_group_route(
        &self,
        id: i64,
        kind: &str,
        domain_tag: Option<&str>,
        reason: &str,
    ) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE note_groups SET kind = ?1, domain_tag = ?2, route_reason = ?3,
                 route_overridden = 1,
                 series_key = CASE WHEN ?1 = 'course' THEN series_key ELSE NULL END,
                 updated_at = ?4 WHERE id = ?5",
                params![kind, domain_tag, reason, unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// v0.14 B（视觉系统）：组级颜色设置（色板 id；None=清除回默认灰）。
    pub fn update_group_color(&self, id: i64, color: Option<&str>) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE note_groups SET color = ?1, updated_at = ?2 WHERE id = ?3",
                params![color, unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 组删除影响面（v0.14.1：确认弹窗数据源——只读计数，无副作用）。
    ///
    /// @ai-context: 删除语义=影响面确认后级联（规格 §2.1）：notes/fragments 将
    ///              SET NULL（移入"全部"），flashcards/settlements/contracts 将
    ///              CASCADE（级联删），knowledge_links 悬空引用将清理——六项计数
    ///              如实呈现，用户确认前可反悔。
    pub fn group_delete_impact(&self, id: i64) -> Result<GroupDeleteImpact> {
        self.with_conn(|conn| {
            let count = |sql: &str| -> Result<i64> { Ok(conn.query_row(sql, params![id], |row| row.get::<_, i64>(0))?) };
            Ok(GroupDeleteImpact {
                notes: count("SELECT COUNT(*) FROM notes WHERE group_id = ?1")?,
                fragments: count("SELECT COUNT(*) FROM fragments WHERE group_id = ?1")?,
                cards: count("SELECT COUNT(*) FROM flashcards WHERE group_id = ?1")?,
                settlements: count("SELECT COUNT(*) FROM settlements WHERE group_id = ?1")?,
                contracts: count("SELECT COUNT(*) FROM contracts WHERE group_id = ?1")?,
                system_refs: count(
                    "SELECT COUNT(*) FROM knowledge_links WHERE target_type = 'note_group' AND target_id = ?1",
                )?,
            })
        })
    }

    /// 删除组（v0.14.1：单事务——先清悬空引用再删组，级联由 FK 自动生效）。
    ///
    /// @ai-context: knowledge_links 无 FK 到 note_groups（target_type/target_id
    ///              泛化目标，白名单校验在命令层），必须显式清理——否则体系页
    ///              引用区出现悬空反查。PRAGMA foreign_keys=ON 每连接开启（db.rs），
    ///              notes/fragments SET NULL 与 flashcards/settlements/contracts
    ///              CASCADE 由建表契约自动生效；组不存在 → false（命令层转错误）。
    pub fn delete_group(&self, id: i64) -> Result<bool> {
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM knowledge_links WHERE target_type = 'note_group' AND target_id = ?1",
            params![id],
        )?;
        let affected = tx.execute("DELETE FROM note_groups WHERE id = ?1", params![id])?;
        tx.commit()?;
        Ok(affected > 0)
    }
}

/// JOIN 查询时列名加 g. 前缀（list_groups 专用）。
fn prefix_columns() -> String {
    GROUP_COLUMNS
        .split(", ")
        .map(|c| format!("g.{}", c))
        .collect::<Vec<_>>()
        .join(", ")
}

/// 把 rusqlite 行映射为 NoteGroup（无计数列）。
fn row_to_group(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteGroup> {
    Ok(NoteGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        terrain: row.get(2)?,
        kind: row.get(3)?,
        domain_tag: row.get(4)?,
        source: row.get(5)?,
        series_key: row.get(6)?,
        route_reason: row.get(7)?,
        route_overridden: row.get(8)?,
        color: row.get(9)?,
        note_count: 0,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

/// 把 rusqlite 行映射为 NoteGroup（含 JOIN 计数列）。
fn row_to_group_with_count(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteGroup> {
    let mut g = row_to_group(row)?;
    g.note_count = row.get(12)?;
    Ok(g)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；同 db_notes 模式）。
#[cfg(test)]
#[path = "db_note_groups_tests.rs"]
mod tests;
