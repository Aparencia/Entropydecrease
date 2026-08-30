//! AI 对话持久化（REQ-224/226，v0.16.0）。
//!
//! @ai-context: 纯聊天双表——chat_sessions（会话元数据：标题/Provider/模型）
//!              + chat_messages（消息：角色/内容/用量/状态）。会话删除级联
//!              清消息（外键 ON DELETE CASCADE，ADR-004 同范式）。
//! @ai-context: 与 ai_tasks（任务中心）分离：聊天是交互式连续对话，任务是
//!              批量结构化作业；两者在 AI 对话页合并展示（REQ-230 视图层融合，
//!              存储不混）。

use rusqlite::{OptionalExtension, params};

use crate::db::Db;
use crate::error::Result;

/// 聊天会话（与前端契约同构——camelCase）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: i64,
    pub title: String,
    /// 选择的 Provider id（NULL = 跟随设置页默认）
    pub provider_id: Option<String>,
    /// 会话模型（首次发送后回填——消息模型标签口径）
    pub model: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 聊天消息。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: i64,
    pub session_id: i64,
    /// user | assistant（system 只存在于请求组装，不入库）
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    /// 用量 JSON（assistant 完成态；usage_json 原样存——前端展示 token/成本）
    pub usage_json: Option<String>,
    /// done | aborted | failed（failed 内容为空——错误详情走流事件）
    pub status: String,
    pub created_at: i64,
}

impl Db {
    /// 建表（幂等；db.rs open 时调用）。
    pub fn init_ai_chat(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '新对话',
                provider_id TEXT,
                model TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT,
                usage_json TEXT,
                status TEXT NOT NULL DEFAULT 'done',
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);",
        )?;
        Ok(())
    }

    /// 新建会话（返回 id）。
    pub fn insert_chat_session(&self, title: Option<&str>) -> Result<i64> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = crate::db_sessions_rows::unix_seconds();
        conn.execute(
            "INSERT INTO chat_sessions (title, created_at, updated_at) VALUES (?1, ?2, ?2)",
            params![title.unwrap_or("新对话"), now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// 会话列表（最近更新在前）。
    pub fn list_chat_sessions(&self) -> Result<Vec<ChatSession>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, title, provider_id, model, created_at, updated_at
             FROM chat_sessions ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ChatSession {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    provider_id: r.get(2)?,
                    model: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// 单会话（不存在 → None）。
    pub fn get_chat_session(&self, id: i64) -> Result<Option<ChatSession>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT id, title, provider_id, model, created_at, updated_at FROM chat_sessions WHERE id=?1",
            params![id],
            |r| {
                Ok(ChatSession {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    provider_id: r.get(2)?,
                    model: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    /// 重命名会话（刷新 updated_at）。
    pub fn rename_chat_session(&self, id: i64, title: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE chat_sessions SET title=?1, updated_at=?2 WHERE id=?3",
            params![title, crate::db_sessions_rows::unix_seconds(), id],
        )?;
        Ok(())
    }

    /// 会话模型/Provider（更新 + 刷新 updated_at）。
    pub fn set_chat_session_model(
        &self,
        id: i64,
        provider_id: Option<&str>,
        model: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE chat_sessions SET provider_id=?1, model=?2, updated_at=?3 WHERE id=?4",
            params![provider_id, model, crate::db_sessions_rows::unix_seconds(), id],
        )?;
        Ok(())
    }

    /// 删除会话（级联清消息）。
    pub fn delete_chat_session(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute("DELETE FROM chat_sessions WHERE id=?1", params![id])?;
        Ok(())
    }

    /// 插入消息（返回 id）。
    pub fn insert_chat_message(
        &self,
        session_id: i64,
        role: &str,
        content: &str,
        status: &str,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = crate::db_sessions_rows::unix_seconds();
        conn.execute(
            "INSERT INTO chat_messages (session_id, role, content, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![session_id, role, content, status, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// 消息终态回填（流式完成/中止/失败；assistant 用量与模型）。
    #[allow(clippy::too_many_arguments)]
    pub fn finish_chat_message(
        &self,
        id: i64,
        content: &str,
        status: &str,
        usage_json: Option<&str>,
        model: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE chat_messages SET content=?1, status=?2, usage_json=?3, model=?4 WHERE id=?5",
            params![content, status, usage_json, model, id],
        )?;
        Ok(())
    }

    /// 编辑历史消息内容（编辑后重发；仅 user 消息语义）。
    pub fn update_chat_message_content(&self, id: i64, content: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE chat_messages SET content=?1, created_at=?2 WHERE id=?3",
            params![content, crate::db_sessions_rows::unix_seconds(), id],
        )?;
        Ok(())
    }

    /// 删除消息（重发=删旧 assistant 后重流；id 必须属该会话）。
    pub fn delete_chat_message(&self, session_id: i64, message_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "DELETE FROM chat_messages WHERE id=?1 AND session_id=?2",
            params![message_id, session_id],
        )?;
        Ok(())
    }

    /// 删除指定消息之后的所有消息（编辑后重发——旧回答作废）。
    pub fn delete_chat_messages_after(&self, session_id: i64, after_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "DELETE FROM chat_messages WHERE session_id=?1 AND id>?2",
            params![session_id, after_id],
        )?;
        Ok(())
    }

    /// 会话消息列表（时间正序——多轮对话组装顺序）。
    pub fn list_chat_messages(&self, session_id: i64) -> Result<Vec<ChatMessage>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, model, usage_json, status, created_at
             FROM chat_messages WHERE session_id=?1 ORDER BY id ASC",
        )?;
        let rows = stmt
            .query_map(params![session_id], |r| {
                Ok(ChatMessage {
                    id: r.get(0)?,
                    session_id: r.get(1)?,
                    role: r.get(2)?,
                    content: r.get(3)?,
                    model: r.get(4)?,
                    usage_json: r.get(5)?,
                    status: r.get(6)?,
                    created_at: r.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }
}

#[cfg(test)]
#[path = "db_ai_chat_tests.rs"]
mod tests;
