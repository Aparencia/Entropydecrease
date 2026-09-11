//! 会话级 AI 精修命令（批 0-C3 Task 4 拆分，原 commands_ai_refine.rs 33–34 +
//! 103–330 行）。
//!
//! @ai-context: 会话精修的生命周期 6 命令：成本预估（estimate）→ 启动异步任务
//!              （start：授权闸门 → 密钥 → 去重 → 余额硬拦截 → 配额 → 注册表 → DB
//!              落库 → spawn_blocking）→ 策略元数据 / 提示词预览 / 状态查询 / 结果
//!              取出。
//! @ai-context: 顺序铁律（`ai_refine_start`，逐字搬运不得重排）：① 余额拦截先于配额
//!              消耗（否则余额不足被拒时配额已扣）② 去重检查在注册之前 ③ 落库失败
//!              只 eprintln! 不阻断（L4）④ 策略 resolve 后才 spawn_blocking。
//! @ai-context: 副作用/边界：`MOCK_ENV`（AI_REFINE_MOCK=1）经 std::env 直读全局 env
//!              （不可注入，既有缺陷只搬不改）；余额查询是**同步**网络调用；
//!              `ai_tasks`/`ai_guardrails`/`ai_settings` 的锁点与 drop 时点逐字未变。

use tauri::State;

use crate::ai_cost::estimate_for_content_model;
use crate::ai_note_refine::NoteRefinePrompt;
use crate::ai_strategy::{RefineStrategyMeta, StrategyOverride};
use crate::ai_task::AiTaskState;
use crate::commands::AppState;
use crate::commands_session_note::build_rule_draft_with_analysis;
use crate::note_filter::PurifyEnv;
use crate::video_profile::ProfileKind;

use super::dto::{AiRefineResult, AiTaskHandle, RefineEstimateView};
use super::gate::ensure_balance_for;
use super::registry::{claim_task_id, trim_tasks, AiTaskEntry};

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
