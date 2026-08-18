//! SQLite 数据层：笔记的持久化（REQ-004）。
//!
//! @ai-context: 本地优先——所有数据存本地 SQLite，绝不上云。使用 rusqlite bundled 免系统依赖。
//! @ai-context: Connection 非 Sync，故用 Mutex 包裹以作为 Tauri managed state 跨 command 共享。
//! @ai-context: 本模块只做数据读写，无业务规则；拼接逻辑见 concat.rs。

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};

use crate::error::Result;
use crate::types::{NewNote, Note};

/// 笔记数据仓库（线程安全，可廉价克隆——Arc 共享连接）。
#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// 打开（或创建）数据库并初始化 schema。
    ///
    /// @ai-context: path 传 ":memory:" 可用于测试隔离（不触碰真实文件）。
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);",
        )?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    /// 新建笔记，返回含 id 与时间戳的完整记录。
    pub fn create_note(&self, new: &NewNote) -> Result<Note> {
        let now = unix_seconds();
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute(
            "INSERT INTO notes (title, content, source, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
            params![new.title, new.content, new.source, now],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Note {
            id,
            title: new.title.clone(),
            content: new.content.clone(),
            source: new.source.clone(),
            created_at: now,
            updated_at: now,
        })
    }

    /// 按 id 读取单条笔记；不存在返回 None。
    pub fn get_note(&self, id: i64) -> Result<Option<Note>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare("SELECT id, title, content, source, created_at, updated_at FROM notes WHERE id = ?1")?;
        let mut rows = stmt.query_map(params![id], row_to_note)?;
        match rows.next() {
            Some(Ok(note)) => Ok(Some(note)),
            Some(Err(e)) => Err(e.into()),
            None => Ok(None),
        }
    }

    /// 列出全部笔记（按更新时间倒序）。
    pub fn list_notes(&self) -> Result<Vec<Note>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, title, content, source, created_at, updated_at FROM notes ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_note)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 更新笔记标题与正文，刷新 updated_at。
    pub fn update_note(&self, id: i64, title: &str, content: &str) -> Result<bool> {
        let now = unix_seconds();
        let conn = self.conn.lock().expect("db lock poisoned");
        let affected = conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
            params![title, content, now, id],
        )?;
        Ok(affected > 0)
    }

    /// 删除笔记；返回是否实际删除。
    pub fn delete_note(&self, id: i64) -> Result<bool> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let affected = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    /// 按关键词在标题与正文中模糊搜索。
    ///
    /// @ai-context: 使用 LIKE + ESCAPE 防注入；keyword 中的 %/_ 会被转义。
    pub fn search_notes(&self, keyword: &str) -> Result<Vec<Note>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let escaped = escape_like(keyword);
        let pattern = format!("%{}%", escaped);
        let mut stmt = conn.prepare(
            "SELECT id, title, content, source, created_at, updated_at FROM notes
             WHERE title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\'
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![pattern], row_to_note)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }
}

/// 把 rusqlite 行映射为 Note。
fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        source: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

/// 当前 Unix 秒。
fn unix_seconds() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// 转义 LIKE 通配符，防止用户输入的 %/_ 被当作通配符。
fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::NewNote;

    fn mem_db() -> Db {
        // Arrange：内存库，绝不触碰真实文件（环境隔离）
        Db::open(":memory:").expect("open in-memory db")
    }

    #[test]
    fn create_and_get_note_roundtrip() {
        // Arrange
        let db = mem_db();
        let new = NewNote { title: "物理".into(), content: "# 牛顿\nF=ma".into(), source: "manual".into() };
        // Act
        let created = db.create_note(&new).expect("create");
        let fetched = db.get_note(created.id).expect("get").expect("exists");
        // Assert
        assert_eq!(fetched.title, "物理");
        assert_eq!(fetched.content, "# 牛顿\nF=ma");
        assert_eq!(fetched.source, "manual");
    }

    #[test]
    fn list_orders_by_updated_desc() {
        // Arrange
        let db = mem_db();
        db.create_note(&NewNote { title: "A".into(), content: "a".into(), source: "manual".into() }).unwrap();
        db.create_note(&NewNote { title: "B".into(), content: "b".into(), source: "manual".into() }).unwrap();
        // Act
        let notes = db.list_notes().expect("list");
        // Assert
        assert_eq!(notes.len(), 2);
    }

    #[test]
    fn update_note_changes_content() {
        // Arrange
        let db = mem_db();
        let created = db.create_note(&NewNote { title: "旧".into(), content: "旧内容".into(), source: "manual".into() }).unwrap();
        // Act
        let ok = db.update_note(created.id, "新标题", "新内容").expect("update");
        let fetched = db.get_note(created.id).unwrap().unwrap();
        // Assert
        assert!(ok);
        assert_eq!(fetched.title, "新标题");
        assert_eq!(fetched.content, "新内容");
    }

    #[test]
    fn delete_note_removes_row() {
        // Arrange
        let db = mem_db();
        let created = db.create_note(&NewNote { title: "待删".into(), content: "x".into(), source: "manual".into() }).unwrap();
        // Act
        let ok = db.delete_note(created.id).expect("delete");
        let fetched = db.get_note(created.id).expect("get");
        // Assert
        assert!(ok);
        assert!(fetched.is_none());
    }

    #[test]
    fn search_matches_title_and_content() {
        // Arrange
        let db = mem_db();
        db.create_note(&NewNote { title: "化学课".into(), content: "讲分子".into(), source: "classroom".into() }).unwrap();
        db.create_note(&NewNote { title: "随笔".into(), content: "含熵减概念".into(), source: "manual".into() }).unwrap();
        // Act
        let by_title = db.search_notes("化学").expect("search");
        let by_content = db.search_notes("熵减").expect("search");
        // Assert
        assert_eq!(by_title.len(), 1);
        assert_eq!(by_title[0].title, "化学课");
        assert_eq!(by_content.len(), 1);
    }

    #[test]
    fn search_escapes_wildcards() {
        // Arrange：用户输入含 % 应作为字面量
        let db = mem_db();
        db.create_note(&NewNote { title: "50%off".into(), content: "促销".into(), source: "manual".into() }).unwrap();
        db.create_note(&NewNote { title: "normal".into(), content: "普通".into(), source: "manual".into() }).unwrap();
        // Act：搜索字面 "%"
        let result = db.search_notes("%off").expect("search");
        // Assert：只命中含字面 %off 的，不应命中所有
        assert_eq!(result.len(), 1);
    }
}
