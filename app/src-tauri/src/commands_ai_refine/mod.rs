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
//!              · workbench.rs  —— 精修工作台（三级数据源 + 章节 diff 统计 + 内联契约测试）
//!              @ai-context: 本外壳只留「跨域共享的命令 + 重导出门面」；外部 10 文件
//!              20 处 crate::commands_ai_refine::X 引用**零改动**（逐项重导出在下方）；
//!              #[tauri::command] 定义随域下沉后，注册路径同步改成
//!              crate::commands_ai_refine::<子模块>::<cmd>（IPC 名 = 路径末段，逐字不变）。

mod dto;
mod gate;
mod registry;
pub(crate) mod workbench;

pub use dto::{AiRefineResult, AiTaskHandle, RefineEstimateView, RefineStrategyInfo};
pub use registry::{claim_task_id, task_registry, task_seq, task_seq_lower_bound, AiTaskEntry};
pub(crate) use gate::ensure_balance_for;
pub(crate) use registry::{set_task, trim_tasks};

use tauri::State;

use crate::ai_cost::estimate_for_content_model;
use crate::ai_note_refine::NoteRefinePrompt;
use crate::ai_strategy::{RefineStrategyMeta, StrategyOverride};
use crate::ai_task::AiTaskState;
use crate::commands::AppState;
use crate::commands_session_note::build_rule_draft_with_analysis;
use crate::note_filter::PurifyEnv;
use crate::types::{NewNote, Note};
use crate::video_profile::ProfileKind;

/// mock 模式 env 键（本地规则精修，不联网——测试/离线开发，ai_text_filter 先例）。
const MOCK_ENV: &str = "AI_REFINE_MOCK";

/// 成本预估（REQ-143 + F1 修复：按模型映射单价、预估含输出 token——
/// 切付费模型后费用不再显示 ¥0，消灭成本失真）。
/// 7️⃣ 修正（2026-08-22，spec 7️⃣）：字符数按剥离锚点后的规则草稿计——与
/// 精修实际输入同口径（段落锚点不入模省 token），预估不再虚高。
#[tauri::command]
pub fn ai_refine_estimate(state: State<'_, AppState>, session_id: i64) -> Result<RefineEstimateView, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    // 构建规则草稿（与精修任务同管线：filter + 结构渲染，本地快）后剥离锚点
    let env = PurifyEnv {
        config: state.purify.clone(),
        symbol: state.symbol_normalize.clone(),
        corrections: state.ocr_corrections.clone(),
    };
    let (draft, _) = build_rule_draft_with_analysis(
        &state.db,
        &state.ui_junk,
        &env,
        &state.data_dir,
        session_id,
        None,
    )
    .map_err(|e| e.to_string())?;
    let chars = crate::anchor_strip::strip_anchors(&draft.markdown).chars().count();
    let remember = state
        .ai_settings
        .lock()
        .map(|s| s.remember_cost_choice)
        .unwrap_or(false);
    let model = state.ai_settings.lock().map(|s| s.model.clone()).unwrap_or_default();
    Ok(RefineEstimateView { estimate: estimate_for_content_model(chars, &model), remember_cost_choice: remember })
}

/// 启动 AI 精修异步任务（授权红线 + 密钥解析 + 后台切片逐片精修）。
///
/// @ai-context: v0.17.0（REQ-245）：strategy=任务级策略覆盖（可选——档位 +
///              逐维覆盖；缺省用设置全局默认；非法值 resolve 内部回退默认，
///              永不阻断）。dims 解析后传入任务（每片提示词一致）。
#[tauri::command]
pub async fn ai_refine_start(
    state: State<'_, AppState>,
    session_id: i64,
    authorized: bool,
    strategy: Option<StrategyOverride>,
    // REQ-284（v0.19.7）：画面理解任务级覆写（None=跟随全局；前端「仅本次」勾选）
    vision_refine: Option<bool>,
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
        let ready = crate::commands_ai_providers::default_provider_ready(&st)?;
        if !ready {
            return Err("未配置 API 密钥（请在设置页 AI 服务提供商中配置）".to_string());
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
    // ③ 注册任务 + 后台执行（spawn_blocking——网络/分析不阻塞异步运行时）；
    // 任务 id 走全任务族统一认领封装（claim_task_id——见其 Why：proofread
    // 原 +1 偏移与各族口径冲突，相邻认领撞 id 会被 INSERT OR REPLACE 顶替）
    let task_id = claim_task_id(&st.ai_task_seq);
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
        target_kind: Some("session".to_string()),
    }) {
        eprintln!("[AiTasks] refine 任务 {} 落库失败（不阻断 AI 调用；重启后不可恢复）: {}", task_id, e);
    }
    let st2 = st.clone();
    // v0.17.0：策略解析（任务覆盖 > 设置全局默认 > 内置 standard——非法值
    // resolve 内回退，永不阻断精修主链路；标准档=现状逐字节一致）
    let dims = crate::ai_strategy::resolve(
        &NoteRefinePrompt::bundled(),
        &settings.refine_strategy,
        strategy.as_ref(),
    );
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai_refine_task::run_refine_task(st2, task_id, session_id, mock, dims, vision_refine)
    });
    Ok(AiTaskHandle { task_id, state: AiTaskState::Pending })
}

/// 策略声明元数据（发起对话框/设置页渲染数据源——后端声明即事实源）。
#[tauri::command]
pub fn ai_refine_strategy_meta() -> Result<RefineStrategyMeta, String> {
    let p = NoteRefinePrompt::bundled();
    Ok(RefineStrategyMeta {
        strategy_dims: p.strategy_dims,
        ladder_presets: p.ladder_presets,
        intents: p.intents,
    })
}

/// 提示词组装预览（与实发精修同一 build_system 代码路径——所见即所发）。
///
/// @ai-context: 档案来源二选一：session_id（会话级——会话档案驱动风格模板）
///              或 profile（笔记级——handwritten/用户所选档案）；全局偏好 +
///              任务级覆盖参与解析；返回完整 system 提示词（只读预览 + 复制）。
#[tauri::command]
pub fn ai_refine_prompt_preview(
    state: State<'_, AppState>,
    session_id: Option<i64>,
    profile: Option<String>,
    strategy: Option<StrategyOverride>,
) -> Result<String, String> {
    let kind = match session_id.filter(|v| *v > 0) {
        Some(sid) => {
            let session = state
                .db
                .get_session(sid)
                .map_err(|e| format!("读取会话失败: {}", e))?
                .ok_or_else(|| "会话不存在".to_string())?;
            session
                .profile
                .as_deref()
                .map(ProfileKind::parse)
                .unwrap_or(ProfileKind::Lecture)
        }
        None => ProfileKind::parse(profile.as_deref().unwrap_or("handwritten")),
    };
    let prefs = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?
        .refine_strategy
        .clone();
    Ok(crate::ai_strategy::preview_system(
        &NoteRefinePrompt::bundled(),
        kind.as_str(),
        &prefs,
        strategy.as_ref(),
    ))
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
