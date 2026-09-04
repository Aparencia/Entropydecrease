//! kb 向量回填存储（REQ-259，v0.19.5）。
//!
//! @ai-context: 派生索引铁律：kb_* 全部可由 reindex_all 重建——向量列亦然。
//!              全量重建（kb_reindex_all 命令）成功后由本模块做后置回填：
//!              拉取全部 chunk 文本 → 引擎批嵌入 → 单事务写回 embedding 列 +
//!              kb_meta 元数据（model/dim/format，检索合流的 dim 校验数据源）。
//! @ai-context: 软重建钩子（保存/删除）不增量补向量——语义召回一致性依赖
//!              全量重建（REQ-262 UI 按钮）；未回填行 embedding=NULL，语义
//!              合流自然缺席、FTS 精度不受影响（诚实降级）。

use crate::db::Db;
use crate::error::Result;
use crate::kb_embed::{
    EmbeddingEngine, FORMAT_F32LE, META_DIM, META_FORMAT, META_MODEL, encode_embedding,
};
use crate::kb_index::meta_set;

impl Db {
    /// 全量向量回填：全部已切块文本 → 引擎嵌入 → 写列 + 元数据（幂等——
    /// reindex 后 embedding 全 NULL，重跑即覆盖；引擎失败 → Err 保持可诊断）。
    pub fn kb_fill_embeddings(&self, engine: &dyn EmbeddingEngine) -> Result<usize> {
        let dim = engine
            .dims()
            .ok_or_else(|| crate::error::AppError::Db("引擎不可用（无 dim）".to_string()))?;
        let chunks: Vec<(i64, String)> = self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT id, text FROM kb_chunks ORDER BY id")?;
            let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })?;
        if chunks.is_empty() {
            // 无块也写元数据（重建后空库——状态如实：引擎就绪但无向量）
            self.with_conn(|conn| {
                meta_set(conn, META_MODEL, "onnx:bge-small-zh-v1.5")?;
                meta_set(conn, META_DIM, &dim.to_string())?;
                meta_set(conn, META_FORMAT, FORMAT_F32LE)?;
                Ok(())
            })?;
            return Ok(0);
        }
        // 审查修复（2026-09-04）：分批嵌入+分批写回（每批 512 行）——推理在
        // 锁外进行、单批写回持锁时长有界；全量向量不再一次性驻留内存
        // （万级 chunk × 512 维 ≈ 数百 MB 峰值风险消除）
        const BATCH: usize = 512;
        let mut written = 0usize;
        for batch in chunks.chunks(BATCH) {
            let texts: Vec<String> = batch.iter().map(|(_, t)| t.clone()).collect();
            let vectors = engine
                .embed(&texts)
                .map_err(|e| crate::error::AppError::Db(format!("嵌入失败: {e}")))?;
            self.with_conn(|conn| {
                let mut stmt = conn.prepare("UPDATE kb_chunks SET embedding = ?1 WHERE id = ?2")?;
                for ((id, _), vec) in batch.iter().zip(vectors.iter()) {
                    stmt.execute(rusqlite::params![encode_embedding(vec), id])?;
                }
                Ok(())
            })?;
            written += batch.len();
        }
        // 元数据最后写（=完成标记：中途失败不落 meta → 检索合流缺 dim 自动
        // FTS-only，stats 诚实显示未回填；重跑可续）
        self.with_conn(|conn| {
            meta_set(conn, META_MODEL, "onnx:bge-small-zh-v1.5")?;
            meta_set(conn, META_DIM, &dim.to_string())?;
            meta_set(conn, META_FORMAT, FORMAT_F32LE)?;
            Ok(())
        })?;
        Ok(written)
    }
}

#[cfg(test)]
mod tests {
    use crate::db::Db;
    use crate::kb_embed::EmbeddingEngine;

    /// 假引擎：dim=2，每文本返回确定性向量（[字符数×0.1, 1.0]）
    struct FakeEngine;
    impl EmbeddingEngine for FakeEngine {
        fn dims(&self) -> Option<usize> {
            Some(2)
        }
        fn embed(&self, texts: &[String]) -> std::result::Result<Vec<Vec<f32>>, String> {
            Ok(texts
                .iter()
                .map(|t| vec![t.chars().count() as f32 * 0.1, 1.0])
                .collect())
        }
    }

    fn seed_chunk(db: &Db, id: i64, text: &str) {
        db.with_conn(|c| {
            // 先建 notes 事实行（kb_chunks.note_id 有 FK——外键约束先满足）
            c.execute(
                "INSERT INTO notes (id, title, content, source, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'manual', 1, 1)",
                rusqlite::params![id, format!("测试笔记 {id}"), text],
            )?;
            c.execute(
                "INSERT INTO kb_chunks (id, source_kind, note_id, ord, char_start, char_end, text)
                 VALUES (?1, 'note', ?1, 1, 0, ?2, ?3)",
                rusqlite::params![id, text.chars().count() as i64, text],
            )?;
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn fill_writes_blobs_and_meta_idempotently() {
        let db = Db::open(":memory:").unwrap();
        seed_chunk(&db, 1, "学习");
        seed_chunk(&db, 2, "配色与晕染");
        let n = db.kb_fill_embeddings(&FakeEngine).unwrap();
        assert_eq!(n, 2);
        // 列内 BLOB = dim×4；元数据三键齐备
        db.with_conn(|c| {
            let bytes: i64 = c.query_row(
                "SELECT SUM(length(embedding)) FROM kb_chunks",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(bytes, 2 * 2 * 4);
            let dim: String = c.query_row(
                "SELECT value FROM kb_meta WHERE key='embedding_dim'",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(dim, "2");
            Ok(())
        })
        .unwrap();
        // 幂等重跑：全量覆盖不报错
        let again = db.kb_fill_embeddings(&FakeEngine).unwrap();
        assert_eq!(again, 2);
    }

    #[test]
    fn fill_empty_library_still_records_meta() {
        let db = Db::open(":memory:").unwrap();
        assert_eq!(db.kb_fill_embeddings(&FakeEngine).unwrap(), 0);
        db.with_conn(|c| {
            let format: String = c.query_row(
                "SELECT value FROM kb_meta WHERE key='embedding_format'",
                [],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(format, "f32le");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn fill_requires_engine_with_dim() {
        let db = Db::open(":memory:").unwrap();
        seed_chunk(&db, 1, "x");
        assert!(db.kb_fill_embeddings(&crate::kb_embed::NoopEmbedding).is_err());
    }
}
