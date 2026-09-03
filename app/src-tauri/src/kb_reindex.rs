//! 检索索引·全量重建与统计（REQ-258，v0.19.0；设计 §5.3/§十二 角标）。
//!
//! @ai-context: reindex_all = 派生索引三保险的兜底闸——删除全部 kb_* → 按
//!              事实源（notes + 全量 fragments，归档碎片文本仍在库属素材）
//!              全量重切重写；进度经回调透出（命令层转 Channel 事件）；
//!              单源失败软记录继续（stats 角标可见，不半途而废）。

use rusqlite::OptionalExtension;

use crate::db::Db;
use crate::error::Result;
use crate::kb_index::{
    KB_INDEX_VERSION, META_ERROR_COUNT, META_INDEX_VERSION, META_LAST_ERROR,
    META_REINDEX_ALL_AT, clear_fragment_chunks, meta_get, meta_set, rebuild_note_chunks,
    record_index_error, reset_index_errors, write_fragment_chunks,
};

/// 全量重建结果报告（进度事件 Done 帧载荷）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbReindexReport {
    pub sources_total: u64,
    pub succeeded: u64,
    pub failed: u64,
    pub notes_total: u64,
    pub fragments_total: u64,
}

/// 索引统计（Settings「学习库」段 + 角标数据源——camelCase 与前端契约同构）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbIndexStats {
    /// FTS5 就绪（rusqlite bundled 编译期使能核查通过——恒真；引擎状态如实）
    pub fts_ready: bool,
    /// embedding 就绪（v0.19.3 前恒 false——无模型 = FTS-only 诚实状态）
    pub embedding_ready: bool,
    /// 当前引擎标识（fts5；embedding 定案后扩展 e.g. "fts5+onnx"）
    pub engine: String,
    pub chunks_total: u64,
    pub note_chunks: u64,
    pub fragment_chunks: u64,
    pub fts_rows: u64,
    /// 可索引源总数（笔记 + 全量碎片）
    pub sources_total: u64,
    /// 已入块源数（去重）
    pub sources_indexed: u64,
    /// 未索引源数（= total - indexed；>0 → UI 角标「索引待重建」）
    pub dirty_sources: u64,
    /// 库内 index_version（≠ current → 需全量重建）
    pub index_version: i64,
    pub current_index_version: i64,
    pub reindex_all_at: Option<i64>,
    /// 索引失败计数/最近错误（保存钩子软失败也在此可见——不静默）
    pub error_count: u64,
    pub last_error: Option<String>,
}

impl Db {
    /// 全量重建（派生索引唯一完整兜底；progress(done, total) 逐源回调）。
    pub fn kb_reindex_all(&self, progress: &mut dyn FnMut(u64, u64)) -> Result<KbReindexReport> {
        // ① 快照源清单（单锁短持——随后逐源独立加锁，避免全程占锁饿死主链路）
        let (note_ids, frag_ids) = self.with_conn(|conn| {
            let note_ids = conn
                .prepare("SELECT id FROM notes ORDER BY id")?
                .query_map([], |r| r.get::<_, i64>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let frag_ids = conn
                .prepare("SELECT id FROM fragments ORDER BY id")?
                .query_map([], |r| r.get::<_, i64>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok((note_ids, frag_ids))
        })?;
        let total = (note_ids.len() + frag_ids.len()) as u64;
        // ② 启动即清零失败计数 + 落格式版本（本次重建口径的诚实报告）
        self.with_conn(|conn| {
            reset_index_errors(conn);
            meta_set(conn, META_INDEX_VERSION, &KB_INDEX_VERSION.to_string())?;
            Ok(())
        })?;
        let mut done = 0u64;
        let mut ok = 0u64;
        let mut failed = 0u64;
        for id in &note_ids {
            let r = self.with_conn(|conn| {
                let content: Option<String> = conn
                    .query_row("SELECT content FROM notes WHERE id=?1", [id], |r| r.get(0))
                    .optional()?;
                if let Some(c) = content {
                    rebuild_note_chunks(conn, *id, &c)?;
                }
                Ok(())
            });
            match r {
                Ok(()) => ok += 1,
                Err(e) => {
                    failed += 1;
                    let _ = self.with_conn(|conn| {
                        record_index_error(conn, &format!("重建笔记 {} 失败: {}", id, e));
                        Ok(())
                    });
                }
            }
            done += 1;
            progress(done, total);
        }
        for id in &frag_ids {
            let r = self.with_conn(|conn| {
                let text: Option<String> = conn
                    .query_row("SELECT text FROM fragments WHERE id=?1", [id], |r| r.get(0))
                    .optional()?;
                if let Some(t) = text {
                    // 重建语义：先清后写（碎片日常不可变只写一次——全量重建
                    // 必须可重入，否则重复运行会累积重复块）
                    clear_fragment_chunks(conn, *id)?;
                    write_fragment_chunks(conn, *id, &t)?;
                }
                Ok(())
            });
            match r {
                Ok(()) => ok += 1,
                Err(e) => {
                    failed += 1;
                    let _ = self.with_conn(|conn| {
                        record_index_error(conn, &format!("重建碎片 {} 失败: {}", id, e));
                        Ok(())
                    });
                }
            }
            done += 1;
            progress(done, total);
        }
        // ③ 孤儿清扫（源行已失的残留块——FK 级联只覆盖常规路径；极端写
        // 入口/历史遗留的孤儿在此物理清除——stats 脏源归零的必要条件）
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM kb_fts WHERE chunk_id IN (SELECT c.id FROM kb_chunks c
                 LEFT JOIN notes n ON n.id = c.note_id
                 LEFT JOIN fragments f ON f.id = c.fragment_id
                 WHERE (c.source_kind='note' AND n.id IS NULL)
                    OR (c.source_kind='fragment' AND f.id IS NULL))",
                [],
            )?;
            conn.execute(
                "DELETE FROM kb_chunks WHERE id IN (SELECT c.id FROM kb_chunks c
                 LEFT JOIN notes n ON n.id = c.note_id
                 LEFT JOIN fragments f ON f.id = c.fragment_id
                 WHERE (c.source_kind='note' AND n.id IS NULL)
                    OR (c.source_kind='fragment' AND f.id IS NULL))",
                [],
            )?;
            Ok(())
        })?;
        // ④ 完成标记（失败也已落库计数——UI 角标如实；成功则 last_error 已清）
        let reindex_at = crate::kb_index::now_seconds();
        let _ = self.with_conn(|conn| {
            meta_set(conn, META_REINDEX_ALL_AT, &reindex_at.to_string())?;
            Ok(())
        });
        Ok(KbReindexReport {
            sources_total: total,
            succeeded: ok,
            failed,
            notes_total: note_ids.len() as u64,
            fragments_total: frag_ids.len() as u64,
        })
    }

    /// 索引统计（计算列现算——派生表无状态缓存，零双写）。
    pub fn kb_index_stats(&self) -> Result<KbIndexStats> {
        self.with_conn(|conn| {
            let count = |sql: &str| -> rusqlite::Result<u64> {
                conn.query_row(sql, [], |r| r.get::<_, i64>(0))
                    .map(|v| v.max(0) as u64)
            };
            let note_chunks = count("SELECT COUNT(*) FROM kb_chunks WHERE source_kind='note'")?;
            let fragment_chunks =
                count("SELECT COUNT(*) FROM kb_chunks WHERE source_kind='fragment'")?;
            let fts_rows = count("SELECT COUNT(*) FROM kb_fts")?;
            // 可索引源口径：正文非空才产生块（新建空笔记/纯图碎片不入块——
            // 不存在"漏索引"，诚实不计入脏源）
            let notes_total = count("SELECT COUNT(*) FROM notes WHERE length(trim(content)) > 0")?;
            let fragments_total = count(
                "SELECT COUNT(*) FROM fragments WHERE length(trim(text)) > 0",
            )?;
            let notes_indexed = count(
                "SELECT COUNT(DISTINCT note_id) FROM kb_chunks WHERE source_kind='note'",
            )?;
            let frags_indexed = count(
                "SELECT COUNT(DISTINCT fragment_id) FROM kb_chunks WHERE source_kind='fragment'",
            )?;
            // 孤儿块（源行已失而 chunk 残留——绕过 db API 的极端路径；正常删除
            // 钩子已先清，此项兜底计入脏源，UI 角标提示重建即愈）
            let orphans = count(
                "SELECT COUNT(*) FROM kb_chunks c
                 LEFT JOIN notes n ON n.id = c.note_id
                 LEFT JOIN fragments f ON f.id = c.fragment_id
                 WHERE (c.source_kind='note' AND n.id IS NULL)
                    OR (c.source_kind='fragment' AND f.id IS NULL)",
            )?;
            let indexed = notes_indexed + frags_indexed;
            let index_version: i64 = meta_get(conn, META_INDEX_VERSION)?
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            let reindex_all_at: Option<i64> = meta_get(conn, META_REINDEX_ALL_AT)?
                .and_then(|v| v.parse().ok());
            let error_count: u64 = meta_get(conn, META_ERROR_COUNT)
                .ok()
                .flatten()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            let last_error =
                meta_get(conn, META_LAST_ERROR).ok().flatten().filter(|v| !v.is_empty());
            Ok(KbIndexStats {
                fts_ready: true,
                embedding_ready: false,
                engine: "fts5".to_string(),
                chunks_total: note_chunks + fragment_chunks,
                note_chunks,
                fragment_chunks,
                fts_rows,
                sources_total: notes_total + fragments_total,
                sources_indexed: indexed,
                dirty_sources: (notes_total + fragments_total)
                    .saturating_sub(indexed)
                    .saturating_add(orphans),
                index_version,
                current_index_version: KB_INDEX_VERSION,
                reindex_all_at,
                error_count,
                last_error,
            })
        })
    }
}
