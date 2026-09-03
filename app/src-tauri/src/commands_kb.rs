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
    state
        .db
        .kb_search(q, limit.unwrap_or(KB_SEARCH_DEFAULT_LIMIT).min(KB_SEARCH_MAX_LIMIT))
        .map_err(|e| e.to_string())
}

/// 索引统计（设置页/角标——含脏源/失败计数，索引失败不静默）。
#[tauri::command]
pub fn kb_index_stats(state: State<'_, AppState>) -> Result<KbIndexStats, String> {
    state.db.kb_index_stats().map_err(|e| e.to_string())
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
