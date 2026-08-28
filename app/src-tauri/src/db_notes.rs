//! 笔记读写数据层（H3 拆分自 db.rs）。
//!
//! @ai-context: db.rs 超 600 行硬拆——notes 相关 CRUD/搜索/关联全部内聚于本模块；
//!              impl Db 分布在各 db_* 文件是本项目既有模式（db_sessions 等同款）。
//! @ai-context: 锁访问统一走 Db::with_conn（M3 修复：中毒锁恢复而非 panic）。
//!              公共 API 签名与拆分前完全一致。

use rusqlite::{params, OptionalExtension};

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{NewNote, Note};

/// notes 表统一查询列（列顺序与 row_to_note 严格对应——改一处必须同步另一处）。
const NOTE_COLUMNS: &str = "id, title, content, source, session_id, rule_version, purify_stats, created_at, updated_at, tags, properties, pin, group_id";

impl Db {
    /// 新建笔记，返回含 id 与时间戳的完整记录。
    pub fn create_note(&self, new: &NewNote) -> Result<Note> {
        let now = unix_seconds();
        let tags = new.tags.clone().unwrap_or_else(|| "[]".to_string());
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO notes (title, content, source, session_id, rule_version, purify_stats, tags, properties, group_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                params![
                    new.title, new.content, new.source, new.session_id, new.rule_version,
                    new.purify_stats, tags, new.properties, new.group_id, now
                ],
            )?;
            let id = conn.last_insert_rowid();
            Ok(Note {
                id,
                title: new.title.clone(),
                content: new.content.clone(),
                source: new.source.clone(),
                session_id: new.session_id,
                rule_version: new.rule_version.clone(),
                purify_stats: new.purify_stats.clone(),
                tags,
                properties: new.properties.clone(),
                pin: 0,
                group_id: new.group_id,
                created_at: now,
                updated_at: now,
            })
        })
    }

    /// 按 id 读取单条笔记；不存在返回 None。
    pub fn get_note(&self, id: i64) -> Result<Option<Note>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare(&format!("SELECT {} FROM notes WHERE id = ?1", NOTE_COLUMNS))?;
            let mut rows = stmt.query_map(params![id], row_to_note)?;
            match rows.next() {
                Some(Ok(note)) => Ok(Some(note)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 列出全部笔记（按更新时间倒序）。
    pub fn list_notes(&self) -> Result<Vec<Note>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM notes ORDER BY updated_at DESC",
                NOTE_COLUMNS
            ))?;
            let rows = stmt.query_map([], row_to_note)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 更新笔记标题与正文，刷新 updated_at。
    pub fn update_note(&self, id: i64, title: &str, content: &str) -> Result<bool> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
                params![title, content, now, id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 删除笔记；返回是否实际删除。
    pub fn delete_note(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }

    /// 按关键词在标题与正文中模糊搜索。
    ///
    /// @ai-context: 使用 LIKE + ESCAPE 防注入；keyword 中的 %/_ 会被转义。
    pub fn search_notes(&self, keyword: &str) -> Result<Vec<Note>> {
        self.with_conn(|conn| {
            let escaped = crate::db::escape_like(keyword);
            let pattern = format!("%{}%", escaped);
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM notes
                 WHERE title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\'
                 ORDER BY updated_at DESC",
                NOTE_COLUMNS
            ))?;
            let rows = stmt.query_map(params![pattern], row_to_note)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 按会话取最新关联笔记（v0.7.1：列表 has_note 标记与"查看笔记"跳转的数据源）。
    ///
    /// @ai-context: 一个会话可多次转换（详情页有意重新生成）——取 created_at 最新；
    ///              同秒冲突按 id 倒序兜底（id 单调递增，后者更新）。
    pub fn find_note_by_session(&self, session_id: i64) -> Result<Option<Note>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM notes
                 WHERE session_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
                NOTE_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![session_id], row_to_note)?;
            match rows.next() {
                Some(Ok(note)) => Ok(Some(note)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 更新笔记标签（v0.10.0；幂等覆盖写入 JSON 数组）。
    pub fn update_note_tags(&self, id: i64, tags: &str) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE notes SET tags = ?1, updated_at = ?2 WHERE id = ?3",
                params![tags, unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 更新笔记固定状态（v0.10.0；pin=0 取消，=1 固定）。
    pub fn update_note_pin(&self, id: i64, pin: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE notes SET pin = ?1, updated_at = ?2 WHERE id = ?3",
                params![pin, unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 更新笔记颜色（v0.14 B 视觉系统；properties.color 字段读写——
    /// color=None 删除字段；properties 非 JSON 时防御性重置为仅含 color 的对象）。
    pub fn update_note_color(&self, id: i64, color: Option<&str>) -> Result<bool> {
        self.with_conn(|conn| {
            // 闭包显式 Option 读 NULL 列（properties 可为 NULL）；optional 转行不存在；flatten 去双重 Option
            let cur: Option<String> = conn
                .query_row("SELECT properties FROM notes WHERE id = ?1", params![id], |row| row.get::<_, Option<String>>(0))
                .optional()?
                .flatten();
            let mut props: serde_json::Value = cur
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_else(|| serde_json::json!({}));
            match color {
                Some(c) => props["color"] = serde_json::Value::String(c.to_string()),
                None => {
                    if let Some(obj) = props.as_object_mut() {
                        obj.remove("color");
                    }
                }
            }
            let affected = conn.execute(
                "UPDATE notes SET properties = ?1, updated_at = ?2 WHERE id = ?3",
                params![props.to_string(), unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 列出笔记（支持排序模式；v0.10.0）。
    pub fn list_notes_sorted(&self, sort_mode: &crate::types::NoteSortMode) -> Result<Vec<Note>> {
        self.with_conn(|conn| {
            let sql = match sort_mode {
                crate::types::NoteSortMode::UpdatedDesc => {
                    format!("SELECT {} FROM notes ORDER BY updated_at DESC", NOTE_COLUMNS)
                }
                crate::types::NoteSortMode::PinFirst => {
                    format!(
                        "SELECT {} FROM notes ORDER BY pin DESC, updated_at DESC",
                        NOTE_COLUMNS
                    )
                }
                crate::types::NoteSortMode::CreatedDesc => {
                    format!("SELECT {} FROM notes ORDER BY created_at DESC", NOTE_COLUMNS)
                }
            };
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([], row_to_note)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 按标签过滤笔记（v0.10.0；JSON 数组包含式匹配）。
    pub fn search_notes_by_tag(&self, tag: &str) -> Result<Vec<Note>> {
        self.with_conn(|conn| {
            let escaped = crate::db::escape_like(tag);
            let pattern = format!("%\"{}%\"%", escaped);
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM notes
                 WHERE tags LIKE ?1 ESCAPE '\\'
                 ORDER BY updated_at DESC",
                NOTE_COLUMNS
            ))?;
            let rows = stmt.query_map(params![pattern], row_to_note)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
    /// 更新笔记所属组（v0.11.0 组化接线/改判移动共用；None=移出组）。
    pub fn update_note_group(&self, id: i64, group_id: Option<i64>) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE notes SET group_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![group_id, unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 按组列出笔记（v0.11.0 组详情；按更新时间倒序）。
    pub fn list_notes_by_group(&self, group_id: i64) -> Result<Vec<Note>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM notes WHERE group_id = ?1 ORDER BY updated_at DESC",
                NOTE_COLUMNS
            ))?;
            let rows = stmt.query_map(params![group_id], row_to_note)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
}

/// 把 rusqlite 行映射为 Note。
fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        source: row.get(3)?,
        session_id: row.get(4)?,
        rule_version: row.get(5)?,
        purify_stats: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        tags: row.get(9)?,
        properties: row.get(10)?,
        pin: row.get(11)?,
        group_id: row.get(12)?,
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；同 db_sessions 模式）。
#[cfg(test)]
#[path = "db_notes_tests.rs"]
mod tests;
