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

use crate::ai_client::AiClient;
use crate::ai_cost::{estimate_for_content, CostEstimate};
use crate::ai_mock::AiMockAdapter;
use crate::ai_note_refine::AiNoteRefineAdapter;
use crate::ai_refine_protocol::AiRefineRequest;
use crate::ai_task::{slice_note, AiTaskFailure, AiTaskState, SLICE_MAX_CHARS};
use crate::analysis::{analyze_session_opt, SessionAnalysis};
use crate::commands::AppState;
use crate::commands_session_note::build_rule_draft;
use crate::note_diff::{diff_markdown, diff_stats, DiffOp};
use crate::note_filter::PurifyEnv;
use crate::outline::{detect_outline_smart, OutlineConfig};
use crate::types::{NewNote, Note, SessionDetail};
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

/// 成本预估（REQ-143 基础版：按转写+OCR 字符数估算 token/费用——保守上界）。
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
    Ok(RefineEstimateView { estimate: estimate_for_content(chars), remember_cost_choice: remember })
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
    // ③ 注册任务 + 后台执行（spawn_blocking——网络/分析不阻塞异步运行时）
    let task_id = st.ai_task_seq.fetch_add(1, Ordering::Relaxed);
    {
        let mut tasks = st.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
        tasks.insert(task_id, AiTaskEntry { state: AiTaskState::Pending, result: None });
        trim_tasks(&mut tasks);
    }
    let st2 = st.clone();
    tauri::async_runtime::spawn_blocking(move || run_refine_task(st2, task_id, session_id, mock));
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

/// 采纳落库（REQ-141：diff 预览后用户采纳；v0.8.0 M4 版本化写路径——
/// ① 以规则基线建笔记（首快照）→ ② 精修版 = 新版本（ai-refine，含成本
/// meta）→ ③ 成本落库 note_ai_usage）。
#[tauri::command]
pub fn ai_refine_apply(
    state: State<'_, AppState>,
    session_id: i64,
    result: AiRefineResult,
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
    };
    let note = state.db.create_note(&new).map_err(|e| e.to_string())?;
    // ② 精修版落库（新版本 ai-refine + 成本 meta）
    let cost = crate::ai_cost::usage_cost(
        result.base_markdown.chars().count(),
        result.refined_markdown.chars().count(),
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
    state
        .db
        .get_note(note.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())
}

// ────────────────────────────────────────────────────────────
// 任务执行（spawn_blocking 内；纯编排）
// ────────────────────────────────────────────────────────────

/// 后台精修任务：规则草稿 → 切片 → 逐片精修（mock/云端）→ 合并 → diff。
fn run_refine_task(st: AppState, task_id: u64, session_id: i64, mock: bool) {
    let env = PurifyEnv {
        config: st.purify.clone(),
        symbol: st.symbol_normalize.clone(),
        corrections: st.ocr_corrections.clone(),
    };
    let outcome: Result<AiRefineResult, AiTaskFailure> = (|| {
        // ① 规则草稿（单一管线三出口——AI 输入基线 = 规则版输出基线）
        let draft = build_rule_draft(&st.db, &st.ui_junk, &env, &st.data_dir, session_id, None)
            .map_err(AiTaskFailure::Other)?;
        // ② 精修上下文（档案/章节/术语——与 apply_note_structure 同源分析）
        let session = st
            .db
            .get_session(session_id)
            .map_err(|e| AiTaskFailure::Other(e.to_string()))?
            .ok_or_else(|| AiTaskFailure::Other("会话不存在".to_string()))?;
        let kind = session
            .profile
            .as_deref()
            .map(ProfileKind::parse)
            .unwrap_or(ProfileKind::Lecture);
        let segments = st.db.list_segments(session_id).map_err(|e| AiTaskFailure::Other(e.to_string()))?;
        let ocr_blocks = st.db.list_ocr_blocks(session_id).map_err(|e| AiTaskFailure::Other(e.to_string()))?;
        let detail = SessionDetail {
            session: session.clone(),
            segments,
            ocr_blocks: ocr_blocks.clone(),
            events: Vec::new(),
            screens: Vec::new(),
        };
        let analysis: SessionAnalysis = analyze_session_opt(&detail, kind, &env.symbol);
        let outline = detect_outline_smart(&ocr_blocks, &draft.ocr_screens, &OutlineConfig::default());
        let chapters: Vec<String> = if outline.is_empty() {
            analysis
                .chapters
                .iter()
                .enumerate()
                .map(|(i, _)| format!("第 {} 节", i + 1))
                .collect()
        } else {
            outline.iter().map(|e| e.text.clone()).collect()
        };
        let glossary: Vec<String> = analysis.glossary.iter().map(|g| g.term.clone()).collect();
        // ③ 切片（≤8000 字/片；进度按片上报）
        let slices = slice_note(&draft.markdown, SLICE_MAX_CHARS);
        let total = slices.len();
        set_task(&st, task_id, AiTaskState::Running { finished_slices: 0, total_slices: total });
        let settings = st.ai_settings.lock().map_err(|e| AiTaskFailure::Other(e.to_string()))?.clone();
        let client = AiClient::from_settings(&settings, st.ai_credentials.load_key().ok().flatten());
        let adapter = AiNoteRefineAdapter::new(client.clone());
        let mock_adapter = AiMockAdapter;
        let mut refined = String::new();
        for (i, slice) in slices.iter().enumerate() {
            let req = AiRefineRequest {
                content: slice.clone(),
                profile: kind.as_str().to_string(),
                glossary: glossary.clone(),
                chapters: chapters.clone(),
            };
            let resp = if mock {
                mock_adapter.refine(&req)
            } else {
                adapter.refine(&req).map_err(AiTaskFailure::from)?
            };
            if !refined.is_empty() {
                refined.push_str("\n\n");
            }
            refined.push_str(&resp.to_markdown());
            set_task(
                &st,
                task_id,
                AiTaskState::Running { finished_slices: i + 1, total_slices: total },
            );
        }
        // ④ 合并 + 与规则版 diff（基线=本地版，AI 变化点高亮）
        let diff = diff_markdown(&draft.markdown, &refined);
        let (added, removed, _) = diff_stats(&diff);
        Ok(AiRefineResult {
            title: draft.title.clone(),
            base_markdown: draft.markdown.clone(),
            refined_markdown: refined,
            diff,
            added_lines: added,
            removed_lines: removed,
            slices: total,
            model: client.config.model,
        })
    })();
    match outcome {
        Ok(result) => {
            {
                let mut tasks = st.ai_tasks.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(entry) = tasks.get_mut(&task_id) {
                    entry.result = serde_json::to_value(&result).ok();
                }
            }
            set_task(&st, task_id, AiTaskState::Succeeded);
        }
        Err(reason) => set_task(&st, task_id, AiTaskState::Failed { reason }),
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
pub(crate) fn trim_tasks(tasks: &mut HashMap<u64, AiTaskEntry>) {
    if tasks.len() <= TASKS_CAP {
        return;
    }
    let mut ids: Vec<u64> = tasks.iter().filter_map(|(id, t)| match t.state {
        AiTaskState::Pending | AiTaskState::Running { .. } => None,
        _ => Some(*id),
    }).collect();
    ids.sort_unstable();
    let excess = tasks.len() - TASKS_CAP;
    for id in ids.into_iter().take(excess) {
        tasks.remove(&id);
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
