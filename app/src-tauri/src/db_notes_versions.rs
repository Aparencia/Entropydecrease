//! 笔记版本快照数据层（REQ-144，v0.8.0 M4）。
//!
//! @ai-context: notes_versions 快照链（content/source/parent_id/created_at/meta）；
//!              迁移兼容旧数据：旧笔记首次读版本列表时惰性建首快照
//!              （content=当前内容，source=rule，parent NULL——启动不卡）；
//!              写路径统一 versioned_save（事务：更新 notes + 插入快照 +
//!              50 版上限合并最旧两版）；回滚=新版本（不破坏历史链）。
//! @ai-context: 合并语义：删最旧版 + 次旧版 meta 追加 merged_from 摘要
//!              （内容取舍=保留时间更近的——快照链上旧内容本就已被覆盖）。

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::db::Db;
use crate::error::{AppError, Result};
use crate::note_version::{NoteVersionSource, VersionMeta, VERSIONS_LIMIT};

/// 版本快照行（前端时间线徽标/费用数据源）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersion {
    pub id: i64,
    pub note_id: i64,
    pub content: String,
    pub source: NoteVersionSource,
    pub parent_id: Option<i64>,
    pub created_at: i64,
    pub meta: VersionMeta,
}

/// 建表（幂等——db.rs open 调用；删笔记级联清理版本）。
pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            source TEXT NOT NULL,
            parent_id INTEGER,
            created_at INTEGER NOT NULL,
            meta_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_versions_note ON notes_versions(note_id, created_at);",
    )?;
    Ok(())
}

impl Db {
    /// 版本列表（旧→新；确保首快照存在——旧数据迁移兼容）。
    pub fn list_versions(&self, note_id: i64) -> Result<Vec<NoteVersion>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        self.ensure_first_version_locked(&conn, note_id)?;
        let mut stmt = conn.prepare(
            "SELECT id, note_id, content, source, parent_id, created_at, meta_json
             FROM notes_versions WHERE note_id = ?1 ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![note_id], row_to_version)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// 最新版本内容（v0.10.1 F3 去重比较用；无版本返回 None——不建首快照，
    /// 与 list_versions 的惰性建快照语义区分：只读比较不应产生写）。
    pub fn latest_version_content(&self, note_id: i64) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let cur: Option<String> = conn
            .query_row(
                "SELECT content FROM notes_versions WHERE note_id = ?1
                 ORDER BY created_at DESC, id DESC LIMIT 1",
                params![note_id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(cur)
    }

    /// 按 id 读单条版本。
    pub fn get_version(&self, id: i64) -> Result<Option<NoteVersion>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, note_id, content, source, parent_id, created_at, meta_json
             FROM notes_versions WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], row_to_version)?;
        match rows.next() {
            Some(Ok(v)) => Ok(Some(v)),
            Some(Err(e)) => Err(e.into()),
            None => Ok(None),
        }
    }

    /// 统一 versioned 写路径（REQ-144：转笔记/精修采纳/补充采纳/手动保存/回滚
    /// 全部走本函数）——事务内：更新 notes.content → 无版本则先建首快照
    /// （变更前内容，source=rule）→ 插入新快照（parent=最新）→ 上限合并。
    pub fn versioned_save(
        &self,
        note_id: i64,
        content: &str,
        source: NoteVersionSource,
        meta: &VersionMeta,
    ) -> Result<NoteVersion> {
        let now = crate::db_sessions_rows::unix_seconds();
        let mut conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let tx = conn.transaction()?;
        // 变更前内容（首快照原料 + 存在性校验）
        let cur: Option<String> = tx
            .query_row("SELECT content FROM notes WHERE id = ?1", params![note_id], |r| r.get(0))
            .optional()?;
        let cur = cur.ok_or_else(|| AppError::Db("笔记不存在".to_string()))?;
        tx.execute(
            "UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3",
            params![content, now, note_id],
        )?;
        // 无版本 → 首快照 = 变更前内容（旧数据兼容 + 保留 base 可回溯）
        let newest: Option<i64> = tx
            .query_row(
                "SELECT id FROM notes_versions WHERE note_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
                params![note_id],
                |r| r.get(0),
            )
            .optional()?;
        let parent = match newest {
            Some(id) => Some(id),
            None => {
                tx.execute(
                    "INSERT INTO notes_versions (note_id, content, source, parent_id, created_at, meta_json)
                     VALUES (?1, ?2, 'rule', NULL, ?3, '{}')",
                    params![note_id, cur, now],
                )?;
                Some(tx.last_insert_rowid())
            }
        };
        let meta_json = serde_json::to_string(meta).unwrap_or_else(|_| "{}".to_string());
        tx.execute(
            "INSERT INTO notes_versions (note_id, content, source, parent_id, created_at, meta_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![note_id, content, source_label(source), parent, now, meta_json],
        )?;
        let id = tx.last_insert_rowid();
        trim_oldest(&tx, note_id)?;
        // v0.19.0（REQ-258）保存收口索引钩子：正文变化的 versioned_save 即
        // 事务内重建派生索引（实现口径说明见 kb_index.rs——同步重建零竞态，
        // 单笔记毫秒级）；失败软记录进 kb_meta，主链路（保存）不反悔
        if cur != content {
            crate::kb_index::soft_rebuild_note(&tx, note_id, content);
        }
        tx.commit()?;
        Ok(NoteVersion {
            id,
            note_id,
            content: content.to_string(),
            source,
            parent_id: parent,
            created_at: now,
            meta: meta.clone(),
        })
    }

    /// 回滚 = 新版本（content=目标版本，source=user_edit，parent=目标版本）——
    /// 历史链不破坏（REQ-144 验收：回滚不破坏历史链）。
    pub fn rollback_to(&self, note_id: i64, target_version_id: i64) -> Result<NoteVersion> {
        let target = self
            .get_version(target_version_id)?
            .ok_or_else(|| AppError::Db("目标版本不存在".to_string()))?;
        if target.note_id != note_id {
            return Err(AppError::Db("版本与笔记不匹配".to_string()));
        }
        self.versioned_save(
            note_id,
            &target.content,
            NoteVersionSource::UserEdit,
            &VersionMeta::default(),
        )
    }

    /// 惰性首快照（锁已持有路径——list_versions 复用）。
    fn ensure_first_version_locked(&self, conn: &Connection, note_id: i64) -> Result<()> {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT id FROM notes_versions WHERE note_id = ?1 LIMIT 1",
                params![note_id],
                |r| r.get(0),
            )
            .optional()?;
        if exists.is_some() {
            return Ok(());
        }
        let cur: Option<String> = conn
            .query_row("SELECT content FROM notes WHERE id = ?1", params![note_id], |r| r.get(0))
            .optional()?;
        if let Some(content) = cur {
            let now = crate::db_sessions_rows::unix_seconds();
            conn.execute(
                "INSERT INTO notes_versions (note_id, content, source, parent_id, created_at, meta_json)
                 VALUES (?1, ?2, 'rule', NULL, ?3, '{}')",
                params![note_id, content, now],
            )?;
        }
        Ok(())
    }
}

/// 行映射（source 为裸 kebab 串——手写匹配而非 serde 引号往返；
/// meta JSON 损坏回退默认——诚实降级不 panic）。
fn row_to_version(r: &rusqlite::Row) -> rusqlite::Result<NoteVersion> {
    let meta_json: String = r.get(6)?;
    let meta = serde_json::from_str(&meta_json).unwrap_or_default();
    Ok(NoteVersion {
        id: r.get(0)?,
        note_id: r.get(1)?,
        content: r.get(2)?,
        source: parse_source(&r.get::<_, String>(3)?),
        parent_id: r.get(4)?,
        created_at: r.get(5)?,
        meta,
    })
}

/// source 落库标识（kebab-case；与 parse_source 一一对应）。
fn source_label(s: NoteVersionSource) -> &'static str {
    match s {
        NoteVersionSource::Rule => "rule",
        NoteVersionSource::AiRefine => "ai-refine",
        NoteVersionSource::AiEnrich => "ai-enrich",
        NoteVersionSource::UserEdit => "user-edit",
    }
}

/// source 解析（裸 kebab 串 → 枚举；未知值回退 Rule——诚实降级）。
fn parse_source(s: &str) -> NoteVersionSource {
    match s {
        "ai-refine" => NoteVersionSource::AiRefine,
        "ai-enrich" => NoteVersionSource::AiEnrich,
        "user-edit" => NoteVersionSource::UserEdit,
        _ => NoteVersionSource::Rule,
    }
}

/// 超限合并（事务内）：最旧两版 → 删最旧 + 次旧 meta 追加 merged 摘要。
fn trim_oldest(tx: &Transaction, note_id: i64) -> rusqlite::Result<()> {
    let count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM notes_versions WHERE note_id = ?1",
        params![note_id],
        |r| r.get(0),
    )?;
    let excess = (count as usize).saturating_sub(VERSIONS_LIMIT);
    for _ in 0..excess {
        let oldest: (i64, String) = tx.query_row(
            "SELECT id, meta_json FROM notes_versions WHERE note_id = ?1 ORDER BY created_at ASC, id ASC LIMIT 1",
            params![note_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let second: Option<(i64, String)> = tx
            .query_row(
                "SELECT id, meta_json FROM notes_versions WHERE note_id = ?1 ORDER BY created_at ASC, id ASC LIMIT 1 OFFSET 1",
                params![note_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let Some((sid, smeta)) = second else { break };
        let old_meta: VersionMeta = serde_json::from_str(&oldest.1).unwrap_or_default();
        let newer_meta: VersionMeta = serde_json::from_str(&smeta).unwrap_or_default();
        let merged = newer_meta.merged_summary(&old_meta);
        tx.execute(
            "UPDATE notes_versions SET meta_json = ?1 WHERE id = ?2",
            params![serde_json::to_string(&merged).unwrap_or_default(), sid],
        )?;
        tx.execute("DELETE FROM notes_versions WHERE id = ?1", params![oldest.0])?;
    }
    Ok(())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；含 db_ai_usage 测试）。
#[cfg(test)]
#[path = "db_notes_versions_tests.rs"]
mod tests;
