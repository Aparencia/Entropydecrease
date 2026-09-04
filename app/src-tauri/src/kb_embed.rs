//! kb 语义索引的 embedding 契约与纯函数（REQ-259，v0.19.5）。
//!
//! @ai-context: 设计（docs/archive/2026-09-03 v0.19 设计 §六/§三 DDL）：kb_chunks
//!              的 `embedding BLOB` 存 f32 小端向量（长度=kb_meta 的 dim 键）；
//!              `NULL = 未嵌`（无引擎自动降级 FTS-only——不阻塞任何读路径）。
//!              本模块=引擎无关的纯层：trait 契约 + Noop 兜底 + 向量编解码 +
//!              余弦 top-K（读路径的本地语义检索无需任何外部依赖即可单测）。
//! @ai-context: Onnx/Ollama 具体引擎后续模块实现（OnnxEmbedding 需 ort + 模型
//!              文件 + BERT 分词——模型分发复用 model_registry）；本模块红线：
//!              引擎产物只是派生索引材料，绝不写结构层（人工裁决闸门铁律）。
//! 注意：向量编解码与 cosine top-K 的检索合流接线（kb_search 混合 RRF /
//! reindex 回填）落地前尚未被生产路径引用——dead_code 临时豁免，混合检索
//! 接线轮必须移除本属性（TODO REQ-259）；引擎槽/契约/Noop 已被命令层引用。
#![allow(dead_code)]

use std::error::Error;

/// kb_meta 键：当前 embedding 模型名（无引擎时无此键）
pub const META_MODEL: &str = "embedding_model";
/// kb_meta 键：向量维度（f32 数量）
pub const META_DIM: &str = "embedding_dim";
/// kb_meta 键：向量编码格式（本实现固定 "f32le"）
pub const META_FORMAT: &str = "embedding_format";

/// 本实现支持的编码格式（变更需迁移既有 BLOB——当前无存量，固定常量）
pub const FORMAT_F32LE: &str = "f32le";

/// Embedding 引擎契约（无引擎=恒不可用，读路径跳过语义召回）。
pub trait EmbeddingEngine: Send + Sync {
    /// 模型输出维度（不可用=None）
    fn dims(&self) -> Option<usize>;
    /// 批量编码文本（不可用/失败=Err——调用方按"未嵌"降级，不阻断主链路）
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String>;
}

/// Noop 引擎（默认态——无模型时注册，恒不可用，检索自动 FTS-only）。
#[derive(Debug, Clone, Default)]
pub struct NoopEmbedding;

impl EmbeddingEngine for NoopEmbedding {
    fn dims(&self) -> Option<usize> {
        None
    }
    fn embed(&self, _texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        Err("未配置本地 embedding 模型（降级 FTS-only 检索）".to_string())
    }
}

/// 引擎槽（AppState 持有；状态命令读、加载命令换入 Onnx——锁内
/// read-modify-write，与词表/开关同模式防 TOCTOU）。
pub struct EmbeddingSlot {
    pub engine: Box<dyn EmbeddingEngine>,
    /// 引擎标识（noop | onnx——状态命令如实上报）
    pub kind: &'static str,
}

impl Default for EmbeddingSlot {
    fn default() -> Self {
        Self { engine: Box::new(NoopEmbedding), kind: "noop" }
    }
}

/// 向量 → f32le BLOB（与 kb_chunks.embedding 列一一对应；长度=dim×4）
pub fn encode_embedding(vec: &[f32]) -> Vec<u8> {
    vec.iter().flat_map(|v| v.to_le_bytes()).collect()
}

/// f32le BLOB → 向量（长度非 dim×4 → None——版本/损坏防御，调用方降级未嵌）
pub fn decode_embedding(blob: &[u8], dim: usize) -> Option<Vec<f32>> {
    if blob.len() != dim * 4 {
        return None;
    }
    let mut out = Vec::with_capacity(dim);
    for chunk in blob.chunks_exact(4) {
        out.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Some(out)
}

/// 余弦相似度（零向量安全——任一零向量返回 0.0，不产生 NaN）
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0f32;
    let mut na = 0f32;
    let mut nb = 0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na <= 0.0 || nb <= 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

/// 余弦 top-K（语义召回纯函数：query 与全库 chunk 向量比对）。
///
/// @ai-context: 向量在内存解码后全量线扫——本地量级（数千 chunk × 512 维）
///              每次查询毫秒级可接受；向量索引（hnsw 等）不做（YAGNI，量级
///              未到；§六 无云端向量库红线）。k=0 返回空。零相似不返回。
pub fn cosine_top_k(
    query: &[f32],
    rows: impl Iterator<Item = (i64, Vec<f32>)>,
    k: usize,
) -> Vec<(i64, f32)> {
    if k == 0 || query.is_empty() {
        return Vec::new();
    }
    let mut scored: Vec<(i64, f32)> = rows
        .filter_map(|(chunk_id, vec)| {
            let s = cosine_similarity(query, &vec);
            (s > 0.0).then_some((chunk_id, s))
        })
        .collect();
    // 降序稳定排序（total_cmp：余弦受零向量守卫无 NaN；并列保序——输出确定利于 golden）
    scored.sort_by(|a, b| b.1.total_cmp(&a.1));
    scored.truncate(k);
    scored
}

/// 统一错误到 String（trait 便捷——引擎内部用）
pub fn to_string_err<E: Error>(e: E) -> String {
    e.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_roundtrip_preserves_vector() {
        let v = vec![0.1, -2.5, 3.75, 0.0, 1e-6];
        let blob = encode_embedding(&v);
        assert_eq!(blob.len(), v.len() * 4);
        assert_eq!(decode_embedding(&blob, v.len()), Some(v));
    }

    #[test]
    fn decode_rejects_wrong_length() {
        assert_eq!(decode_embedding(&[0u8; 8], 3), None, "长度≠dim×4 → None");
        assert_eq!(decode_embedding(&[0u8; 0], 0), Some(vec![]), "空向量合法");
    }

    #[test]
    fn cosine_zero_safe_and_ordered() {
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
        assert_eq!(cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]), 0.0); // 正交
        assert_eq!(cosine_similarity(&[0.0, 0.0], &[1.0, 0.0]), 0.0); // 零向量
        let near = cosine_similarity(&[1.0, 2.0], &[2.0, 4.0]);
        assert!((near - 1.0).abs() < 1e-5, "同向向量相似≈1: {near}");
    }

    #[test]
    fn cosine_top_k_ranks_and_truncates() {
        let q = vec![1.0, 0.0];
        let rows = vec![
            (1, vec![1.0, 0.0]),   // 相似 1.0
            (2, vec![0.9, 0.1]),   // 相似 ~0.994
            (3, vec![0.0, 1.0]),   // 正交 0 → 被滤
            (4, vec![0.8, 0.6]),   // 相似 0.8
        ];
        let top = cosine_top_k(&q, rows.into_iter(), 2);
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].0, 1);
        assert_eq!(top[1].0, 2);
        assert_eq!(cosine_top_k(&q, std::iter::empty(), 5).len(), 0);
        assert_eq!(cosine_top_k(&[], vec![(1, vec![1.0])].into_iter(), 5).len(), 0);
    }

    #[test]
    fn noop_engine_is_unavailable_but_usable_as_default() {
        let e = NoopEmbedding;
        assert_eq!(e.dims(), None);
        assert!(e.embed(&["hi".to_string()]).is_err());
    }
}
