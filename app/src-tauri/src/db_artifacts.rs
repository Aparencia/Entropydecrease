//! 会话产物数据层（REQ-052 / v0.5.0 M7）。
//!
//! @ai-context: artifact_blocks 表的读写（会话 1:1 产物，块有序）。
//!              块引用原料不复制（refs_json 携带 segment/ocr 标识），
//!              原料可回看、可重算（G1 派生视图地基，V1.0 ADR-006 落地）。
//! @ai-context: 本模块只做数据读写，无业务规则；模板函数在 artifact_templates.rs。

use rusqlite::params;

use crate::artifact::{ArtifactBlock, BlockPayload, BlockRefs, BlockSource, SessionArtifact};
use crate::db::Db;
use crate::error::Result;

impl Db {
    /// 替换会话产物（先删后插，单事务）：产物可重算（重新构建覆盖旧产物）。
    ///
    /// @ai-context: 产物与笔记双份并存：产物可重算（本函数语义），
    ///              落盘笔记是用户编辑快照（不变）。
    pub fn replace_artifact(&self, artifact: &SessionArtifact) -> Result<usize> {
        let conn = self.conn.lock().expect("db lock poisoned");
        conn.execute("BEGIN TRANSACTION", [])?;
        let result = (|| -> rusqlite::Result<usize> {
            conn.execute(
                "DELETE FROM artifact_blocks WHERE session_id = ?1",
                params![artifact.session_id],
            )?;
            let mut inserted = 0;
            if !artifact.blocks.is_empty() {
                let mut stmt = conn.prepare(
                    "INSERT INTO artifact_blocks
                     (session_id, kind, refs_json, payload_json, block_order, source)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )?;
                for b in &artifact.blocks {
                    let kind = serde_json::to_string(&b.kind)
                        .map_err(|e| rusqlite::Error::InvalidColumnName(format!("kind: {}", e)))?;
                    let refs_json = serde_json::to_string(&b.refs)
                        .map_err(|e| rusqlite::Error::InvalidColumnName(format!("refs: {}", e)))?;
                    let payload_json = serde_json::to_string(&b.payload)
                        .map_err(|e| rusqlite::Error::InvalidColumnName(format!("payload: {}", e)))?;
                    let source = serde_json::to_string(&b.source)
                        .map_err(|e| rusqlite::Error::InvalidColumnName(format!("source: {}", e)))?;
                    stmt.execute(params![
                        artifact.session_id,
                        kind,
                        refs_json,
                        payload_json,
                        b.order,
                        source
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
                Err(e.into())
            }
        }
    }

    /// 读取会话产物（按 block_order 升序）；无产物返回 None。
    pub fn get_artifact(&self, session_id: i64) -> Result<Option<SessionArtifact>> {
        let conn = self.conn.lock().expect("db lock poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, kind, refs_json, payload_json, block_order, source
             FROM artifact_blocks WHERE session_id = ?1 ORDER BY block_order ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let id: i64 = row.get(0)?;
            let kind: String = row.get(1)?;
            let refs_json: String = row.get(2)?;
            let payload_json: String = row.get(3)?;
            let order: u32 = row.get(4)?;
            let source: String = row.get(5)?;
            // JSON 反序列化失败 → 整行跳过（防御：不阻断产物读取）
            let kind: crate::artifact::ArtifactKind =
                serde_json::from_str(&kind).map_err(|e| rusqlite::Error::InvalidColumnName(format!("kind: {}", e)))?;
            let refs: BlockRefs = serde_json::from_str(&refs_json).unwrap_or_default();
            let payload: BlockPayload = serde_json::from_str(&payload_json)
                .map_err(|e| rusqlite::Error::InvalidColumnName(format!("payload: {}", e)))?;
            let source: BlockSource = serde_json::from_str(&source).unwrap_or(BlockSource::Local);
            Ok(ArtifactBlock { id, kind, refs, payload, order, source })
        })?;
        let blocks = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        if blocks.is_empty() {
            return Ok(None);
        }
        Ok(Some(SessionArtifact {
            session_id,
            profile: String::new(), // profile 由会话表承载（避免冗余列）
            blocks,
        }))
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_artifacts_tests.rs"]
mod tests;
