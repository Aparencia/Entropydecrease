//! kb 检索的语义合流模块（REQ-259，v0.19.5；kb_search.rs 行数拆分）。
//!
//! @ai-context: 引擎不可达（Noop/推理失败/dim 与库内回填不符）时一律返回 None
//!              ——调用方 FTS 直通，检索可用性红线不因语义层被击穿；模型更换
//!              未重建时降级并打日志提示（不产出维度错乱结果）。
//! @ai-context: 全库向量线扫在内存解码后逐条余弦（数千 chunk × 512 维毫秒级）
//!              ——量级未到向量索引门槛（设计 §六 YAGNI 记录）。

use rusqlite::{params, Connection};

use crate::kb_embed::{cosine_top_k, decode_embedding, EmbeddingEngine, META_DIM};
use crate::kb_fts::rrf_merge;

/// 语义合流：查询嵌入 → 全库已嵌向量余弦 top-K → 与词法候选 RRF 融合。
///
/// 返回 (merged_ids, used_semantic)；语义不可用/不一致 → Ok(None)。
pub(crate) fn semantic_merge(
    conn: &Connection,
    engine: &dyn EmbeddingEngine,
    query: &str,
    fts_ids: &[i64],
    limit: usize,
) -> rusqlite::Result<Option<(Vec<i64>, bool)>> {
    let Some(dim) = engine.dims() else {
        return Ok(None);
    };
    // 引擎 dim 必须与库内回填 dim 一致（模型更换未重建 → 降级并提示重建）
    // 行缺失=从未回填（None）；行存在但值 NULL 也读为 None——两种均按未回填
    let stored_dim: Option<i64> = {
        let mut stmt = conn.prepare("SELECT value FROM kb_meta WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![META_DIM], |r| r.get::<_, Option<i64>>(0))?;
        match rows.next() {
            Some(Ok(v)) => v,
            Some(Err(e)) => return Err(e),
            None => None,
        }
    };
    if stored_dim.is_some_and(|d| d as usize != dim) {
        eprintln!("[kb-search] embedding dim 不匹配（库={stored_dim:?} 引擎={dim}）——降级 FTS-only，请重建索引");
        return Ok(None);
    }
    let Ok(qvec) = engine.embed(&[query.to_string()]) else {
        return Ok(None); // 引擎推理失败 → 降级（检索可用性红线）
    };
    let Some(qvec) = qvec.into_iter().next() else {
        return Ok(None);
    };
    // 全库已嵌向量（只取非 NULL——重嵌中/未嵌行自然缺席）
    let decoded: Vec<(i64, Vec<u8>)> = {
        let mut stmt = conn.prepare("SELECT id, embedding FROM kb_chunks WHERE embedding IS NOT NULL")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let vec_rows = decoded
        .into_iter()
        .filter_map(|(id, blob)| decode_embedding(&blob, dim).map(|v| (id, v)));
    let vec_ids: Vec<i64> = cosine_top_k(&qvec, vec_rows, limit * 8)
        .into_iter()
        .map(|(id, _)| id)
        .collect();
    let merged = rrf_merge(&[fts_ids.to_vec(), vec_ids], limit);
    Ok(Some((merged, true)))
}
