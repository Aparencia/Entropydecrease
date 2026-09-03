//! 知识补充 commands（REQ-142，v0.8.0 M3）。
//!
//! @ai-context: 入口=笔记详情页「✨ 知识补充」（与精修语义分开：精修=处理
//!              已有内容，补充=生成新内容）→ 子项勾选（记忆上次选择——
//!              前端 localStorage）→ 成本预估确认 → 异步任务（切片复用
//!              REQ-145 基建，锚点跨片=全局章节标题）→ 混合落位（深度就近/
//!              广度扩展区）→ 采纳 update_note / 撤销（base 还原——
//!              删除无残留）。
//! @ai-context: 授权红线：start 走 content_gate（enabled+authorized）+ 本次
//!              上传确认；任务注册表/事件/容量守卫复用 commands_ai_refine
//!              （AiTaskEntry.result 为 JSON——精修/补充共用注册表）；
//!              mock 模式（AI_ENRICH_MOCK=1）供测试/离线开发。

use std::sync::atomic::Ordering;

use tauri::State;

use crate::ai_client::AiClient;
use crate::ai_cost::estimate_for_content_model;
use crate::ai_enrich_protocol::{AiEnrichBlock, AiEnrichKind, AiEnrichRequest, AiEnrichResponse};
use crate::ai_mock::AiMockAdapter;
use crate::ai_note_enrich::{AiNoteEnrichAdapter, EnrichOutcome};
use crate::ai_task::{slice_note, AiTaskFailure, AiTaskState, SLICE_MAX_CHARS};
use crate::commands::AppState;
use crate::commands_ai_refine::{
    set_task, trim_tasks, AiTaskEntry, AiTaskHandle, RefineEstimateView,
};
use crate::enrich_placement::render_enriched_note;
use crate::enrich_salvage::{chapter_titles_of, salvage_blocks};
use crate::types::Note;

/// mock 模式 env 键（本地规则补充，不联网——测试/离线开发）。
const MOCK_ENV: &str = "AI_ENRICH_MOCK";

/// 补充成功载荷（混合落位 markdown + base 供撤销 + 统计）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichResult {
    pub note_id: i64,
    /// 补充前内容（撤销/删除全部补充块——无残留）
    pub base_markdown: String,
    /// 补充后内容（深度就近插入 + 广度扩展区）
    pub enriched_markdown: String,
    pub blocks: usize,
    pub depth_blocks: usize,
    pub breadth_blocks: usize,
    /// 切片数（长笔记任务执行时的切片数——成本记录用）
    pub slices: usize,
    /// 实际返回的子项（kebab-case）
    pub kinds: Vec<String>,
    /// 丢弃块数（2026-09 修复：逐块审查回执——被隔离的违规块数与原因可见）
    #[serde(default)]
    pub dropped_blocks: usize,
    /// 丢弃原因（逐条人类可读；为空=无丢弃——UI 明示"哪些块为何未落"）
    #[serde(default)]
    pub dropped_reasons: Vec<String>,
    pub model: String,
}

/// 成本预估（复用精修预估视图——同构：estimate + 记住选择）。
#[tauri::command]
pub fn ai_enrich_estimate(
    state: State<'_, AppState>,
    note_id: i64,
    selected_kinds: Vec<AiEnrichKind>,
) -> Result<RefineEstimateView, String> {
    let kinds = normalize_kinds(selected_kinds)?;
    let note = get_note(state.inner(), note_id)?;
    // 预估 = 笔记正文 + 子项提示词开销（每子项约 80 字符的系统说明——
    // 保守上界，与 ai_cost 字符→token 同口径；F1：按模型映射单价 + 输出 token）
    let chars = note.content.chars().count() + kinds.len() * 80;
    let remember = state.ai_settings.lock().map(|s| s.remember_cost_choice).unwrap_or(false);
    let model = state.ai_settings.lock().map(|s| s.model.clone()).unwrap_or_default();
    Ok(RefineEstimateView { estimate: estimate_for_content_model(chars, &model), remember_cost_choice: remember })
}

/// 启动知识补充异步任务（授权红线 + 密钥解析 + 后台切片批量补充）。
#[tauri::command]
pub async fn ai_enrich_start(
    state: State<'_, AppState>,
    note_id: i64,
    selected_kinds: Vec<AiEnrichKind>,
    authorized: bool,
) -> Result<AiTaskHandle, String> {
    let kinds = normalize_kinds(selected_kinds)?;
    let st: AppState = (*state).clone();
    let settings = st.ai_settings.lock().map_err(|e| format!("AI 设置锁中毒: {}", e))?.clone();
    settings.content_gate()?;
    if !authorized {
        return Err("本次上传未确认——请先阅读并同意授权说明".to_string());
    }
    let mock = std::env::var(MOCK_ENV).map(|v| v == "1").unwrap_or(false);
    if !mock {
        let ready = crate::commands_ai_providers::default_provider_ready(&st)?;
        if !ready {
            return Err("未配置 API 密钥（请在设置页 AI 服务提供商中配置）".to_string());
        }
    }
    // F1 修复（2026-08-21）+ 审查修复（2026-08-21）：任务去重——按
    // **目标笔记**粒度检查（防同笔记重复扣费；不同笔记互不阻塞）
    {
        let tasks = st.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
        let active = tasks.values().any(|t| {
            t.target_id == note_id
                && matches!(t.state, crate::ai_task::AiTaskState::Pending | crate::ai_task::AiTaskState::Running { .. })
        });
        if active {
            return Err("该笔记已有进行中的 AI 任务——请等待完成或到任务中心查看进度（防重复扣费）".to_string());
        }
    }
    // F1/F3-D 修复（2026-08-21）：成本硬拦截 + 每日配额接入。
    // 顺序铁律（审查修复）：先余额拦截（失败不消耗配额），后消耗配额。
    if !mock {
        let note = get_note(&st, note_id)?;
        let chars = note.content.chars().count();
        let model = st.ai_settings.lock().map(|s| s.model.clone()).unwrap_or_default();
        crate::commands_ai_refine::ensure_balance_for(&st, chars, &model)?;
        let slices = if chars == 0 {
            0
        } else {
            chars.saturating_add(crate::ai_task::SLICE_MAX_CHARS - 1) / crate::ai_task::SLICE_MAX_CHARS
        };
        let now = crate::db_sessions_rows::unix_seconds();
        let mut guards = st.ai_guardrails.lock().map_err(|e| format!("护栏状态锁中毒: {}", e))?;
        for _ in 0..slices {
            if !guards.quota.try_consume(now) {
                return Err("今日 AI 补充配额已用完（请明日再试或到设置页调整）".to_string());
            }
        }
        drop(guards);
    }
    let task_id = st.ai_task_seq.fetch_add(1, Ordering::Relaxed);
    {
        let mut tasks = st.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
        tasks.insert(task_id, AiTaskEntry { state: AiTaskState::Pending, result: None, target_id: note_id });
        trim_tasks(&mut tasks);
    }
    // F2 任务中心（2026-08-21）：任务记录落库。L4 修复：写库失败仍不阻断
    // AI 调用，但不再静默（落库失败 = 重启后任务不可恢复，必须可观测）
    if let Err(e) = st.db.insert_ai_task(&crate::db_ai_tasks::AiTaskRecord {
        task_id,
        op_type: "enrich".to_string(),
        ref_id: note_id,
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
        target_kind: Some("note".to_string()),
    }) {
        eprintln!("[AiTasks] enrich 任务 {} 落库失败（不阻断 AI 调用；重启后不可恢复）: {}", task_id, e);
    }
    let st2 = st.clone();
    tauri::async_runtime::spawn_blocking(move || run_enrich_task(st2, task_id, note_id, kinds, mock));
    Ok(AiTaskHandle { task_id, state: AiTaskState::Pending })
}

/// 补充结果（仅成功后可取；失败/进行中返回明确错误）。
#[tauri::command]
pub fn ai_enrich_result(state: State<'_, AppState>, task_id: u64) -> Result<AiEnrichResult, String> {
    let tasks = state.ai_tasks.lock().map_err(|e| format!("任务注册表锁中毒: {}", e))?;
    let entry = tasks.get(&task_id).ok_or_else(|| format!("任务不存在: {}", task_id))?;
    match (&entry.state, &entry.result) {
        (AiTaskState::Succeeded, Some(v)) => serde_json::from_value(v.clone())
            .map_err(|e| format!("补充结果反序列化失败: {}", e)),
        (AiTaskState::Succeeded, None) => Err("任务成功但结果缺失（内部状态异常）".to_string()),
        (AiTaskState::Failed { reason }, _) => Err(format!("任务失败（{}）: {}", reason.kind(), reason.message())),
        _ => Err("任务仍在进行中".to_string()),
    }
}

/// 采纳落库（v0.8.0 M4 版本化写路径：新版本 ai-enrich + 成本 meta +
/// note_ai_usage 落库——"重新生成"从覆盖变为新版本）。
/// @ai-context: F2（2026-08-21）：task_id 可选——传入时标记任务已采纳
///              （防重启后从任务中心重复采纳）。
#[tauri::command]
pub fn ai_enrich_apply(
    state: State<'_, AppState>,
    note_id: i64,
    result: AiEnrichResult,
    task_id: Option<u64>,
) -> Result<Note, String> {
    // 存在性校验（versioned_save 内部也会校验——提前失败给明确错误）
    get_note(state.inner(), note_id)?;
    // 审查修复（2026-08-21）：落库成本用模型感知单价（与预估同口径）
    let cost = crate::ai_cost::usage_cost_for_model(
        result.base_markdown.chars().count(),
        result.enriched_markdown.chars().count(),
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
            note_id,
            &result.enriched_markdown,
            crate::note_version::NoteVersionSource::AiEnrich,
            &meta,
        )
        .map_err(|e| e.to_string())?;
    state
        .db
        .record_ai_usage(
            note_id,
            &crate::db_ai_usage::AiUsageInput {
                op_type: "enrich",
                tokens_in: result.base_markdown.chars().count(),
                tokens_out: result.enriched_markdown.chars().count(),
                cost_yuan: cost,
                model: result.model.clone(),
                slices: result.slices,
            },
        )
        .map_err(|e| e.to_string())?;
    // F2 任务中心：标记采纳 + 成本回填（task_id 可选；防重启后重复采纳）。
    // 审查修复（2026-08-21）：服务端前置校验已采纳状态（前端禁用 + 服务端
    // 兜底双保险——防异常调用重复建笔记）。
    if let Some(tid) = task_id {
        if state.db.is_ai_task_adopted(tid) {
            return Err("该任务结果已采纳落库——请勿重复采纳（可到笔记页查看）".to_string());
        }
        let _ = state.db.mark_ai_task_adopted(tid);
        let _ = state.db.update_ai_task_cost(tid, cost);
    }
    get_note(state.inner(), note_id)
}

/// 撤销补充（删除无残留——内容还原补充前 base；v0.8.0 M4：= 新版本 user_edit）。
#[tauri::command]
pub fn ai_enrich_revert(
    state: State<'_, AppState>,
    note_id: i64,
    base_markdown: String,
) -> Result<Note, String> {
    get_note(state.inner(), note_id)?;
    state
        .db
        .versioned_save(
            note_id,
            &base_markdown,
            crate::note_version::NoteVersionSource::UserEdit,
            &crate::note_version::VersionMeta::default(),
        )
        .map_err(|e| e.to_string())?;
    get_note(state.inner(), note_id)
}

// ────────────────────────────────────────────────────────────
// 任务执行 + 校验辅助
// ────────────────────────────────────────────────────────────

/// 后台补充任务：读笔记 → 切片 → 逐片批量补充（mock/云端）→ 合并 → 混合落位。
fn run_enrich_task(st: AppState, task_id: u64, note_id: i64, selected: Vec<AiEnrichKind>, mock: bool) {
    let started = std::time::Instant::now();
    // v0.16.0（REQ-230）：返回轨迹（每片提示词/回答——任务对话视图数据源）
    let outcome: Result<(AiEnrichResult, Vec<crate::ai_chat::AiTurn>), AiTaskFailure> = (|| {
        let note = st
            .db
            .get_note(note_id)
            .map_err(|e| AiTaskFailure::Other(e.to_string()))?
            .ok_or_else(|| AiTaskFailure::Other("笔记不存在".to_string()))?;
        // 档案：关联会话档案（无则空=提示词回退讲义式）。DB 错误吞掉是有意
        // 降级（补充不因档案缺失失败——档案只是提示词参考，非必需输入）
        let profile = match note.session_id {
            Some(sid) => st
                .db
                .get_session(sid)
                .ok()
                .flatten()
                .and_then(|s| s.profile)
                .unwrap_or_default(),
            None => String::new(),
        };
        let settings = st.ai_settings.lock().map_err(|e| AiTaskFailure::Other(e.to_string()))?.clone();
        let store = st.ai_providers.lock().map_err(|e| AiTaskFailure::Other(format!("AI Provider 存储锁中毒: {}", e)))?.clone();
        // m-2：密钥解析错误统一传播（原 .ok().flatten() 静默吞错）
        let client = AiClient::from_settings_with_store(
            &settings,
            crate::commands_ai_providers::resolve_default_provider_key(&st)
                .map_err(AiTaskFailure::Other)?,
            &store,
        );
        let adapter = AiNoteEnrichAdapter::new(client.clone());
        let mock_adapter = AiMockAdapter;
        // 全篇章节目录（2026-09 修复：跨片全局注入——切片正文常不含章节标题，
        // 目录=anchor_ref 白名单；空=笔记无章节，深度块允许 null 锚点落尾部）
        let chapter_dir = chapter_titles_of(&note.content);
        // 切片（长笔记按章节切——REQ-145 基建复用；锚点跨片=全局章节标题）
        let slices = slice_note(&note.content, SLICE_MAX_CHARS);
        let total = slices.len();
        set_task(&st, task_id, AiTaskState::Running { finished_slices: 0, total_slices: total });
        let mut all_blocks: Vec<AiEnrichBlock> = Vec::new();
        // 2026-09 修复：逐块审查丢弃回执（坏块隔离，原因跨片聚合随结果返回）
        let mut dropped_reasons_all: Vec<String> = Vec::new();
        let mut turns: Vec<crate::ai_chat::AiTurn> = Vec::with_capacity(total);
        for (i, slice) in slices.iter().enumerate() {
            let req = AiEnrichRequest {
                note_content: slice.clone(),
                selected_kinds: selected.clone(),
                profile: profile.clone(),
                chapter_directory: chapter_dir.clone(),
            };
            // 单片重试 1 次（审查修复 2026-08-21：与精修 SLICE_RETRY 对齐——
            // 网络抖动瞬态失败直接重试，避免整任务失败浪费已成功的片）
            let mut outcome: Option<EnrichOutcome> = None;
            for attempt in 0..=1 {
                let r = if mock {
                    Ok(EnrichOutcome {
                        response: mock_adapter.enrich(&req, &selected),
                        dropped_reasons: Vec::new(),
                    })
                } else {
                    adapter.enrich(&req, &selected).map_err(AiTaskFailure::from)
                };
                match r {
                    Ok(v) => {
                        // REQ-230：成功片记录轨迹（提示词/回答原文）
                        turns.push(crate::ai_chat::AiTurn {
                            turn: i + 1,
                            system: adapter.prompt.build_system(&selected),
                            user: serde_json::to_string(&req).unwrap_or_default(),
                            response: serde_json::to_string(&v.response).unwrap_or_default(),
                        });
                        outcome = Some(v);
                        break;
                    }
                    Err(e) if attempt < 1 => {
                        eprintln!("[enrich-task] task={} 片 {} 第{}次失败，重试: {}", task_id, i + 1, attempt + 1, e.message());
                    }
                    Err(e) => return Err(e),
                }
            }
            let outcome = outcome.expect("重试循环必然产出结果或返回");
            dropped_reasons_all.extend(outcome.dropped_reasons);
            all_blocks.extend(outcome.response.blocks);
            set_task(
                &st,
                task_id,
                AiTaskState::Running { finished_slices: i + 1, total_slices: total },
            );
        }
        // 合并后整体复审（2026-09 修复：逐块审查替代全有或全无 validate——
        // 单片已隔离违规块；此处兜底跨片总量上限，全部不合规 → 不落任何内容）
        let final_out = salvage_blocks(
            AiEnrichResponse { blocks: all_blocks },
            &selected,
            &chapter_dir,
        )
        .map_err(AiTaskFailure::InvalidResponse)?;
        dropped_reasons_all.extend(final_out.dropped_reasons);
        let resp = AiEnrichResponse { blocks: final_out.kept };
        let enriched = render_enriched_note(&note.content, &resp);
        let depth = resp.blocks.iter().filter(|b| b.kind.is_depth()).count();
        let breadth = resp.blocks.len() - depth;
        let kinds: Vec<String> = resp.blocks.iter().map(|b| b.kind.as_str().to_string()).collect();
        Ok((
            AiEnrichResult {
                note_id,
                base_markdown: note.content,
                enriched_markdown: enriched,
                blocks: resp.blocks.len(),
                depth_blocks: depth,
                breadth_blocks: breadth,
                slices: total,
                kinds,
                dropped_blocks: dropped_reasons_all.len(),
                dropped_reasons: dropped_reasons_all,
                model: client.config.model,
            },
            turns,
        ))
    })();
    let elapsed_ms = started.elapsed().as_millis() as i64;
    match outcome {
        Ok((result, turns)) => {
            // v0.16.0（REQ-230）：轨迹落库（提示词/回答全文——任务对话视图数据源）
            if let Some(json) = crate::ai_chat::trajectory_to_json(&turns) {
                if let Err(e) = st.db.update_ai_task_trajectory(task_id, &json) {
                    eprintln!("[enrich-task] task={} 轨迹落库失败（不阻断）: {}", task_id, e);
                }
            }
            {
                let mut tasks = st.ai_tasks.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(entry) = tasks.get_mut(&task_id) {
                    entry.result = serde_json::to_value(&result).ok();
                }
            }
            set_task(&st, task_id, AiTaskState::Succeeded);
            // F1 修复（2026-08-21）：补充调用上审计（REQ-140 轨迹可见化）
            push_enrich_audit(&st, note_id, "ok", Some(&result.model));
            // F2 任务中心：终态落库（写库失败不阻断——H2 设计）+ 保留策略
            // 裁剪（审查修复：运行期终态后清理超限旧终态，防表膨胀）
            let result_json = serde_json::to_string(&result).ok();
            let _ = st.db.finish_ai_task(
                task_id,
                "succeeded",
                result_json.as_deref(),
                None,
                elapsed_ms,
            );
            let _ = st.db.trim_ai_tasks();
        }
        Err(reason) => {
            set_task(&st, task_id, AiTaskState::Failed { reason: reason.clone() });
            push_enrich_audit(&st, note_id, "error", None);
            let _ = st.db.finish_ai_task(
                task_id,
                "failed",
                None,
                Some(&format!("{}: {}", reason.kind(), reason.message())),
                elapsed_ms,
            );
            let _ = st.db.trim_ai_tasks();
        }
    }
}

/// 补充任务审计记录（F1：summary 不含原文——隐私红线）。
fn push_enrich_audit(st: &AppState, note_id: i64, result: &str, model: Option<&str>) {
    let now = crate::db_sessions_rows::unix_seconds();
    if let Ok(mut g) = st.ai_guardrails.lock() {
        g.push_audit(crate::ai_guardrails::AiAuditEntry {
            at_unix: now,
            upload_summary: format!(
                "enrich note={} model={}",
                note_id,
                model.unwrap_or("?")
            ),
            result: result.to_string(),
        });
    }
}

/// 子项校验：非空/去重/上限（勾选面板输入防御）。
fn normalize_kinds(selected: Vec<AiEnrichKind>) -> Result<Vec<AiEnrichKind>, String> {
    if selected.is_empty() {
        return Err("至少勾选一个补充子项".to_string());
    }
    if selected.len() > 9 {
        return Err("勾选子项超上限（最多 9 项）".to_string());
    }
    let mut seen: Vec<AiEnrichKind> = Vec::new();
    for k in selected {
        if !seen.contains(&k) {
            seen.push(k);
        }
    }
    Ok(seen)
}

/// 读笔记（命令共用：存在性 + 校验）。
fn get_note(state: &AppState, note_id: i64) -> Result<Note, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state
        .db
        .get_note(note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("笔记不存在: {}", note_id))
}
