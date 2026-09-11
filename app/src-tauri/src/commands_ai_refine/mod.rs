//! 会话→笔记 AI 精修 commands（REQ-141/145 + REQ-143 基础版，v0.8.0 M2）。
//!
//! @ai-context: 流程：成本预估（estimate，本地快）→ 确认（前端：首次必显 +
//!              内联余额 ai_get_balance 复用 + 记住选择）→ 异步任务
//!              （start：规则草稿 → 切片 → 逐片精修 → 合并 → diff）→
//!              状态查询/事件 → 采纳落库（apply）/放弃（不调 apply）。
//! @ai-context: 授权红线：start 走 content_gate（enabled+authorized 双条件）+
//!              本次上传确认；降级链：无密钥/网络/余额/配额/非法响应 → 任务
//!              失败原因四类可见，本地规则版保留（不丢不假）；mock 模式
//!              （AI_REFINE_MOCK=1）供测试/离线开发。任务注册表在 AppState，
//!              进度经 "ai:task-update" 事件 + ai_refine_status 查询双通道，
//!              网络调用在 spawn_blocking（不阻塞异步运行时）。

//! @ai-context: 目录模块（批 0-C3 Task 4 拆分，2026-09-11，原 751 行 → 外壳 ≤300）。
//!              子模块职责（D6，按域划分，逐条列出）：
//!              · dto.rs        —— IPC 契约类型（4 个 serde 结构体；字段序 = JSON 键序）
//!              · gate.rs       —— 成本硬拦截（免费档/本地 Provider 跳过；查询失败宽容放行）
//!              · registry.rs   —— 任务注册表 + id 序列 + 容量守卫 + 状态写入口
//!              · session.rs    —— 会话生命周期 6 命令（预估/启动/策略元数据/预览/状态/结果）
//!              · workbench.rs  —— 精修工作台（三级数据源 + 章节 diff 统计 + 内联契约测试）
//!              @ai-context: 本外壳只留「跨域共享的命令 + 重导出门面」；外部 10 文件
//!              20 处 crate::commands_ai_refine::X 引用**零改动**（逐项重导出在下方）；
//!              #[tauri::command] 定义随域下沉后，注册路径同步改成
//!              crate::commands_ai_refine::<子模块>::<cmd>（IPC 名 = 路径末段，逐字不变）。

mod dto;
mod gate;
mod registry;
pub(crate) mod session;
pub(crate) mod workbench;

pub use dto::{AiRefineResult, AiTaskHandle, RefineEstimateView, RefineStrategyInfo};
pub use registry::{claim_task_id, task_registry, task_seq, task_seq_lower_bound, AiTaskEntry};
pub(crate) use gate::ensure_balance_for;
pub(crate) use registry::{set_task, trim_tasks};

use tauri::State;

use crate::commands::AppState;
use crate::types::{NewNote, Note};

/// 任务历史（F2 任务中心：前端面板数据源——按类型列最近任务）。
#[tauri::command]
pub fn ai_task_history(
    state: State<'_, AppState>,
    op_type: String,
    limit: Option<usize>,
) -> Result<Vec<crate::db_ai_tasks::AiTaskRecord>, String> {
    if op_type != "refine" && op_type != "enrich" {
        return Err("无效的任务类型（refine|enrich）".to_string());
    }
    state
        .db
        .list_ai_tasks(&op_type, limit.unwrap_or(50).min(200))
        .map_err(|e| e.to_string())
}

/// 采纳落库（REQ-141：diff 预览后用户采纳；v0.8.0 M4 版本化写路径——
/// ① 以规则基线建笔记（首快照）→ ② 精修版 = 新版本（ai-refine，含成本
/// meta）→ ③ 成本落库 note_ai_usage）。
/// @ai-context: F2（2026-08-21）：task_id 可选——传入时标记任务已采纳
///              （防重启后从任务中心重复采纳产生重复笔记）。
#[tauri::command]
pub fn ai_refine_apply(
    state: State<'_, AppState>,
    session_id: i64,
    result: AiRefineResult,
    task_id: Option<u64>,
) -> Result<Note, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;
    let fallback = format!("{}（AI 精修）", session.title);
    let title = crate::commands::normalize_title(result.title.clone(), &fallback);
    // 审查修复（2026-09-04）：采纳守卫**前置**于任何写库——F2 注释自称"服务端
    // 前置校验"但实为后置（先建基线笔记/写版本/记 usage 再拒，重复采纳会留
    // 孤儿半态且 Err 早退不播 Notes）；双点/陈旧面板/多入口并发兜底依赖此处。
    if let Some(tid) = task_id {
        if state.db.is_ai_task_adopted(tid) {
            return Err("该任务结果已采纳落库——请勿重复采纳（可到笔记页查看）".to_string());
        }
    }
    // ① 规则基线建笔记（版本链首快照原料——可回溯精修前内容）
    let new = NewNote {
        title: title.clone(),
        content: result.base_markdown.clone(),
        source: "classroom".to_string(),
        session_id: Some(session_id),
        rule_version: Some("rule".to_string()),
        purify_stats: None,
        tags: None,
        properties: None,
        // v0.11.0：精修基线笔记继承会话组归属（组化接线在会话转笔记链路写入，
        // 精修新建基线同样归组——同会话同组，防组内资产漏登）
        group_id: crate::note_group_assign::group_of_session(&state.db, session_id).ok().flatten(),
    };
    let note = state.db.create_note(&new).map_err(|e| e.to_string())?;
    // ② 精修版落库（新版本 ai-refine + 成本 meta）
    // 审查修复（2026-08-21）：落库成本用模型感知单价（与预估同口径——
    // 付费模型预估 ¥X 不再记 ¥0）
    let cost = crate::ai_cost::usage_cost_for_model(
        result.base_markdown.chars().count(),
        result.refined_markdown.chars().count(),
        &result.model,
    );
    let meta = crate::note_version::VersionMeta {
        cost_yuan: Some(cost),
        model: Some(result.model.clone()),
        slices: Some(result.slices),
        merged_from: None,
    };
    state
        .db
        .versioned_save(
            note.id,
            &result.refined_markdown,
            crate::note_version::NoteVersionSource::AiRefine,
            &meta,
        )
        .map_err(|e| e.to_string())?;
    // ③ 成本落库（token 估算与预估同口径——校准单价表数据源）
    state
        .db
        .record_ai_usage(
            note.id,
            &crate::db_ai_usage::AiUsageInput {
                op_type: "refine",
                tokens_in: result.base_markdown.chars().count(),
                tokens_out: result.refined_markdown.chars().count(),
                cost_yuan: cost,
                model: result.model.clone(),
                slices: result.slices,
            },
        )
        .map_err(|e| e.to_string())?;
    // F2 任务中心：标记采纳 + 成本回填（task_id 可选——旧前端调用不传则跳过；
    // 防重启后从任务中心重复采纳产生重复笔记——采纳守卫已前置于写库前）
    if let Some(tid) = task_id {
        let _ = state.db.mark_ai_task_adopted(tid);
        let _ = state.db.update_ai_task_cost(tid, cost);
    }
    let note_row = state
        .db
        .get_note(note.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())?;
    // REQ-278：采纳落库 = 笔记内容变更 → 广播 notes 域（任务中心/会话页采纳后笔记页即时刷新）
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    Ok(note_row)
}
