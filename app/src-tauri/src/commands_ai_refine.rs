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
use crate::ai_note_refine::NoteRefinePrompt;
use crate::ai_strategy::{RefineStrategyMeta, StrategyOverride};
use crate::ai_task::AiTaskState;
use crate::commands::AppState;
use crate::commands_session_note::build_rule_draft_with_analysis;
use crate::anchor_strip::strip_anchors;
use crate::note_diff::{diff_sections, DiffOp, DiffStats, SectionDiff};
use crate::note_filter::PurifyEnv;
use crate::note_version::VersionMeta;
use crate::types::{NewNote, Note};
use crate::video_profile::ProfileKind;

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
    /// v0.17.0：本次策略溯源（档位 + 每维最终值——工作台溯源条数据源；
    /// serde default 向前兼容：旧任务结果无此字段）
    #[serde(default)]
    pub strategy: Option<RefineStrategyInfo>,
}

/// 策略溯源信息（AI 产出按什么规则变的——工作台溯源条展示）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineStrategyInfo {
    /// 档位 id（standard/faithful/deep/minimal/custom 或 intent:xxx——名称由前端
    /// 按 meta 声明解析，未知 id 原样展示——诚实不猜）
    pub preset_id: String,
    /// 每维最终值（key → value；chips 渲染源）
    pub dims: std::collections::HashMap<String, String>,
    /// 自定义档自由文本（仅 preset=custom 时有值——溯源条/重生成沿用，REQ-279）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_text: Option<String>,
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
        crate::ai_refine_task::run_refine_task(st2, task_id, session_id, mock, dims)
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
    let note_row = state
        .db
        .get_note(note.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())?;
    // REQ-278：采纳落库 = 笔记内容变更 → 广播 notes 域（任务中心/会话页采纳后笔记页即时刷新）
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    Ok(note_row)
}

// ────────────────────────────────────────────────────────────
// 精修工作台（Task 11 / spec 6️⃣——规则草稿+精修结果+章节分组 diff 一次取全）
// ────────────────────────────────────────────────────────────

/// 工作台数据（前端 RefineWorkbench 模态数据源）。
///
/// @ai-context: 必须 camelCase（与 AiRefineResult 等兄弟结构体一致）——本模块
///              其余结构体均已 2026-08 统一契约；此处缺失曾导致前端按
///              ruleMarkdown 读取得到 undefined → renderMd(undefined).split
///              （"Cannot read properties of undefined (reading 'split')"，
///              v0.11.5 引入、真机验收漏测，v0.12.3 修复补测）。
/// @ai-context: 嵌套 section（SectionDiff）保持 snake_case 是刻意契约
///              （首次出现即定，前端类型注释"勿改"），rename 只作用于顶层键。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchData {
    pub rule_markdown: String,
    pub refined_markdown: Option<String>,
    pub sections: Vec<SectionDiff>,
    pub stats: DiffStats,
    pub meta: Option<VersionMeta>,
}

/// 工作台数据接口：规则草稿 + 精修结果 + 章节分组 diff 一次取全。
///
/// refined_markdown 为 None → 尚未精修；否则包含最新精修版内容与章节 diff。
///
/// @ai-context: 精修版三级数据源（修复：原实现只查已落库笔记——采纳前打开
///              工作台右侧恒空；且任务成功事件先于 DB 落库，存在竞态）：
///              ① refine_result 参数（调用方内存结果——采纳前刚完成的任务，
///                 消除竞态）② 最新未采纳成功任务（DB 持久化——重启后恢复）
///              ③ 已落库笔记最新版本（采纳后）。
#[tauri::command]
pub async fn refine_workbench(
    state: State<'_, AppState>,
    session_id: i64,
    refine_result: Option<AiRefineResult>,
) -> Result<WorkbenchData, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    // ① 构建规则草稿（与精修任务同管线）
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
    let rule_md = strip_anchors(&draft.markdown);

    // ② 精修版数据源：内存结果（优先）＞ 未采纳成功任务（DB 兜底）＞ 已落库笔记
    let unadopted = state
        .db
        .find_latest_unadopted_refine(session_id)
        .map_err(|e| e.to_string())?;
    let pending_result: Option<AiRefineResult> = match (refine_result, unadopted) {
        (Some(r), _) => Some(r),
        // 解析失败降级（日志可观测——不影响工作台打开，可经任务中心重取）
        (None, Some(task)) => task.result_json.as_deref().and_then(|j| {
            serde_json::from_str::<AiRefineResult>(j)
                .map_err(|e| eprintln!("[refine-workbench] 未采纳任务 {} 结果解析失败: {}", task.task_id, e))
                .ok()
        }),
        (None, None) => None,
    };

    let note = state.db.find_note_by_session(session_id).map_err(|e| e.to_string())?;
    let (refined_md, sections, stats, meta) = if let Some(result) = pending_result {
        let secs = diff_sections(&rule_md, &result.refined_markdown);
        let st = stats_from(&secs);
        // 未落库：成本按模型单价在 apply 时核算——此处不做虚假回填
        let m = VersionMeta {
            cost_yuan: None,
            model: Some(result.model.clone()),
            slices: Some(result.slices),
            merged_from: None,
        };
        (Some(result.refined_markdown), secs, st, Some(m))
    } else if let Some(ref note) = note {
        // 取最新版本内容作为精修版
        let versions = state.db.list_versions(note.id).map_err(|e| e.to_string())?;
        let latest = versions.last()
            .map(|v| v.content.clone())
            .unwrap_or_else(|| note.content.clone());
        let secs = diff_sections(&rule_md, &latest);
        let st = stats_from(&secs);
        // 取最新版本 meta
        let m = versions.last().map(|v| VersionMeta {
            cost_yuan: v.meta.cost_yuan,
            model: v.meta.model.clone(),
            slices: v.meta.slices,
            merged_from: v.meta.merged_from.clone(),
        });
        (Some(latest), secs, st, m)
    } else {
        (None, vec![], DiffStats { added: 0, removed: 0, unchanged: 0 }, None)
    };

    Ok(WorkbenchData {
        rule_markdown: rule_md,
        refined_markdown: refined_md,
        sections,
        stats,
        meta,
    })
}

/// 章节分组 diff 统计（新增/删除/未变行数——与 diff_sections 同口径）。
fn stats_from(secs: &[SectionDiff]) -> DiffStats {
    DiffStats {
        added: secs.iter().map(|s| s.added_lines.len()).sum(),
        removed: secs.iter().map(|s| s.removed_lines.len()).sum(),
        unchanged: secs.iter()
            .filter(|s| s.status == crate::note_diff::DiffStatus::Unchanged)
            .count(),
    }
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
    // M1 统一门禁：Ollama 本地 Provider 无计费语义——跳过余额检查（m-7.3）
    if crate::commands_ai_providers::is_default_provider_local(st) {
        return Ok(());
    }
    if !crate::commands_ai_providers::default_provider_ready(st)? {
        return Err("未配置 API 密钥——请在设置页「AI 服务提供商」配置密钥（或使用 Ollama 本地）".to_string());
    }
    let api_key = crate::commands_ai_providers::resolve_default_provider_key(st)?.unwrap_or_default();
    let settings = st.ai_settings.lock().map_err(|e| format!("AI 设置锁中毒: {}", e))?.clone();
    let store = st.ai_providers.lock().map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?.clone();
    let cfg = crate::ai_client::AiClient::from_settings_with_store(&settings, Some(api_key), &store).config;
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

#[cfg(test)]
mod tests {
    use super::*;

    /// v0.12.3 回归（Bug#2）：WorkbenchData 顶层键必须 camelCase——
    /// 前端按 ruleMarkdown/refinedMarkdown 读取；snake_case 键使字段为
    /// undefined → renderMd(undefined).split 抛
    /// "Cannot read properties of undefined (reading 'split')"
    /// （原实现缺失 rename_all，v0.11.5 引入、真机验收漏测）。
    #[test]
    fn workbench_data_serializes_camel_case_top_level() {
        let data = WorkbenchData {
            rule_markdown: "# 标题\n正文".to_string(),
            refined_markdown: Some("# 标题\n精修正文".to_string()),
            sections: vec![crate::note_diff::SectionDiff {
                heading: "标题".to_string(),
                status: crate::note_diff::DiffStatus::Modified,
                removed_lines: vec!["正文".to_string()],
                added_lines: vec!["精修正文".to_string()],
            }],
            stats: crate::note_diff::DiffStats {
                added: 1,
                removed: 1,
                unchanged: 0,
            },
            meta: Some(crate::note_version::VersionMeta {
                cost_yuan: Some(0.01),
                model: Some("test-model".to_string()),
                slices: Some(1),
                merged_from: None,
            }),
        };
        let v = serde_json::to_value(&data).expect("序列化失败");
        let obj = v.as_object().expect("应为 JSON 对象");
        assert!(obj.contains_key("ruleMarkdown"), "顶层键必须为 ruleMarkdown（camelCase）");
        assert!(obj.contains_key("refinedMarkdown"), "顶层键必须为 refinedMarkdown（camelCase）");
        assert!(obj.contains_key("sections"));
        assert!(obj.contains_key("stats"));
        assert!(obj.contains_key("meta"));
        // 嵌套 SectionDiff 保持 snake_case（首次出现即定的契约，勿随顶层 rename）
        let sec = &obj["sections"][0];
        assert!(sec.get("removed_lines").is_some(), "SectionDiff 嵌套键保持 snake_case");
        assert!(sec.get("added_lines").is_some());
        assert_eq!(sec["status"], "modified");
    }

    /// stats_from：按 diff_sections 分组行数统计（工作台头部 新增/删除/未变 徽标）。
    #[test]
    fn stats_from_aggregates_section_lines() {
        use crate::note_diff::{DiffStatus, SectionDiff};
        let secs = vec![
            SectionDiff { heading: "A".into(), status: DiffStatus::Modified, removed_lines: vec!["a".into()], added_lines: vec!["A".into(), "B".into()] },
            SectionDiff { heading: "B".into(), status: DiffStatus::Unchanged, removed_lines: vec![], added_lines: vec![] },
            SectionDiff { heading: "C".into(), status: DiffStatus::Added, removed_lines: vec![], added_lines: vec!["c".into()] },
            SectionDiff { heading: "D".into(), status: DiffStatus::Removed, removed_lines: vec!["d".into()], added_lines: vec![] },
        ];
        let s = stats_from(&secs);
        assert_eq!(s.added, 3);
        assert_eq!(s.removed, 2);
        assert_eq!(s.unchanged, 1);
    }
}
