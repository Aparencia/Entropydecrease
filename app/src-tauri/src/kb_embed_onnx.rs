//! bge-small-zh-v1.5 的 ONNX embedding 引擎（REQ-259，v0.19.5）。
//!
//! @ai-context: ort 2.0.0-rc.13 会话封装（CPU EP；与 oar-ocr 共用同一份
//!              onnxruntime.dll——.cargo/config.toml ORT_LIB_LOCATION 注入）。
//!              模型目录约定：`<data_dir>/models/embedding/bge-small-zh-v1.5/`
//!              内含 `model_quantized.onnx`（或 model.onnx）+ `vocab.txt`。
//! @ai-context: 编码=WordPiece（kb_embed_tokenizer）→ 批推理 → 取
//!              last_hidden_state 的 [CLS] 行 → L2 归一。任何加载/推理失败 →
//!              Err（外层按"未嵌"降级 FTS-only，状态命令如实暴露原因）。
//! @ai-context: rc13 API 注意：Session::run 需 &mut self（内部 Mutex 串行化）；
//!              输入张量经 ort::value::Tensor::from_array 构造；输出读取用
//!              Value::try_extract_tensor::<f32>() → (&Shape, &[f32])。

use std::path::Path;
use std::sync::{Arc, Mutex};

use ort::session::Session;
use ort::value::Tensor;

use crate::kb_embed::EmbeddingEngine;
use crate::kb_embed_tokenizer::{BertTokenizer, Encoded, MAX_LEN};

/// bge-small-zh-v1.5 输出维度（模型卡固定 512；运行期以数据长度复核）
pub const BGE_DIM: usize = 512;
/// 单次推理最大批（内存有界——全量重嵌分批走）
pub const MAX_BATCH: usize = 32;

/// 模型文件候选名（量化优先；社区导出惯例两态）
const MODEL_CANDIDATES: [&str; 4] = [
    "model_quantized.onnx",
    "model.onnx",
    "onnx/model_quantized.onnx",
    "onnx/model.onnx",
];

/// ort 会话（run 需 &mut —— Mutex 串行化；Send 由 Session 保证）
struct OnnxSession {
    inner: Mutex<Session>,
}

impl OnnxSession {
    fn open(path: &Path) -> Result<Self, String> {
        let session = Session::builder()
            .map_err(|e| format!("ort 初始化失败: {e}"))?
            .commit_from_file(path)
            .map_err(|e| format!("模型加载失败（{path:?}）: {e}"))?;
        Ok(Self { inner: Mutex::new(session) })
    }

    /// 批推理 → 每行 [CLS] 行向量（len=BGE_DIM；形状不符/取锁失败 → Err）
    fn embed_batch(&self, encs: &[Encoded]) -> Result<Vec<Vec<f32>>, String> {
        let n = encs.len();
        if n == 0 {
            return Ok(Vec::new());
        }
        let flat_ids: Vec<i64> = encs.iter().flat_map(|e| e.input_ids.iter().copied()).collect();
        let flat_mask: Vec<i64> = encs.iter().flat_map(|e| e.attention_mask.iter().copied()).collect();
        let ids = Tensor::<i64>::from_array(([n, MAX_LEN], flat_ids))
            .map_err(|e| format!("输入张量构造失败: {e}"))?;
        let mask = Tensor::<i64>::from_array(([n, MAX_LEN], flat_mask))
            .map_err(|e| format!("输入张量构造失败: {e}"))?;
        let mut sess = self.inner.lock().map_err(|_| "ort 会话锁中毒".to_string())?;
        let outputs = sess
            .run(ort::inputs!["input_ids" => ids, "attention_mask" => mask])
            .map_err(|e| format!("推理失败: {e}"))?;
        // last_hidden_state 约定为首输出：形状 (n, seq, hidden)——flat 切片直读
        let (_shape, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("输出取张量失败: {e}"))?;
        let per_row = data.len() / n;
        if per_row == 0 || !per_row.is_multiple_of(MAX_LEN) {
            return Err(format!("输出长度意外: {}（预期 n×seq×hidden）", data.len()));
        }
        let hidden = per_row / MAX_LEN;
        if hidden != BGE_DIM {
            return Err(format!("模型 hidden 维度 {hidden} ≠ 预期 {BGE_DIM}"));
        }
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            let base = i * per_row;
            out.push(data[base..base + hidden].to_vec()); // [CLS] 行 = 序列首 token
        }
        Ok(out)
    }
}

/// ONNX embedding 引擎（加载即校验模型文件与词表；推理形状首用即校验）。
pub struct OnnxEmbedding {
    session: Arc<OnnxSession>,
    tokenizer: BertTokenizer,
}

impl OnnxEmbedding {
    /// 从模型目录加载（模型与 vocab 同目录；缺任一 → Err 携带可诊断原因）。
    pub fn try_load(dir: &Path) -> Result<Self, String> {
        let model = MODEL_CANDIDATES
            .iter()
            .map(|name| dir.join(name))
            .find(|p| p.is_file())
            .ok_or_else(|| format!("模型文件缺失：{dir:?}（需 model_quantized.onnx 或 model.onnx）"))?;
        let tokenizer = BertTokenizer::load(&dir.join("vocab.txt"))?;
        let session = Arc::new(OnnxSession::open(&model)?);
        Ok(Self { session, tokenizer })
    }
}

/// L2 归一（零向量保持原样——余弦侧已有零守卫）
fn l2_normalize(mut v: Vec<f32>) -> Vec<f32> {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
    v
}

impl EmbeddingEngine for OnnxEmbedding {
    fn dims(&self) -> Option<usize> {
        Some(BGE_DIM)
    }
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        let mut out = Vec::with_capacity(texts.len());
        for batch in texts.chunks(MAX_BATCH) {
            let encs: Vec<Encoded> = batch.iter().map(|t| self.tokenizer.encode(t)).collect();
            for row in self.session.embed_batch(&encs)? {
                out.push(l2_normalize(row));
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn l2_normalize_zero_and_unit_vectors() {
        let v = l2_normalize(vec![3.0, 4.0]);
        assert!((v[0] - 0.6).abs() < 1e-5 && (v[1] - 0.8).abs() < 1e-5);
        assert_eq!(l2_normalize(vec![0.0, 0.0]), vec![0.0, 0.0]);
    }

    #[test]
    fn try_load_missing_model_dir_is_honest_error() {
        let missing = std::env::temp_dir().join(format!("entropy-onnx-missing-{}", std::process::id()));
        let err = match OnnxEmbedding::try_load(&missing) {
            Ok(_) => panic!("缺模型必须失败"),
            Err(e) => e,
        };
        assert!(err.contains("模型文件缺失"), "无模型必须如实报错: {err}");
    }
}
