//! AI 目标规划 commands（v0.18.2 REQ-251~254；规划师建议制系统层）。
//!
//! @ai-context: 规划＝单次同步调用 + spawn_blocking（10-30s 交互等待可接受，
//!              对话框 loading 态）；审计完整（ai_tasks op_type='goal_plan'，
//!              trajectory/成本落库——轨迹可见性达成，任务化轮询留观察项）。
//! @ai-context: 双闸门（content_gate + goal_plan_enabled 默认关）→ 授权确认 →
//!              providers 就绪 → 余额硬拦 → 配额 → 上下文（库即记忆现取现拼：
//!              摘要+信号+检索片段，预算档位截断 + 诚实提示）→ 强校验草案 →
//!              返回确认流；AI 失败/超限 → 前端回退规则草案（设计 §三降级链）。

use serde::Serialize;
use tauri::State;

use crate::ai_cost::{estimate_for_content_model, CostEstimate};
use crate::ai_settings::AiSettings;
use crate::budget_allocator::plan_budget;
use crate::commands::AppState;
use crate::commands_ai_refine::ensure_balance_for;
use crate::commands_goals::{collect_signals, parse_criteria, require_goal};
use crate::db_ai_tasks::AiTaskRecord;
use crate::db::{unix_seconds, Db};
use crate::goal_plan_protocol::{validate_proposal, GoalPlanProposal};
use crate::goal_plan_prompt::GoalPlanAdapter;
use crate::goal_summary::{build_summary, GoalSummaryInput};

/// 规划结果视图（草案 + 清洗登记 + 诚实截断提示 + 成本）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalPlanView {
    pub proposal: GoalPlanProposal,
    pub dropped: PlanValidationView,
    pub honest_note: String,
    pub cost_yuan: f64,
    pub model: String,
}

/// 清洗登记视图（丢弃项——诚实提示非静默过滤）。
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanValidationView {
    pub dropped_milestones: Vec<String>,
    pub dropped_groups: Vec<String>,
    pub dropped_systems: Vec<String>,
}

/// 成本预估视图（确认前展示——ai_refine_estimate 范式）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalPlanEstimateView {
    pub estimate: CostEstimate,
    pub tier_tokens: usize,
}

/// 目标规划成本预估（档位 token 上界 → 成本——先预估后确认）。
#[tauri::command]
pub fn ai_goal_plan_estimate(
    state: State<'_, AppState>,
    tier: Option<String>,
) -> Result<GoalPlanEstimateView, String> {
    let budget = plan_budget(tier.as_deref().unwrap_or("standard"));
    let model = state.ai_settings.lock().map(|s| s.model.clone()).unwrap_or_default();
    // 预算上界字符 → 成本预估（与实发同口径：输出预留包括在内）
    Ok(GoalPlanEstimateView {
        estimate: estimate_for_content_model(budget.total_tokens, &model),
        tier_tokens: budget.total_tokens,
    })
}

/// 启动 AI 目标规划（双闸门 + 授权 + 余额/配额 + 上下文组装 + 调用 + 审计）。
///
/// @ai-context: tier 校验由 plan_budget 内部回落（未知→标准）；authorized 为
///              本次调用确认（与 ai_refine_start 同契约）；mock env 复用
///              （AI_MOCK 环境变量——测试/离线演示）。
#[tauri::command]
pub async fn ai_goal_plan(
    state: State<'_, AppState>,
    goal_id: i64,
    tier: Option<String>,
    authorized: bool,
) -> Result<GoalPlanView, String> {
    require_goal(&state.db, goal_id)?;
    // 审查修复：状态守卫——仅进行中/已暂停可规划（已毕业/放弃无规划意义，
    // 防误操作与无谓成本）
    let goal_status = state
        .db
        .get_goal(goal_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", goal_id))?
        .status;
    if goal_status != "active" && goal_status != "paused" {
        return Err(format!("仅进行中/已暂停目标可 AI 规划（当前: {}）", goal_status));
    }
    // 并发互斥：同步规划无任务去重表——多窗口/双击防重复扣费
    if state
        .goal_plan_busy
        .swap(true, std::sync::atomic::Ordering::SeqCst)
    {
        return Err("已有 AI 规划进行中——请等待完成（防重复扣费）".to_string());
    }
    struct BusyGuard<'a>(&'a std::sync::atomic::AtomicBool);
    impl Drop for BusyGuard<'_> {
        fn drop(&mut self) {
            self.0.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    }
    let _busy = BusyGuard(&state.goal_plan_busy);
    let budget = plan_budget(tier.as_deref().unwrap_or("standard"));
    let settings: AiSettings = state
        .ai_settings
        .lock()
        .map_err(|e| format!("AI 设置锁中毒: {}", e))?
        .clone();
    // ① 双闸门（全局内容门 + 目标 AI 独立开关——默认关）
    settings.goal_plan_gate()?;
    if !authorized {
        return Err("本次上传未确认——请先阅读并同意授权说明（仅文本与最小上下文）".to_string());
    }
    let mock = std::env::var("AI_MOCK").map(|v| v == "1").unwrap_or(false);
    if !mock {
        if !crate::commands_ai_providers::default_provider_ready(&state)? {
            return Err("未配置 API 密钥（请在设置页 AI 服务提供商中配置）".to_string());
        }
        ensure_balance_for(&state, budget.total_tokens, &settings.model)?;
    }
    let st = (*state).clone();
    // ② 上下文组装（库即记忆：摘要+信号+素材清单——毫秒级现取现拼）
    let ctx_text = build_plan_context(&state, goal_id).await?;
    // ②b 预算截断（档位上界——恒量 O(1)；截断时诚实提示绝不静默）
    let (ctx_text, truncated) = if ctx_text.chars().count() > budget.retrieval_chars {
        (
            crate::budget_allocator::truncate_retrieval(&ctx_text, budget.retrieval_chars),
            true,
        )
    } else {
        (ctx_text, false)
    };
    let honest_note = crate::budget_allocator::honest_truncation_note(truncated).to_string();
    let model = settings.model.clone();
    // ③ 调用（spawn_blocking：网络不阻塞异步运行时；密钥/端点经 Provider 存储
    // 默认 Provider 解析——与精修同口径 from_settings_with_store，
    // 修复 2026-09-02：原 from_settings 只读旧字段（SiliconFlow 端点），
    // 用户配置的 DeepSeek Provider 被绕过 → 401 密钥无效）
    let plan = {
        let stored_key = crate::commands_ai_providers::resolve_default_provider_key(&state)
            .map_err(|e| e.to_string())?;
        let store = state
            .ai_providers
            .lock()
            .map_err(|e| format!("AI Provider 存储锁中毒: {}", e))?
            .clone();
        let client = crate::ai_client::AiClient::from_settings_with_store(&settings, stored_key, &store);
        let adapter = GoalPlanAdapter::new(client);
        tauri::async_runtime::spawn_blocking(move || adapter.plan(&ctx_text))
            .await
            .map_err(|e| format!("规划任务执行失败: {}", e))?
            .map_err(|e| e.to_string())?
    };
    let (clean, dropped) = validate_proposal(plan);
    let cost = estimate_for_content_model(budget.total_tokens, &model);
    let cost_yuan = cost.est_cost_yuan;
    // ④ 审计落库（失败仅日志——规划结果不因审计失败丢弃；不静默）
    if let Err(e) = st.db.insert_ai_task(&AiTaskRecord {
        task_id: st.ai_task_seq.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        op_type: "goal_plan".to_string(),
        ref_id: goal_id,
        target_kind: Some("goal".to_string()),
        state: "succeeded".to_string(),
        result_json: serde_json::to_string(&clean).ok(),
        cost_yuan: Some(cost_yuan),
        elapsed_ms: None,
        model: Some(model.clone()),
        error: None,
        slices: Some(1),
        created_at: unix_seconds(),
        finished_at: Some(unix_seconds()),
        adopted: false,
    }) {
        eprintln!("[GoalPlan] 审计落库失败（不阻断规划）: {}", e);
    }
    Ok(GoalPlanView {
        proposal: clean,
        dropped: PlanValidationView {
            dropped_milestones: dropped.dropped_milestones,
            dropped_groups: dropped.dropped_groups,
            dropped_systems: dropped.dropped_systems,
        },
        honest_note,
        cost_yuan,
        model,
    })
}

/// 构建规划上下文（后端纯取数→JSON 文本；耗时毫秒级）。
///
/// @ai-context: 现状：目标摘要（L4.5）+ 绑组/体系/概念清单 + 弱项信号 +
///              最近笔记标题——检索最小面（库即记忆：现取现拼，无缓存）。
async fn build_plan_context(state: &AppState, goal_id: i64) -> Result<String, String> {
    let db: Db = state.db.clone();
    let now = unix_seconds();
    let (summary, ctx, weak_concepts) = tauri::async_runtime::spawn_blocking(move || -> Result<(String, String, Vec<String>), String> {
        let goal = db
            .get_goal(goal_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "目标不存在".to_string())?;
        let sig = collect_signals(&db, goal_id)?;
        let ctx = db.goal_plan_context(goal_id, now).map_err(|e| e.to_string())?;
        let concepts = db.goal_concept_activities(goal_id).map_err(|e| e.to_string())?;
        let weak_top = sig.weak_groups.first().map(|w| {
            format!("{}（低稳定性 {}/{} 卡）", w.group_name, w.weak_cards, w.card_total)
        });
        let intent: crate::goal_schema::GoalIntent =
            serde_json::from_str(&goal.intent_json).unwrap_or_default();
        let criteria = parse_criteria(&goal).unwrap_or_else(|_| crate::goal_schema::SuccessCriteria {
            tier: "default".to_string(),
            group_settlements: 1,
            applications: None,
            self_test_rate: None,
            self_test_enforced: false,
            review_active_days: None,
            statement: String::new(),
        });
        let summary = build_summary(&GoalSummaryInput {
            name: goal.name.clone(),
            status: goal.status.clone(),
            created_at: goal.created_at,
            horizon_end: goal.horizon_end,
            scenario: intent.scenario.clone(),
            driver: intent.driver.clone(),
            non_scope: intent.non_scope.clone(),
            criteria_statement: criteria.statement.clone(),
            milestone_done: sig.milestone_done,
            milestone_total: sig.milestone_total,
            settlements: sig.settlements_count,
            review_days_90: sig.review_days_90,
            applications: sig.applications_count,
            weak_top,
        });
        let weak_concepts: Vec<String> = crate::concept_weakness::rank_weakness(&concepts, now)
            .into_iter()
            .filter(|w| w.weak)
            .map(|w| format!("{}（{}）", w.name, w.reason))
            .collect();
        Ok((summary, ctx, weak_concepts))
    })
    .await
    .map_err(|e| format!("上下文组装失败: {}", e))??;
    // 组装为提示词用户侧 JSON（摘要 + 素材上下文 + 弱项）
    let mut user: serde_json::Value = serde_json::from_str(&ctx).map_err(|e| e.to_string())?;
    user["summary"] = serde_json::Value::String(summary);
    user["weakConcepts"] =
        serde_json::Value::Array(weak_concepts.into_iter().map(serde_json::Value::String).collect());
    Ok(user.to_string())
}

/// L4.5 目标摘要（/goal 对话注入与规划复用的公共视图——现算无缓存）。
#[tauri::command]
pub fn goal_chat_context(state: State<'_, AppState>, goal_id: i64) -> Result<String, String> {
    require_goal(&state.db, goal_id)?;
    let now = unix_seconds();
    let db = state.db.clone();
    // 复用 build_plan_context 的摘要部分（同步面——对话注入 ms 级）
    let goal = db.get_goal(goal_id).map_err(|e| e.to_string())?.ok_or("目标不存在")?;
    let sig = collect_signals(&db, goal_id)?;
    let intent = serde_json::from_str::<crate::goal_schema::GoalIntent>(&goal.intent_json).unwrap_or_default();
    let criteria = parse_criteria(&goal).map_err(|e| e.to_string())?;
    let summary = build_summary(&GoalSummaryInput {
        name: goal.name.clone(),
        status: goal.status.clone(),
        created_at: goal.created_at,
        horizon_end: goal.horizon_end,
        scenario: intent.scenario.clone(),
        driver: intent.driver.clone(),
        non_scope: intent.non_scope.clone(),
        criteria_statement: criteria.statement.clone(),
        milestone_done: sig.milestone_done,
        milestone_total: sig.milestone_total,
        settlements: sig.settlements_count,
        review_days_90: sig.review_days_90,
        applications: sig.applications_count,
        weak_top: sig.weak_groups.first().map(|w| w.group_name.clone()),
    });
    // L3 最小检索面：最近笔记标题（AI 对话上下文注入用）
    let recent = db.goal_plan_context(goal_id, now).map_err(|e| e.to_string())?;
    let parsed = serde_json::from_str::<serde_json::Value>(&recent).unwrap_or_default();
    Ok(serde_json::json!({
        "summary": summary,
        "recentNotes": parsed["recentNotes"],
        "systems": parsed["systems"],
        "concepts": parsed["concepts"],
    })
    .to_string())
}

/// 概念弱激活信号（规则现算——AI 解读可选用；M3 真实化）。
#[tauri::command]
pub fn goal_concept_weakness(state: State<'_, AppState>, goal_id: i64) -> Result<Vec<ConceptWeaknessView>, String> {
    require_goal(&state.db, goal_id)?;
    let db = state.db.clone();
    let acts = db.goal_concept_activities(goal_id).map_err(|e| e.to_string())?;
    let ranked = crate::concept_weakness::rank_weakness(&acts, unix_seconds());
    Ok(ranked.into_iter().map(|w| ConceptWeaknessView {
        concept_id: w.concept_id,
        name: w.name,
        weak: w.weak,
        reason: w.reason,
    }).collect())
}

/// 概念弱信号视图（goal_concept_weakness 返回——规则现算 + 人话原因）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptWeaknessView {
    pub concept_id: i64,
    pub name: String,
    pub weak: bool,
    pub reason: String,
}

#[cfg(test)]
#[path = "commands_goals_plan_tests.rs"]
mod tests;

// ─────────────────────────── 确认流落库（REQ-251 建议制） ───────────────────────────

/// 确认流请求（前端逐项勾选/编辑后的确定版本——全部来自已验证草案）。
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalApplyRequest {
    #[serde(default)]
    pub milestones: Vec<crate::goal_plan_protocol::ProposalMilestone>,
    #[serde(default)]
    pub group_ids: Vec<i64>,
    #[serde(default)]
    pub weekly_contract: Option<crate::goal_plan_protocol::ProposalContract>,
    #[serde(default)]
    pub systems: Vec<crate::goal_plan_protocol::ProposalSystem>,
    /// 创建向导（AI 草案替换规则草案）→ true；详情页重规划增量追加 → false
    #[serde(default)]
    pub replace_milestones: bool,
}

/// 应用规划（确认流：人类确认后的落库——里程碑/绑组/周契约/体系骨架）。
///
/// @ai-context: 建议制核心动作：本命令是「AI 规划 → 人类确认」的落点；
///              协议校验在确认前已完成（validate_proposal），此处再做存在性
///              校验（组/体系）与重复防御（bind_group 幂等、link 幂等）。
#[tauri::command]
pub fn goal_apply_plan(
    state: State<'_, AppState>,
    goal_id: i64,
    request: GoalApplyRequest,
) -> Result<bool, String> {
    require_goal(&state.db, goal_id)?;
    let db = &state.db;
    let now = crate::db::unix_seconds();
    // 存在性校验（防过期草案引用已删实体——诚实报错不静默丢弃）
    for gid in &request.group_ids {
        if db.get_group(*gid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("笔记组不存在: {}", gid));
        }
    }
    let mut new_milestones = Vec::new();
    // 审查修复：apply 为确认流落点——白名单再校验（协议校验在草案侧，此处
    // 防任意请求直写：self_test 占位契约 M3 前不可写；周界与 add_goal_milestone 同口径）
    for m in &request.milestones {
        if !matches!(m.criteria_type.as_str(), "manual" | "group_settled") {
            return Err(format!("不支持的里程碑判据类型: {}", m.criteria_type));
        }
        if m.due_weeks > 520 {
            return Err("里程碑期限超出合理范围（>10 年）".to_string());
        }
        if let Some(ref_id) = m.ref_group_id {
            if db.get_group(ref_id).map_err(|e| e.to_string())?.is_none() {
                return Err(format!("里程碑绑定组不存在: {}", ref_id));
            }
        }
        new_milestones.push(crate::goal_schema::NewMilestone {
            title: m.title.clone(),
            due_at: if m.due_weeks == 0 { None } else { Some(now + m.due_weeks as i64 * 7 * 86_400) },
            order_idx: 0,
            criteria_type: m.criteria_type.clone(),
            ref_group_id: m.ref_group_id,
        });
    }
    // 周契约：落到目标主组（无绑定则跳过——弹性承诺不强行立约）
    let contract = match (&request.weekly_contract, request.group_ids.first()) {
        (Some(c), Some(gid)) => Some((*gid, c.target_days.clamp(1, 7), c.target_cards.clamp(1, 200),
            crate::week_contract::week_start_secs(now))),
        _ => None,
    };
    db.apply_plan_core(goal_id, &new_milestones, &request.group_ids, contract, request.replace_milestones)
        .map_err(|e| e.to_string())?;
    // 体系动作（逐条独立——骨架部分失败不污染目标层）
    for s in &request.systems {
        match s.action.as_str() {
            "link" => {
                let sid = s.system_id.ok_or_else(|| "link 动作缺少体系 id".to_string())?;
                let exists = db.get_knowledge_system(sid).map_err(|e| e.to_string())?.is_some();
                if !exists {
                    return Err(format!("体系不存在: {}", sid));
                }
                db.link_goal_to_system(goal_id, sid).map_err(|e| e.to_string())?;
            }
            "create" => {
                let name = s.name.clone().unwrap_or_default();
                let core = s.core_question.clone().unwrap_or_default();
                if name.trim().is_empty() || core.trim().is_empty() || s.domain_entries.is_empty() {
                    return Err("体系骨架不完整（名称/核心问题/领域入口缺一）".to_string());
                }
                let sys = crate::commands_knowledge_systems::create_knowledge_system_inner(
                    db, name, "domain".to_string(), None, Some(core),
                )?;
                for entry in &s.domain_entries {
                    crate::commands_knowledge_systems::add_knowledge_node_inner(
                        db, sys.id, None, "domain_entry".to_string(), entry.clone(),
                    )?;
                }
                for c in &s.concepts {
                    crate::commands_knowledge_core::add_knowledge_concept_inner(
                        db, sys.id, c.name.clone(),
                        non_empty(&c.essence), non_empty(&c.boundary), non_empty(&c.relation),
                    )?;
                }
                db.link_goal_to_system(goal_id, sys.id).map_err(|e| e.to_string())?;
            }
            other => return Err(format!("非法体系动作: {}", other)),
        }
    }
    Ok(true)
}

/// 空串归一为 None（概念三问可选——空白不落空串）。
fn non_empty(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() { None } else { Some(t.to_string()) }
}
