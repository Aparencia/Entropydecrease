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

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{Emitter, State};

use crate::ai_cost::{estimate_for_content_model, CostEstimate};
use crate::ai_task::AiTaskState;
use crate::commands::AppState;
use crate::note_diff::DiffOp;
use crate::types::{NewNote, Note};

/// mock 模式 env 键（本地规则精修，不联网——测试/离线开发，ai_text_filter 先例）。
const MOCK_ENV: &str = "AI_REFINE_MOCK";
/// 任务注册表容量上限（防无界增长：超限丢弃最旧终态任务）。
const TASKS_CAP: usize = 100;

/// 任务条目（注册表内：状态 + 成功结果）。
///
/// @ai-context: result 为序列化 JSON——精修（AiRefineResult）/补充
///              （AiEnrichResult，M3）共用同一任务注册表（REQ-145 基建复用），
///              各命令层自行反序列化。
pub struct AiTaskEntry {
    pub state: AiTaskState,
    pub result: Option<serde_json::Value>,
    /// 任务目标（去重粒度：精修=session_id、补充=note_id——审查修复
    /// 2026-08-21：原实现按全表 any 检查，会话 A 精修中时会话 B 也被拒）
    pub target_id: i64,
}

/// 精修成功载荷（前端 diff 预览 + 采纳落库数据源）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRefineResult {
    pub title: String,
    /// 规则基线（本地规则版——采纳落库时作为首快照，版本链 [rule, ai-refine]）
    pub base_markdown: String,
    pub refined_markdown: String,
    /// 与规则版的段级 diff（本地版为基线，AI 变化点高亮）
    pub diff: Vec<DiffOp>,
    pub added_lines: usize,
    pub removed_lines: usize,
    pub slices: usize,
    /// F2-B4：失败片数（>0 = 部分成功——重试后仍失败保留已成功片）
    pub failed_slices: usize,
    pub model: String,
}

/// 任务句柄（前端轮询/事件对应用）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskHandle {
    pub task_id: u64,
    pub state: AiTaskState,
}

/// 成本预估视图（确认弹窗数据源；余额内联由前端复用 ai_get_balance）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineEstimateView {
    pub estimate: CostEstimate,
    pub remember_cost_choice: bool,
}

/// 成本预估（REQ-143 + F1 修复：按模型映射单价、预估含输出 token——
/// 切付费模型后费用不再显示 ¥0，消灭成本失真）。
#[tauri::command]
pub fn ai_refine_estimate(state: State<'_, AppState>, session_id: i64) -> Result<RefineEstimateView, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let segments = state.db.list_segments(session_id).map_err(|e| e.to_string())?;
    let ocr = state.db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
    let chars = segments.iter().map(|s| s.text.chars().count()).sum::<usize>()
        + ocr.iter().map(|b| b.text.chars().count()).sum::<usize>();
    let remember = state
        .ai_settings
        .lock()
        .map(|s| s.remember_cost_choice)
        .unwrap_or(false);
    let model = state.ai_settings.lock().map(|s| s.model.clone()).unwrap_or_default();
    Ok(RefineEstimateView { estimate: estimate_for_content_model(chars, &model), remember_cost_choice: remember })
}

/// 启动 AI 精修异步任务（授权红线 + 密钥解析 + 后台切片逐片精修）。
#[tauri::command]
pub async fn ai_refine_start(
    state: State<'_, AppState>,
    session_id: i64,
    authorized: bool,
) -> Result<AiTaskHandle, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let st: AppState = (*state).clone();
    // ① 授权红线：内容上传类调用 gate（enabled + authorized 双条件）
    let settings = st.ai_settings.lock().map_err(|e| format!("AI 设置锁中毒: {}", e))?.clone();
    settings.content_gate()?;
    if !authorized {
        return Err("本次上传未确认——请先阅读并同意授权说明".to_string());
    }
    let mock = std::env::var(MOCK_ENV).map(|v| v == "1").unwrap_or(false);
    // ② 密钥解析（env > 凭据库）；非 mock 且无密钥 → 明确错误（不创建任务）
    if !mock {
        let env_key = std::env::var("SILICONFLOW_API_KEY").ok().filter(|k| !k.is_empty());
        let stored = st.ai_credentials.load_key()?;
        if env_key.is_none() && stored.is_none() {
            return Err("未配置 API 密钥（设置页保存密钥或配置环境变量 SILICONFLOW_API_KEY）".to_string());
        }
    }
    // ②b F1 修复（2026-08-21）+ 审查修复（2026-08-21）：任务去重——按
    // **目标会话**粒度检查进行中任务（防双击/重进/多窗口对同一会话重复
    // 扣费；不同会话的任务互不阻塞——原实现全表 any 会误伤其他会话）
    {
        let tasks = st.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
        let active = tasks.values().any(|t| {
            t.target_id == session_id
                && matches!(t.state, AiTaskState::Pending | AiTaskState::Running { .. })
        });
        if active {
            return Err("该会话已有进行中的 AI 任务——请等待完成或到任务中心查看进度（防重复扣费）".to_string());
        }
    }
    // ②c F1/F3-D 修复（2026-08-21）：成本硬拦截 + 每日配额接入。
    // 顺序铁律（审查修复）：先余额拦截（失败不消耗配额），后消耗配额——
    // 否则余额不足被拒时配额已扣（浪费每日额度）。
    if !mock {
        let segments = st.db.list_segments(session_id).map_err(|e| e.to_string())?;
        let ocr = st.db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
        let chars = segments.iter().map(|s| s.text.chars().count()).sum::<usize>()
            + ocr.iter().map(|b| b.text.chars().count()).sum::<usize>();
        // 成本硬拦截（免费档 ¥0 预估 → 余额 0 也放行；查询失败宽容放行）
        ensure_balance_for(&st, chars, &settings.model)?;
        // 片数估算（与 ai_task::slice_note 同口径的保守上界：向上取整，
        // 空内容 0 片不消耗配额——审查修复：原公式 +1 导致空会话也扣 1）
        let slices = if chars == 0 {
            0
        } else {
            chars.saturating_add(crate::ai_task::SLICE_MAX_CHARS - 1) / crate::ai_task::SLICE_MAX_CHARS
        };
        let now = crate::db_sessions_rows::unix_seconds();
        let mut guards = st.ai_guardrails.lock().map_err(|e| format!("护栏状态锁中毒: {}", e))?;
        for _ in 0..slices {
            if !guards.quota.try_consume(now) {
                return Err("今日 AI 精修配额已用完（请明日再试或到设置页调整）".to_string());
            }
        }
        drop(guards);
    }
    // ③ 注册任务 + 后台执行（spawn_blocking——网络/分析不阻塞异步运行时）
    let task_id = st.ai_task_seq.fetch_add(1, Ordering::Relaxed);
    {
        let mut tasks = st.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
        tasks.insert(task_id, AiTaskEntry { state: AiTaskState::Pending, result: None, target_id: session_id });
        trim_tasks(&mut tasks);
    }
    // F2 任务中心（2026-08-21）：任务记录落库（pending 起步；终态在
    // run_refine_task 回写）。L4 修复：写库失败仍不阻断 AI 调用（H2 设计不变），
    // 但不再静默——落库失败意味着任务中心重启后无法恢复该任务，必须可观测
    if let Err(e) = st.db.insert_ai_task(&crate::db_ai_tasks::AiTaskRecord {
        task_id,
        op_type: "refine".to_string(),
        ref_id: session_id,
        state: "pending".to_string(),
        result_json: None,
        cost_yuan: None,
        elapsed_ms: None,
        model: None,
        error: None,
        slices: None,
        created_at: crate::db_sessions_rows::unix_seconds(),
        finished_at: None,
        adopted: false,
    }) {
        eprintln!("[AiTasks] refine 任务 {} 落库失败（不阻断 AI 调用；重启后不可恢复）: {}", task_id, e);
    }
    let st2 = st.clone();
    tauri::async_runtime::spawn_blocking(move || crate::ai_refine_task::run_refine_task(st2, task_id, session_id, mock));
    Ok(AiTaskHandle { task_id, state: AiTaskState::Pending })
}

/// 任务状态查询（前端轮询通道；事件通道见 "ai:task-update"）。
#[tauri::command]
pub fn ai_refine_status(state: State<'_, AppState>, task_id: u64) -> Result<AiTaskState, String> {
    state
        .ai_tasks
        .lock()
        .map_err(|e| format!("任务注册表锁中毒: {}", e))?
        .get(&task_id)
        .map(|t| t.state.clone())
        .ok_or_else(|| format!("任务不存在: {}", task_id))
}

/// 精修结果（仅成功后可取；失败/进行中返回明确错误）。
#[tauri::command]
pub fn ai_refine_result(state: State<'_, AppState>, task_id: u64) -> Result<AiRefineResult, String> {
    let tasks = state.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
    let entry = tasks
        .get(&task_id)
        .ok_or_else(|| format!("任务不存在: {}", task_id))?;
    match (&entry.state, &entry.result) {
        (AiTaskState::Succeeded, Some(v)) => serde_json::from_value(v.clone())
            .map_err(|e| format!("精修结果反序列化失败: {}", e)),
        (AiTaskState::Succeeded, None) => Err("任务成功但结果缺失（内部状态异常）".to_string()),
        (AiTaskState::Failed { reason }, _) => Err(format!("任务失败（{}）: {}", reason.kind(), reason.message())),
        _ => Err("任务仍在进行中".to_string()),
    }
}

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
    // 防重启后从任务中心重复采纳产生重复笔记）。
    // 审查修复（2026-08-21）：服务端前置校验已采纳状态——防异常/重复调用
    // 绕过前端 UI 直接重复建笔记（前端禁用 + 服务端兜底双保险）。
    if let Some(tid) = task_id {
        if state.db.is_ai_task_adopted(tid) {
            return Err("该任务结果已采纳落库——请勿重复采纳（可到笔记页查看）".to_string());
        }
        let _ = state.db.mark_ai_task_adopted(tid);
        let _ = state.db.update_ai_task_cost(tid, cost);
    }
    state
        .db
        .get_note(note.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())
}

/// 更新任务状态并推送事件（短锁内完成即释放）。M3 补充任务复用（pub(crate)）。
pub(crate) fn set_task(st: &AppState, task_id: u64, new_state: AiTaskState) {
    if let Ok(mut tasks) = st.ai_tasks.lock() {
        if let Some(entry) = tasks.get_mut(&task_id) {
            entry.state = new_state.clone();
            let _ = st.app.emit("ai:task-update", (task_id, &new_state));
        }
    }
}

/// 注册表容量守卫（超限丢弃最旧终态任务——防无界增长）。M3 补充任务复用。
///
/// @ai-context: 审查修复（2026-08-21）：原实现终态任务数 < excess 时删不完
///              （并行 Running 占满时 len 持续 > CAP）——改为 while 循环，
///              无终态可删时停止（Running 任务不可删——任务执行中）。
pub(crate) fn trim_tasks(tasks: &mut HashMap<u64, AiTaskEntry>) {
    while tasks.len() > TASKS_CAP {
        let oldest_terminal = tasks
            .iter()
            .filter(|(_, t)| !matches!(t.state, AiTaskState::Pending | AiTaskState::Running { .. }))
            .min_by_key(|(id, _)| **id)
            .map(|(id, _)| *id);
        match oldest_terminal {
            Some(id) => {
                tasks.remove(&id);
            }
            None => break,
        }
    }
}

/// 任务序列（AppState 装配）。
pub fn task_seq() -> Arc<AtomicU64> {
    Arc::new(AtomicU64::new(1))
}

/// 任务注册表（AppState 装配）。
pub fn task_registry() -> Arc<Mutex<HashMap<u64, AiTaskEntry>>> {
    Arc::new(Mutex::new(HashMap::new()))
}

/// 成本硬拦截安全系数（预估费用 × 系数 < 余额才放行——防预估偏差导致
/// 中途余额耗尽；免费档 ¥0 预估恒放行）。
const BALANCE_SAFETY_FACTOR: f64 = 1.2;

/// 成本硬拦截（F3-D，2026-08-21）：启动前校验余额。
///
/// @ai-context: 流程：按字符数预估费用（模型映射单价 + 输出 token）→ 查余额
///              （复用 AiBalanceAdapter）→ 余额 < 预估×1.2 → 拒绝启动 + 三出口
///              引导（充值/切免费档模型/放弃）。免费档（预估 ¥0）→ 恒放行
///              （余额 0 也可精修——免费模型不扣费）；余额查询失败 → 放行
///              （不因余额接口抖动阻断功能——降级宽容，费用风险由确认弹窗
///              展示承担）。精修/补充共用（补充经 enrich 命令调用本函数）。
pub(crate) fn ensure_balance_for(st: &AppState, chars: usize, model: &str) -> Result<(), String> {
    let est = estimate_for_content_model(chars, model);
    if est.est_cost_yuan <= 0.0 {
        return Ok(()); // 免费档/单价 0——无扣费风险，不拦截
    }
    let required = est.est_cost_yuan * BALANCE_SAFETY_FACTOR;
    // 余额查询（短超时——余额接口抖动不阻断精修；失败放行宽容降级）
    let api_key = std::env::var("SILICONFLOW_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .or(st.ai_credentials.load_key().ok().flatten())
        .unwrap_or_default();
    if api_key.is_empty() {
        return Err("未配置 API 密钥（设置页保存密钥或配置环境变量 SILICONFLOW_API_KEY）".to_string());
    }
    let settings = st.ai_settings.lock().map_err(|e| format!("AI 设置锁中毒: {}", e))?.clone();
    let cfg = crate::ai_client::AiClient::from_settings(&settings, Some(api_key)).config;
    let adapter = crate::ai_balance::AiBalanceAdapter {
        base_url: cfg.base_url,
        api_key: cfg.api_key,
        timeout_secs: cfg.timeout_secs,
        max_retries: 0, // 拦截是前置守卫——不重试，失败放行
    };
    match adapter.fetch() {
        Ok(balance) if balance.total_balance < required => Err(format!(
            "余额不足：当前 ¥{:.2}，本次预估 ¥{:.4}（安全系数 ×1.2）——请充值或切换免费档模型后重试",
            balance.total_balance, est.est_cost_yuan
        )),
        Ok(_) => Ok(()),
        Err(_) => Ok(()), // 余额查询失败 → 放行（宽容降级，费用由确认弹窗展示）
    }
}
