//! 精修草稿表（v0.20.2 / REQ-268/270 共用派生落点）。
//!
//! @ai-context: 原料 session_segments 不可变（ADR-030 决策 5 可逆契约延续）——
//!              离线第二遍（origin=second_pass，source=asr_pass2）与可选 LLM
//!              校对（origin=proofread，source=llm_proofread）的替换文本全部落
//!              本表：段级（窗口/句级时间窗）diff 快照 base/refined + 来源与
//!              置信标记，pending → adopted/rejected 由用户裁决，全文可回退
//!              （回退=置 rejected 即恢复原料展示，不删历史裁决）。
//! @ai-context: 有效轴合成（adopted 覆盖原段）为纯函数 effective_segments
//!              （asr_pass2.rs）——本文件只做持久化与状态迁移。
//! @ai-context: dead_code 豁免——命令面（commands_asr_pass2.rs）与 REQ-270
//!              校对接线提交后移除（先原子层后系统层，AGENTS.md §3.6）。

#![allow(dead_code)]

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::db::Db;
use crate::error::Result;

/// 草稿来源标记（替换段来源——REQ-268「替换段标记来源」）。
pub const SOURCE_ASR_PASS2: &str = "asr_pass2";
/// 草稿来源标记（REQ-270 LLM 文本校对采纳）。
pub const SOURCE_LLM_PROOFREAD: &str = "llm_proofread";
/// 草稿来源标记（用户校对手动采纳——诚实标注非自动产物）。
pub const SOURCE_MANUAL: &str = "manual";
/// 精修类型（表级业务分型：第二遍 / 校对）。
pub const ORIGIN_SECOND_PASS: &str = "second_pass";
/// 精修类型（LLM 校对）。
pub const ORIGIN_PROOFREAD: &str = "proofread";
/// 草稿状态：待裁决。
pub const STATUS_PENDING: &str = "pending";
/// 草稿状态：已采纳（有效轴替换生效）。
pub const STATUS_ADOPTED: &str = "adopted";
/// 草稿状态：已回退/拒绝（恢复原料展示）。
pub const STATUS_REJECTED: &str = "rejected";

/// 精修草稿行（表 session_refine_drafts 1:1）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RefineDraft {
    pub id: i64,
    pub session_id: i64,
    /// second_pass | proofread（业务分型）
    pub origin: String,
    pub start_ms: u64,
    pub end_ms: u64,
    /// 基线文本快照（原文窗/句拼接；空=原链路无内容）
    pub base_text: String,
    pub refined_text: String,
    /// 替换段来源标记（asr_pass2 | llm_proofread | manual）
    pub source: String,
    /// 置信（None=单遍无重打分对比，诚实降级——REQ-098 口径）
    pub confidence: Option<f32>,
    /// 基线与精修的内容相似度（0..1；展示"改动幅度"用）
    pub similarity: Option<f32>,
    /// pending | adopted | rejected
    pub status: String,
    pub created_at: i64,
    pub decided_at: Option<i64>,
}

/// 新增草稿入参（不含自增列/状态/时间——均由落库侧补齐）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewRefineDraft {
    pub session_id: i64,
    pub origin: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub base_text: String,
    pub refined_text: String,
    pub source: String,
    pub confidence: Option<f32>,
    pub similarity: Option<f32>,
}

/// 建表（幂等——db_migrations init_schema 尾链挂，先例 db_goals::init）。
pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS session_refine_drafts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            origin TEXT NOT NULL DEFAULT 'second_pass',
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            base_text TEXT NOT NULL,
            refined_text TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'asr_pass2',
            confidence REAL,
            similarity REAL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL,
            decided_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_refine_drafts_session
            ON session_refine_drafts(session_id, status);
        ",
    )?;
    Ok(())
}

fn unix_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn row_to_draft(row: &rusqlite::Row<'_>) -> rusqlite::Result<RefineDraft> {
    Ok(RefineDraft {
        id: row.get(0)?,
        session_id: row.get(1)?,
        origin: row.get(2)?,
        start_ms: row.get::<_, i64>(3)? as u64,
        end_ms: row.get::<_, i64>(4)? as u64,
        base_text: row.get(5)?,
        refined_text: row.get(6)?,
        source: row.get(7)?,
        confidence: row.get(8)?,
        similarity: row.get(9)?,
        status: row.get(10)?,
        created_at: row.get(11)?,
        decided_at: row.get(12)?,
    })
}

impl Db {
    /// 批量落草稿（单事务；供第二遍跑批与校对采纳使用）。
    pub fn add_refine_drafts(&self, items: &[NewRefineDraft]) -> Result<usize> {
        if items.is_empty() {
            return Ok(0);
        }
        self.with_conn(|conn| {
            conn.execute("BEGIN TRANSACTION", [])?;
            let result = (|| -> rusqlite::Result<usize> {
                let mut inserted = 0;
                let now = unix_seconds();
                {
                    let mut stmt = conn.prepare(
                        "INSERT INTO session_refine_drafts
                            (session_id, origin, start_ms, end_ms, base_text, refined_text,
                             source, confidence, similarity, status, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    )?;
                    for item in items {
                        stmt.execute(params![
                            item.session_id,
                            item.origin,
                            item.start_ms as i64,
                            item.end_ms as i64,
                            item.base_text,
                            item.refined_text,
                            item.source,
                            item.confidence,
                            item.similarity,
                            STATUS_PENDING,
                            now
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
        })
    }

    /// 列草稿（按时间轴升序；status=None=全部）。
    pub fn list_refine_drafts(
        &self,
        session_id: i64,
        origin: &str,
        status: Option<&str>,
    ) -> Result<Vec<RefineDraft>> {
        self.with_conn(|conn| {
            let mut stmt = match status {
                Some(_) => conn.prepare(
                    "SELECT id, session_id, origin, start_ms, end_ms, base_text, refined_text,
                            source, confidence, similarity, status, created_at, decided_at
                     FROM session_refine_drafts
                     WHERE session_id = ?1 AND origin = ?2 AND status = ?3
                     ORDER BY start_ms ASC, id ASC",
                )?,
                None => conn.prepare(
                    "SELECT id, session_id, origin, start_ms, end_ms, base_text, refined_text,
                            source, confidence, similarity, status, created_at, decided_at
                     FROM session_refine_drafts
                     WHERE session_id = ?1 AND origin = ?2
                     ORDER BY start_ms ASC, id ASC",
                )?,
            };
            let rows = match status {
                Some(s) => stmt.query_map(params![session_id, origin, s], row_to_draft)?,
                None => stmt.query_map(params![session_id, origin], row_to_draft)?,
            };
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 裁决单条草稿（adopted/rejected 双向可翻转——回退=rejected 即恢复原料；
    /// 重新采纳=adopted。原料表始终不动）。
    pub fn decide_refine_draft(&self, draft_id: i64, status: &str) -> Result<bool> {
        if status != STATUS_ADOPTED && status != STATUS_REJECTED {
            return Err(crate::error::AppError::Asr(format!(
                "非法草稿裁决状态: {status}（仅 adopted/rejected）"
            )));
        }
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE session_refine_drafts SET status = ?1, decided_at = ?2 WHERE id = ?3",
                params![status, unix_seconds(), draft_id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 在给定段列表副本上叠加某 origin 的全部已采纳草稿（原料不动）。
    ///
    /// @ai-context: 供双 origin 串接合成（第二遍先行、校对后置——后落定者
    ///              覆盖；校对建议基于原句定位，跨合成行命中率由裁决 UI 保证）。
    pub fn overlay_adopted_rows(
        &self,
        session_id: i64,
        origin: &str,
        rows: &[crate::types::SessionSegment],
    ) -> Result<Vec<crate::types::SessionSegment>> {
        let adopted = self.list_refine_drafts(session_id, origin, Some(STATUS_ADOPTED))?;
        if adopted.is_empty() {
            return Ok(rows.to_vec());
        }
        let tuples: Vec<(u64, u64, String)> = adopted
            .iter()
            .map(|d| (d.start_ms, d.end_ms, d.refined_text.clone()))
            .collect();
        let mut out = crate::asr_pass2::overlay_segments(rows, &tuples);
        for r in out.iter_mut() {
            if r.session_id == 0 {
                r.session_id = session_id;
            }
        }
        Ok(out)
    }

    /// 有效段表副本（转笔记/预览装载）：原段 + 指定 origin 的全部已采纳草稿合成。
    ///
    /// @ai-context: 原料 session_segments 永不变——合成只发生在读取副本；
    ///              行结构保留（id 沿用覆盖原段最小 id，note_filter 锚点契约）；
    ///              无采纳时返回原段原样（零行为漂移，向后兼容）。
    pub fn effective_session_segments(
        &self,
        session_id: i64,
        origin: &str,
    ) -> Result<Vec<crate::types::SessionSegment>> {
        let segs = self.list_segments(session_id)?;
        self.overlay_adopted_rows(session_id, origin, &segs)
    }

    /// 清空某会话指定状态草稿（重跑前清 pending；或整清——adopted 不可清，
    /// 先裁决回退，防误删已生效替换）。
    pub fn clear_refine_drafts(&self, session_id: i64, origin: &str, status: &str) -> Result<usize> {
        if status != STATUS_PENDING && status != STATUS_REJECTED {
            return Err(crate::error::AppError::Asr(format!(
                "只允许清理 pending/rejected 草稿（adopted 需先裁决回退）: {status}"
            )));
        }
        self.with_conn(|conn| {
            let affected = conn.execute(
                "DELETE FROM session_refine_drafts
                 WHERE session_id = ?1 AND origin = ?2 AND status = ?3",
                params![session_id, origin, status],
            )?;
            Ok(affected)
        })
    }
}

#[cfg(test)]
#[path = "db_session_refine_tests.rs"]
mod tests;
