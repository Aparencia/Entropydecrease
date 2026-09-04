//! 检索索引命令层（REQ-258/REQ-262 部分，v0.19.0；设计 §十/§十二）。
//!
//! @ai-context: 系统层——入参校验 + 编排：kb_search（只读，恒可用）、
//!              kb_index_stats（角标/设置页数据源）、kb_reindex_all（全量
//!              重建：spawn_blocking 后台 + Channel 进度事件，不阻塞 UI；
//!              单源失败软记录——报告与 stats 角标如实可见）。
//! @ai-context: 前端 Settings「学习库」段订阅 KbReindexEvent 事件（kind 标签
//!              分发——与 ChatStreamEvent 同构）。

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::commands::AppState;
use crate::kb_embed::EmbeddingEngine;
use crate::kb_reindex::{KbIndexStats, KbReindexReport};
use crate::kb_search::{KbHit, KB_SEARCH_DEFAULT_LIMIT, KB_SEARCH_MAX_LIMIT};

/// 重建进度事件（Settings「学习库」段监听；Progress 逐源推 + Done 收尾）。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum KbReindexEvent {
    /// 逐源进度（done/total——UI 进度条）
    Progress { done: u64, total: u64 },
    /// 完成（含成功/失败计数——UI 刷新 stats + 失败角标）
    Done { report: KbReindexReport },
    /// 整轮失败（连接层错误——非单源软失败，UI 诚实提示）
    Failed { message: String },
}

/// 查询字符上限（防超大 payload——查询是用户自由文本，仅长度护栏）。
const KB_QUERY_MAX_CHARS: usize = 500;

/// 全库混合检索（本地只读——零成本零上传，不受 AI 闸门约束）。
#[tauri::command]
pub fn kb_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<KbHit>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    if q.chars().count() > KB_QUERY_MAX_CHARS {
        return Err(format!("查询过长（≤{} 字符）", KB_QUERY_MAX_CHARS));
    }
    // REQ-259：引擎就绪时语义合流（锁与 db 调用同作用域——借用不逃逸）
    let result = {
        let slot = state
            .embedding_slot
            .lock()
            .map_err(|e| format!("embedding 引擎锁中毒: {}", e))?;
        let engine = (slot.engine.dims().is_some()).then(|| slot.engine.as_ref());
        state
            .db
            .kb_search_hybrid(engine, q, limit.unwrap_or(KB_SEARCH_DEFAULT_LIMIT).min(KB_SEARCH_MAX_LIMIT))
    };
    result.map_err(|e| e.to_string())
}

/// 索引统计（设置页/角标——含脏源/失败计数，索引失败不静默）。
#[tauri::command]
pub fn kb_index_stats(state: State<'_, AppState>) -> Result<KbIndexStats, String> {
    state.db.kb_index_stats().map_err(|e| e.to_string())
}

/// kb embedding 模型相对目录（model_dir 下；与 speaker 下载器同约定）
const EMBEDDING_MODEL_REL: &str = "embedding/bge-small-zh-v1.5";

/// 引擎状态视图（设置页「学习库」段数据源——无模型如实显示 noop 与原因）。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingStatusView {
    /// noop | onnx
    pub kind: String,
    /// 引擎是否可用（dim 已知 = 可推理）
    pub ready: bool,
    /// 输出维度（不可用 None）
    pub dim: Option<usize>,
    /// 模型目录（诊断）
    pub model_dir: String,
    /// 当前状态细节（noop=未配置；onnx=就绪/最近失败原因保留由加载命令报错）
    pub detail: String,
}

/// 读取 embedding 引擎状态（只读；锁内瞬时快照）。
#[tauri::command]
pub fn kb_embedding_status(state: State<'_, AppState>) -> Result<EmbeddingStatusView, String> {
    let slot = state
        .embedding_slot
        .lock()
        .map_err(|_| "embedding 引擎锁中毒".to_string())?;
    let dim = slot.engine.dims();
    Ok(EmbeddingStatusView {
        kind: slot.kind.to_string(),
        ready: dim.is_some(),
        dim,
        model_dir: state.model_dir.join(EMBEDDING_MODEL_REL).to_string_lossy().into_owned(),
        detail: if dim.is_some() { "本地模型就绪".to_string() } else { "未配置本地模型（检索按 FTS-only 精度工作）".to_string() },
    })
}

/// 加载（或重载）本地 ONNX embedding 引擎。
///
/// @ai-context: 模型文件由下载命令/分发先落位（models/embedding/bge-small-zh-
///              v1.5/{model_quantized.onnx,vocab.txt}）；本命令只做加载与换槽：
///              成功 → 槽位切 onnx（后续 reindex 按新引擎重嵌）；失败 → 槽位
///              保持原样并如实报错（不静默降级——状态命令仍显示旧态）。
#[tauri::command]
pub fn kb_embedding_load(state: State<'_, AppState>) -> Result<EmbeddingStatusView, String> {
    let dir = state.model_dir.join(EMBEDDING_MODEL_REL);
    let engine = crate::kb_embed_onnx::OnnxEmbedding::try_load(&dir)?;
    let mut slot = state
        .embedding_slot
        .lock()
        .map_err(|_| "embedding 引擎锁中毒".to_string())?;
    let dim = engine.dims();
    *slot = crate::kb_embed::EmbeddingSlot {
        engine: Box::new(engine),
        kind: "onnx",
    };
    Ok(EmbeddingStatusView {
        kind: "onnx".to_string(),
        ready: true,
        dim,
        model_dir: dir.to_string_lossy().into_owned(),
        detail: format!("本地模型就绪（dim={}）——请在「学习库」段重建索引以回填向量", dim.unwrap_or(0)),
    })
}

/// 全量重建（派生索引兜底闸——后台任务 + 进度事件；成功/失败逐源如实报告）。
#[tauri::command]
pub async fn kb_reindex_all(
    state: State<'_, AppState>,
    channel: Channel<KbReindexEvent>,
) -> Result<(), String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut progress = |done: u64, total: u64| {
            let _ = channel.send(KbReindexEvent::Progress { done, total });
        };
        match db.kb_reindex_all(&mut progress) {
            Ok(report) => {
                let _ = channel.send(KbReindexEvent::Done { report });
            }
            Err(e) => {
                eprintln!("[kb-index] 全量重建失败: {}", e);
                let _ = channel.send(KbReindexEvent::Failed { message: e.to_string() });
            }
        }
    });
    Ok(())
}
