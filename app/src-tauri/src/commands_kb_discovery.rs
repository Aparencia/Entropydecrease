//! 检索建议命令层（REQ-261，v0.19.3；设计 §八/治理）。
//!
//! @ai-context: 发现路径入口——feature flag kb_discovery（默认关）在此把关
//!              （后端不信前端隐藏）；命中本地检索为派生只读（恒可用引擎），
//!              但**建议候选输出**受开关约束（ADR-029：建议制·默认关）。
//! @ai-context: 确认落库不由本模块提供写路径——前端勾选后复用既有
//!              link_knowledge_target（白名单零迁移、幂等），本命令零双写。

use tauri::State;

use crate::commands::AppState;
use crate::kb_discovery::DiscoveryResult;

/// 概念相关素材建议 + 跨体系相似提示（单次拉取；开关关 → 明确报错引导设置）。
#[tauri::command]
pub fn kb_discovery_suggest(
    state: State<'_, AppState>,
    concept_id: i64,
) -> Result<DiscoveryResult, String> {
    if concept_id <= 0 {
        return Err("无效的概念 id".to_string());
    }
    let flags = state
        .feature_flags
        .lock()
        .map_err(|e| format!("功能开关锁中毒: {}", e))?;
    if !flags.kb_discovery {
        return Err("相关素材建议未开启（设置 → 学习库 → 相关素材建议开关；默认关——本地检索本身不受影响）".to_string());
    }
    drop(flags);
    state
        .db
        .kb_discovery_suggest(concept_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "概念不存在（可能已删除或不在当前体系）".to_string())
}
