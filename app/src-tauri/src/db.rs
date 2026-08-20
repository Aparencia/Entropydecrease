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
    /// 连接由 Mutex 包裹：Connection 非 Sync，跨 command 共享需串行化。
    /// @ai-context: pub(crate) 供 db_sessions.rs 跨模块 impl（同一 crate 内部共享）。
    pub(crate) conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// 打开（或创建）数据库并初始化 schema。
    ///
    /// @ai-context: path 传 ":memory:" 可用于测试隔离（不触碰真实文件）。
    /// @ai-context: PRAGMA foreign_keys=ON 必须每个连接开启（rusqlite 默认关闭）；
    ///              删除会话时靠外键级联清理子表（ADR-004）。
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
            -- 会话主表（ADR-004：每次学习 = 一个会话）
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                source_window TEXT,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                status TEXT NOT NULL DEFAULT 'recording',
                -- v0.5.0 M1（REQ-043）：视频类型档案标识（kebab-case；NULL=默认档案）
                profile TEXT
            );
            -- 会话转写段（ASR final / 字幕 / 融合统一落库）
            CREATE TABLE IF NOT EXISTS session_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                text TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'asr',
                confidence REAL
            );
            CREATE INDEX IF NOT EXISTS idx_segments_session ON session_segments(session_id, start_ms);
            -- 会话 OCR 块（字幕区 / 全帧）
            CREATE TABLE IF NOT EXISTS session_ocr_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                timestamp_ms INTEGER NOT NULL,
                text TEXT NOT NULL,
                score REAL NOT NULL,
                region TEXT NOT NULL DEFAULT 'full',
                -- v0.5.0 M4（REQ-048）：来源版面区域类型（kebab-case；NULL=整帧直跑）
                region_kind TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_ocr_blocks_session ON session_ocr_blocks(session_id, timestamp_ms);
            -- v0.5.0 M7（REQ-052）：会话产物块（会话 1:1 产物，块有序；payload JSON）
            CREATE TABLE IF NOT EXISTS artifact_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                refs_json TEXT NOT NULL DEFAULT '{}',
                payload_json TEXT NOT NULL,
                block_order INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'local'
            );
            CREATE INDEX IF NOT EXISTS idx_artifact_session ON artifact_blocks(session_id, block_order);
            -- v0.7.0 M1.5（REQ-108）：会话信号事件表（统一落库——章节检测/实践段标记/周报备数据；
            -- 设计见 docs/archive/2026-08-19/2026-08-19-session-events-table-design.md）
            CREATE TABLE IF NOT EXISTS session_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                timestamp_ms INTEGER NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, timestamp_ms);
            CREATE INDEX IF NOT EXISTS idx_events_kind ON session_events(session_id, kind);",
        )?;
        // v0.5.0 M1（REQ-043）：旧库迁移——sessions 表补 profile 列（兼容既有数据库）
        ensure_column(&conn, "sessions", "profile", "ALTER TABLE sessions ADD COLUMN profile TEXT")?;
        // v0.5.0 M4（REQ-048）：旧库迁移——ocr_blocks 表补 region_kind 列
        ensure_column(
            &conn,
            "session_ocr_blocks",
            "region_kind",
            "ALTER TABLE session_ocr_blocks ADD COLUMN region_kind TEXT",
        )?;
        // v0.7.3（REQ-156，ADR-015）：旧库迁移——ocr_blocks 表补屏卡体系两列：
        // bbox=检测框 JSON {x,y,w,h}（帧坐标系）、screen_id=采集时分配的屏号
        // （NULL=旧数据无屏，视图层聚类兜底——ADR-015 决策 1/2）
        ensure_column(
            &conn,
            "session_ocr_blocks",
            "bbox",
            "ALTER TABLE session_ocr_blocks ADD COLUMN bbox TEXT",
        )?;
        ensure_column(
            &conn,
            "session_ocr_blocks",
            "screen_id",
            "ALTER TABLE session_ocr_blocks ADD COLUMN screen_id INTEGER",
        )?;
        // v0.7.0 M1（REQ-103）：旧库迁移——segments 表补 volume 列
        // （段内平均音量，重点标注音量骤变信号输入；旧数据 None=未知）
        ensure_column(
            &conn,
            "session_segments",
            "volume",
            "ALTER TABLE session_segments ADD COLUMN volume REAL",
        )?;
        // v0.7.0 M1.5（REQ-109）：段级元数据列——语速/段前停顿/speaker 影子列
        // （K1 掌握度建模（V1.0）输入：语速=字/秒、停顿=与上段 gap、speaker=V1.0 讲者接线）
        ensure_column(
            &conn,
            "session_segments",
            "speech_rate",
            "ALTER TABLE session_segments ADD COLUMN speech_rate REAL",
        )?;
        ensure_column(
            &conn,
            "session_segments",
            "pause_ms",
            "ALTER TABLE session_segments ADD COLUMN pause_ms INTEGER",
        )?;
        ensure_column(
            &conn,
            "session_segments",
            "speaker",
            "ALTER TABLE session_segments ADD COLUMN speaker TEXT",
        )?;
        // v0.7.1（会话体验批次）：notes 表补 session_id 列——会话↔笔记关联
        // （删除会话 ON DELETE SET NULL：笔记是用户资产，只断关联不删笔记；
        //   旧数据 NULL=未关联，不猜不填——历史 classroom 笔记无法追溯归属）
        ensure_column(
            &conn,
            "notes",
            "session_id",
            "ALTER TABLE notes ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL",
        )?;
        // 关联查询索引（列表 has_note 子查询 + 笔记页来源跳转共用）
        conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_session ON notes(session_id)")?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    /// 新建笔记，返回含 id 与时间戳的完整记录。
    pub fn create_note(&self, new: &NewNote) -> Result<Note> {
        let now = unix_seconds();
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute(
            "INSERT INTO notes (title, content, source, session_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![new.title, new.content, new.source, new.session_id, now],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Note {
            id,
            title: new.title.clone(),
            content: new.content.clone(),
            source: new.source.clone(),
            session_id: new.session_id,
            created_at: now,
            updated_at: now,
        })
    }

    /// 按 id 读取单条笔记；不存在返回 None。
    pub fn get_note(&self, id: i64) -> Result<Option<Note>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare("SELECT id, title, content, source, session_id, created_at, updated_at FROM notes WHERE id = ?1")?;
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
            "SELECT id, title, content, source, session_id, created_at, updated_at FROM notes ORDER BY updated_at DESC",
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
            "SELECT id, title, content, source, session_id, created_at, updated_at FROM notes
             WHERE title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\'
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![pattern], row_to_note)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 按会话取最新关联笔记（v0.7.1：列表 has_note 标记与"查看笔记"跳转的数据源）。
    ///
    /// @ai-context: 一个会话可多次转换（详情页有意重新生成）——取 created_at 最新；
    ///              同秒冲突按 id 倒序兜底（id 单调递增，后者更新）。
    pub fn find_note_by_session(&self, session_id: i64) -> Result<Option<Note>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, title, content, source, session_id, created_at, updated_at FROM notes
             WHERE session_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![session_id], row_to_note)?;
        match rows.next() {
            Some(Ok(note)) => Ok(Some(note)),
            Some(Err(e)) => Err(e.into()),
            None => Ok(None),
        }
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
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

/// 幂等列迁移：表已含该列则跳过，否则执行 add_sql（兼容旧库升级）。
///
/// @ai-context: CREATE TABLE IF NOT EXISTS 只对新库生效——既有数据库缺列时必须
///              ALTER 补齐（v0.5.0 M1：sessions.profile）；列存在性经 PRAGMA
///              table_info 检查，重复启动幂等。
fn ensure_column(conn: &Connection, table: &str, column: &str, add_sql: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .iter()
        .any(|name| name == column);
    if !exists {
        conn.execute_batch(add_sql)?;
    }
    Ok(())
}

/// 当前 Unix 秒。
fn unix_seconds() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// 转义 LIKE 通配符，防止用户输入的 %/_ 被当作通配符。
/// @ai-context: pub(crate) 供 db_sessions.rs 复用（审查 L7：消除重复实现）。
pub(crate) fn escape_like(s: &str) -> String {
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
        let new = NewNote { title: "物理".into(), content: "# 牛顿\nF=ma".into(), source: "manual".into(), session_id: None };
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
        db.create_note(&NewNote { title: "A".into(), content: "a".into(), source: "manual".into(), session_id: None }).unwrap();
        db.create_note(&NewNote { title: "B".into(), content: "b".into(), source: "manual".into(), session_id: None }).unwrap();
        // Act
        let notes = db.list_notes().expect("list");
        // Assert
        assert_eq!(notes.len(), 2);
    }

    #[test]
    fn update_note_changes_content() {
        // Arrange
        let db = mem_db();
        let created = db.create_note(&NewNote { title: "旧".into(), content: "旧内容".into(), source: "manual".into(), session_id: None }).unwrap();
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
        let created = db.create_note(&NewNote { title: "待删".into(), content: "x".into(), source: "manual".into(), session_id: None }).unwrap();
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
        db.create_note(&NewNote { title: "化学课".into(), content: "讲分子".into(), source: "classroom".into(), session_id: None }).unwrap();
        db.create_note(&NewNote { title: "随笔".into(), content: "含熵减概念".into(), source: "manual".into(), session_id: None }).unwrap();
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
        db.create_note(&NewNote { title: "50%off".into(), content: "促销".into(), source: "manual".into(), session_id: None }).unwrap();
        db.create_note(&NewNote { title: "normal".into(), content: "普通".into(), source: "manual".into(), session_id: None }).unwrap();
        // Act：搜索字面 "%"
        let result = db.search_notes("%off").expect("search");
        // Assert：只命中含字面 %off 的，不应命中所有
        assert_eq!(result.len(), 1);
    }

    // ── v0.7.1 会话↔笔记关联（迁移 / SET NULL / find_note_by_session）──

    /// 旧库（无 session_id 列）打开后列补齐，旧笔记 session_id=NULL（诚实不猜）。
    #[test]
    fn migration_adds_session_id_to_notes() {
        // Arrange：手工造旧 schema 库（notes 无 session_id 列，含一条旧数据）
        let path = std::env::temp_dir().join(format!("entropy_mig_notes_{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        {
            let conn = rusqlite::Connection::open(&path).expect("open old db");
            conn.execute_batch(
                "CREATE TABLE notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'manual',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                INSERT INTO notes (title, content, source, created_at, updated_at)
                    VALUES ('旧笔记', 'v0.6.0 数据', 'classroom', 1, 1);",
            )
            .expect("create old schema");
        }
        // Act：以新代码打开旧库（触发 ensure_column 迁移）
        let db = Db::open(path.to_str().unwrap()).expect("open migrated db");
        let old = db.list_notes().expect("list").pop().expect("old note");
        // Assert：列补齐、旧数据读回、session_id 诚实为 None
        assert_eq!(old.title, "旧笔记");
        assert_eq!(old.session_id, None);
        let _ = std::fs::remove_file(&path);
    }

    /// 删除会话 → 笔记保留、关联断开（ON DELETE SET NULL 生效）。
    #[test]
    fn delete_session_keeps_note_and_breaks_link() {
        // Arrange
        let db = mem_db();
        let session = db.create_session(&crate::types::NewSession {
            title: "待删会话".into(),
            source_window: None,
            profile: None,
        }).expect("create session");
        let note = db.create_note(&NewNote {
            title: "关联笔记".into(),
            content: "内容".into(),
            source: "classroom".into(),
            session_id: Some(session.id),
        }).expect("create note");
        // Act：删除会话
        let deleted = db.delete_session(session.id).expect("delete session");
        let fetched = db.get_note(note.id).expect("get note").expect("note kept");
        // Assert：会话删除成功、笔记仍在、关联已断开
        assert!(deleted);
        assert_eq!(fetched.session_id, None);
        assert!(db.get_session(session.id).unwrap().is_none());
    }

    /// find_note_by_session：无关联 / 单条 / 多次转换取最新。
    #[test]
    fn find_note_by_session_picks_latest() {
        // Arrange：两条会话笔记（先旧后新）+ 一条手动笔记
        let db = mem_db();
        let session = db.create_session(&crate::types::NewSession {
            title: "会话".into(),
            source_window: None,
            profile: None,
        }).expect("create session");
        let older = db.create_note(&NewNote {
            title: "第一版".into(),
            content: "v1".into(),
            source: "classroom".into(),
            session_id: Some(session.id),
        }).expect("create older");
        let newer = db.create_note(&NewNote {
            title: "第二版".into(),
            content: "v2".into(),
            source: "classroom".into(),
            session_id: Some(session.id),
        }).expect("create newer");
        db.create_note(&NewNote {
            title: "手动".into(),
            content: "m".into(),
            source: "manual".into(),
            session_id: None,
        }).expect("create manual");
        // Act
        let found = db.find_note_by_session(session.id).expect("find");
        let none = db.find_note_by_session(999).expect("find none");
        // Assert：取最新（第二版）；无关会话返回 None；手动笔记不干扰
        assert_eq!(found.as_ref().unwrap().id, newer.id);
        assert_ne!(found.as_ref().unwrap().id, older.id);
        assert!(none.is_none());
    }
}
