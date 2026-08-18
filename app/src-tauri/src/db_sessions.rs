//! SQLite 会话数据层（REQ-010，ADR-004）。
//!
//! @ai-context: sessions / session_segments / session_ocr_blocks 三表的读写，
//!              与 db.rs 的 notes 数据层同构（同一 Db 连接，跨文件 impl）。
//! @ai-context: 会话是实时捕获链路的主产物——转写段与 OCR 块按时间轴对齐落库，
//!              应用崩溃不丢已识别内容（实时落库策略，ADR-004 §4）。
//! @ai-context: 本模块只做数据读写，无业务规则；会话→笔记的编排在 commands_session.rs。
//! @ai-context: 行映射/时间工具在 db_sessions_rows.rs（保持本文件 ≤300 行，AGENTS.md §3）。

use rusqlite::{params};

use crate::db::Db;
use crate::db_sessions_rows::{row_to_ocr_block, row_to_segment, row_to_session, unix_seconds};
use crate::error::Result;
use crate::types::{
    NewSession, NewSessionOcrBlock, NewSessionSegment, Session, SessionOcrBlock, SessionSegment,
};

/// 会话状态常量（与 schema 注释保持一致，禁止魔法字符串散落）。
pub const SESSION_STATUS_RECORDING: &str = "recording";
pub const SESSION_STATUS_FINISHED: &str = "finished";
pub const SESSION_STATUS_FAILED: &str = "failed";

impl Db {
    /// 新建会话（status=recording，started_at=now），返回完整记录。
    pub fn create_session(&self, new: &NewSession) -> Result<Session> {
        let now = unix_seconds();
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute(
            "INSERT INTO sessions (title, source_window, started_at, status) VALUES (?1, ?2, ?3, ?4)",
            params![new.title, new.source_window, now, SESSION_STATUS_RECORDING],
        )?;
        Ok(Session {
            id: conn.last_insert_rowid(),
            title: new.title.clone(),
            source_window: new.source_window.clone(),
            started_at: now,
            ended_at: None,
            status: SESSION_STATUS_RECORDING.to_string(),
        })
    }

    /// 结束会话（status=finished，ended_at=now）；对已结束会话为幂等（不覆盖）。
    pub fn finish_session(&self, id: i64) -> Result<bool> {
        let now = unix_seconds();
        let conn = self.conn.lock().expect("db lock poisoned");
        let affected = conn.execute(
            "UPDATE sessions SET status = ?1, ended_at = ?2 WHERE id = ?3 AND status = ?4",
            params![SESSION_STATUS_FINISHED, now, id, SESSION_STATUS_RECORDING],
        )?;
        Ok(affected > 0)
    }

    /// 按关键词（标题/窗口名，可空）+ 分页列出会话（新→旧）。
    ///
    /// @ai-context: keyword 经 LIKE ESCAPE 转义防注入（与 search_notes 同口径）；
    ///              占位符用顺序 ? 而非编号 ?1（keyword 缺失时编号会错位）。
    pub fn list_sessions(&self, keyword: Option<&str>, limit: u64, offset: u64) -> Result<Vec<Session>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut sql = String::from(
            "SELECT id, title, source_window, started_at, ended_at, status FROM sessions",
        );
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(kw) = keyword {
            if !kw.trim().is_empty() {
                let escaped = escape_like(kw);
                sql.push_str(" WHERE title LIKE ? ESCAPE '\\' OR source_window LIKE ? ESCAPE '\\'");
                // 同一关键词绑定到两个 LIKE 占位符（各一次）
                let pattern = format!("%{}%", escaped);
                args.push(Box::new(pattern.clone()));
                args.push(Box::new(pattern));
            }
        }
        sql.push_str(" ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?");
        args.push(Box::new(limit));
        args.push(Box::new(offset));

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(args.iter().map(|b| b.as_ref())), row_to_session)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 按 id 读取会话；不存在返回 None。
    pub fn get_session(&self, id: i64) -> Result<Option<Session>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, title, source_window, started_at, ended_at, status FROM sessions WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], row_to_session)?;
        match rows.next() {
            Some(Ok(session)) => Ok(Some(session)),
            Some(Err(e)) => Err(e.into()),
            None => Ok(None),
        }
    }

    /// 删除会话（外键级联清理子表，依赖 open 时 PRAGMA foreign_keys=ON）。
    pub fn delete_session(&self, id: i64) -> Result<bool> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let affected = conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    /// 追加一条转写段（实时落库）。
    pub fn add_segment(&self, new: &NewSessionSegment) -> Result<SessionSegment> {
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute(
            "INSERT INTO session_segments (session_id, start_ms, end_ms, text, source, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![new.session_id, new.start_ms, new.end_ms, new.text, new.source, new.confidence],
        )?;
        Ok(SessionSegment {
            id: conn.last_insert_rowid(),
            session_id: new.session_id,
            start_ms: new.start_ms,
            end_ms: new.end_ms,
            text: new.text.clone(),
            source: new.source.clone(),
            confidence: new.confidence,
        })
    }

    /// 批量追加转写段（单事务，100 段/批控制写入频率——ADR-004 §4）。
    ///
    /// @ai-context: 供 M7 实时捕获链路使用（当前阶段尚无调用方，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn add_segments_batch(&self, items: &[NewSessionSegment]) -> Result<usize> {
        if items.is_empty() {
            return Ok(0);
        }
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute("BEGIN TRANSACTION", [])?;
        let result = (|| -> rusqlite::Result<usize> {
            let mut inserted = 0;
            {
                let mut stmt = conn.prepare(
                    "INSERT INTO session_segments (session_id, start_ms, end_ms, text, source, confidence)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )?;
                for item in items {
                    stmt.execute(params![
                        item.session_id, item.start_ms, item.end_ms, item.text, item.source, item.confidence
                    ])?;
                    inserted += 1;
                }
            }
            Ok(inserted)
        })();
        match result {
            Ok(n) => {
                conn.execute("COMMIT", [])?;
                Ok(n)
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
        .map_err(Into::into)
    }

    /// 追加一条 OCR 块（实时落库）。
    pub fn add_ocr_block(&self, new: &NewSessionOcrBlock) -> Result<SessionOcrBlock> {
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute(
            "INSERT INTO session_ocr_blocks (session_id, timestamp_ms, text, score, region)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new.session_id, new.timestamp_ms, new.text, new.score, new.region],
        )?;
        Ok(SessionOcrBlock {
            id: conn.last_insert_rowid(),
            session_id: new.session_id,
            timestamp_ms: new.timestamp_ms,
            text: new.text.clone(),
            score: new.score,
            region: new.region.clone(),
        })
    }

    /// 列出会话全部转写段（按时间轴升序）。
    pub fn list_segments(&self, session_id: i64) -> Result<Vec<SessionSegment>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, session_id, start_ms, end_ms, text, source, confidence
             FROM session_segments WHERE session_id = ?1 ORDER BY start_ms ASC",
        )?;
        let rows = stmt.query_map(params![session_id], row_to_segment)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 清空会话全部转写段（融合重写前调用——ADR-005 §3）。
    ///
    /// @ai-context: 供实时会话停止时的融合重写链路使用（live_session.rs）。
    #[allow(dead_code)]
    pub fn delete_segments(&self, session_id: i64) -> Result<usize> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let affected = conn.execute(
            "DELETE FROM session_segments WHERE session_id = ?1",
            params![session_id],
        )?;
        Ok(affected)
    }

    /// 原子替换会话转写段：单事务内先删旧段再插融合段（ADR-005 §3，审查 M1 修复）。
    ///
    /// @ai-context: 删除与插入在同一事务——任一步失败整体回滚，不丢原段
    ///              （live_session_frame::rewrite_with_fusion 使用，替代 delete+insert 两步）。
    pub fn replace_segments(&self, session_id: i64, items: &[NewSessionSegment]) -> Result<usize> {
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute("BEGIN TRANSACTION", [])?;
        let result = (|| -> rusqlite::Result<usize> {
            conn.execute("DELETE FROM session_segments WHERE session_id = ?1", params![session_id])?;
            let mut inserted = 0;
            if !items.is_empty() {
                let mut stmt = conn.prepare(
                    "INSERT INTO session_segments (session_id, start_ms, end_ms, text, source, confidence)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )?;
                for item in items {
                    stmt.execute(params![
                        item.session_id, item.start_ms, item.end_ms, item.text, item.source, item.confidence
                    ])?;
                    inserted += 1;
                }
            }
            Ok(inserted)
        })();
        match result {
            Ok(n) => {
                conn.execute("COMMIT", [])?;
                Ok(n)
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
        .map_err(Into::into)
    }

    /// 标记会话 failed（实时链路启动失败的恢复路径）。
    pub fn mark_session_failed(&self, session_id: i64) -> Result<bool> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let affected = conn.execute(
            "UPDATE sessions SET status = ?1, ended_at = COALESCE(ended_at, ?2) WHERE id = ?3",
            params![SESSION_STATUS_FAILED, unix_seconds(), session_id],
        )?;
        Ok(affected > 0)
    }

    /// 列出会话全部 OCR 块（按时间轴升序）。
    pub fn list_ocr_blocks(&self, session_id: i64) -> Result<Vec<SessionOcrBlock>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, session_id, timestamp_ms, text, score, region
             FROM session_ocr_blocks WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
        )?;
        let rows = stmt.query_map(params![session_id], row_to_ocr_block)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 崩溃恢复：把所有 status=recording 的残留会话标记为 failed。
    ///
    /// @ai-context: 应用启动时调用（ADR-004 风险缓解）——上次异常退出留下的
    ///              recording 会话已不可继续，标记后详情页可正常展示已落库内容。
    pub fn mark_interrupted_sessions(&self) -> Result<usize> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let affected = conn.execute(
            "UPDATE sessions SET status = ?1, ended_at = COALESCE(ended_at, ?2) WHERE status = ?3",
            params![SESSION_STATUS_FAILED, unix_seconds(), SESSION_STATUS_RECORDING],
        )?;
        Ok(affected)
    }
}

/// 转义 LIKE 通配符（复用 db.rs 实现，审查 L7 收敛）。
use crate::db::escape_like;

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_sessions_tests.rs"]
mod tests;
