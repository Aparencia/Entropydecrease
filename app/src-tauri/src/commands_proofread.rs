//! LLM 文本校对命令面（v0.20.2 / REQ-270，可选·建议制·默认关）。
//!
//! @ai-context: 双闸门 proofread_gate（content_gate + proofread_enabled 默认关）；
//!              每次运行仍需显式 authorized 确认（commands_ai_note_refine 先例）。
//!              仅文本上云（句子文本；语音/画面永不出本机红线）。运行方式=同步
//!              spawn_blocking（P2 频率低、分块 ≤40 句/请求；240 句护栏封顶）；
//!              模型输出经解析校验层（ai_proofread）后逐句映射回原段，改动落
//!              session_refine_drafts（origin=proofread）待用户裁决——绝不直改原文。
//!              成本经 ai_tasks 任务记录（op_type=proofread）落库审计。
//! @ai-context: 降级：任何网络/解析失败 → 本次零草稿 + 明确报错（原文零触碰）；
//!              AI_REFINE_MOCK=1 时跳过网络直返空建议（离线回归路径）。

use tauri::State;

use crate::ai_proofread::{
    self, build_system_prompt, build_user_prompt, parse_suggestions, ProofreadSuggestion,
    MAX_SENTENCES_PER_RUN,
};
use crate::commands::AppState;
use crate::db::Db;
use crate::db_session_refine::{
    NewRefineDraft, ORIGIN_PROOFREAD, ORIGIN_SECOND_PASS, SOURCE_LLM_PROOFREAD,
};
use crate::types::SessionSegment;

/// 预估视图（启动前成本透明——REQ-270 成本审计前置）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofreadEstimateView {
    pub sentences: usize,
    pub chars: usize,
    /// 预估费用（元；按字符数×模型单价粗估，实际以任务记录为准）
    pub cost_yuan: f64,
    pub model: String,
    /// 是否被 240 句护栏截断（超出部分本运行不校对）
    pub capped: bool,
}

/// 运行结果视图。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofreadRunView {
    pub draft_count: usize,
    /// 建议总数（含模型返回但未采用数——定位用）
    pub suggestions_received: usize,
    pub chars: usize,
    pub cost_yuan: f64,
    pub model: String,
    pub capped: bool,
}

/// 候选句上下文（句子 → 所属段，供建议回写）。
struct SegCtx {
    seg: SessionSegment,
    sentences: Vec<String>,
}

/// 装载校对原料：有效段（含已采纳第二遍覆盖——原文仍不动）+ 逐段分句。
fn load_material(db: &Db, session_id: i64) -> Result<Vec<SegCtx>, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let raw = db.list_segments(session_id).map_err(|e| e.to_string())?;
    let rows = db
        .overlay_adopted_rows(session_id, ORIGIN_SECOND_PASS, &raw)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for seg in rows {
        // 段文本超长（罕见）跳过——不逐字切段级护栏防失控
        if seg.text.chars().count() > 20_000 {
            continue;
        }
        let sentences = ai_proofread::split_sentences(&seg.text);
        if !sentences.is_empty() {
            out.push(SegCtx { seg, sentences });
        }
    }
    Ok(out)
}

fn flatten<'a>(ctx: &'a [SegCtx]) -> Vec<(usize, &'a str)> {
    // (seg_idx, sentence)；句序稳定（前端提示/测试可复现）
    let mut v = Vec::new();
    for (i, c) in ctx.iter().enumerate() {
        for s in &c.sentences {
            v.push((i, s.as_str()));
        }
    }
    v
}

fn model_and_settings(state: &AppState) -> Result<(crate::ai_settings::AiSettings, String), String> {
    let s = state.ai_settings.lock().map_err(|e| format!("AI 设置锁中毒: {}", e))?.clone();
    let model = s.model.clone();
    Ok((s, model))
}

/// 预估（未开启也可估——展示成本便于决定开不开）。
#[tauri::command]
pub fn proofread_estimate(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<ProofreadEstimateView, String> {
    let db = state.db.clone();
    let (_, model) = model_and_settings(&state)?;
    let material = load_material(&db, session_id)?;
    let flat = flatten(&material);
    let capped = flat.len() > MAX_SENTENCES_PER_RUN;
    let sentences = flat.len().min(MAX_SENTENCES_PER_RUN);
    let chars: usize = flat.iter().take(sentences).map(|(_, s)| s.chars().count()).sum();
    let tokens = crate::ai_cost::estimate_tokens(chars);
    let (price, _) = crate::ai_cost::price_for_model(&model);
    let cost_yuan = crate::ai_cost::estimate_cost(tokens, price);
    Ok(ProofreadEstimateView { sentences, chars, cost_yuan, model, capped })
}

/// 运行文本校对（建议制：结果全部落 pending 草稿，用户逐条裁决）。
#[tauri::command]
pub async fn proofread_run(
    state: State<'_, AppState>,
    session_id: i64,
    authorized: bool,
) -> Result<ProofreadRunView, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let st: AppState = (*state).clone();
    // 审查 L3：会话存在性 + 非 recording 门控（与 second_pass 同口径——
    // 幽灵/进行中会话不得零成本成功还记账）
    {
        let s = st.db.get_session(session_id).map_err(|e| e.to_string())?;
        let Some(session) = s else { return Err("会话不存在".to_string()) };
        if session.status == "recording" {
            return Err("会话进行中——结束捕获后方可校对".to_string());
        }
    }
    let (settings, model) = model_and_settings(&st)?;
    settings.proofread_gate()?;
    if !authorized {
        return Err("本次上传未确认——请先阅读并同意「仅文本上云」说明".to_string());
    }
    let mock = std::env::var("AI_REFINE_MOCK").map(|v| v == "1").unwrap_or(false);
    if !mock {
        if !crate::commands_ai_providers::default_provider_ready(&st)? {
            return Err("未配置 AI 服务（请在设置页 AI 服务中配置提供商/密钥）".to_string());
        }
    }
    let db = st.db.clone();
    let material = load_material(&db, session_id)?;
    let flat = flatten(&material);
    let capped = flat.len() > MAX_SENTENCES_PER_RUN;
    let take = flat.len().min(MAX_SENTENCES_PER_RUN);
    let expected: Vec<&str> = flat.iter().take(take).map(|(_, s)| *s).collect();
    let chars: usize = expected.iter().map(|s| s.chars().count()).sum();

    let task_id = st.ai_task_seq.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let created_at = crate::db::unix_seconds();
    let _ = db.insert_ai_task(&crate::db_ai_tasks::AiTaskRecord {
        task_id,
        op_type: "proofread".to_string(),
        ref_id: session_id,
        state: "running".to_string(),
        target_kind: Some("session".to_string()),
        result_json: None,
        cost_yuan: None,
        elapsed_ms: None,
        model: Some(model.clone()),
        error: None,
        slices: Some(expected.len()),
        created_at,
        finished_at: None,
        adopted: false,
    });

    let started = std::time::Instant::now();
    // 预估成本（成功/失败记账共用——内联不再重复估算）
    let est_tokens = crate::ai_cost::estimate_tokens(chars);
    let (est_price, _) = crate::ai_cost::price_for_model(&model);
    let est_cost = crate::ai_cost::estimate_cost(est_tokens, est_price);
    let client = if mock {
        None
    } else {
        match crate::commands_ai_providers::resolve_default_provider_key(&st) {
            Ok(key) => {
                let providers = match st.ai_providers.lock() {
                    Ok(g) => g.clone(),
                    Err(e) => {
                        record_proofread_failure(&db, task_id, session_id, &model, est_cost, created_at, 0, &format!("Provider 存储锁中毒: {}", e));
                        return Err(format!("Provider 存储锁中毒: {}", e));
                    }
                };
                Some(crate::ai_client::AiClient::from_settings_with_store(
                    &settings,
                    key,
                    &providers,
                ))
            }
            Err(e) => {
                record_proofread_failure(&db, task_id, session_id, &model, est_cost, created_at, 0, &e);
                return Err(e);
            }
        }
    };

    let chunks = ai_proofread::chunk_sentences(&expected.iter().map(|s| s.to_string()).collect::<Vec<_>>());
    let mut suggestions: Vec<ProofreadSuggestion> = Vec::new();
    for (ci, chunk) in chunks.iter().enumerate() {
        if let Some(client) = &client {
            let user = build_user_prompt(
                &chunk.iter().map(|&i| expected[i].to_string()).collect::<Vec<_>>(),
            );
            let raw = match client.chat_text(&build_system_prompt(), &user) {
                Ok(raw) => raw,
                Err(e) => {
                    let msg = format!("校对请求 {}/{} 失败（原文未改动）: {}", ci + 1, chunks.len(), e);
                    record_proofread_failure(&db, task_id, session_id, &model, est_cost, created_at, started.elapsed().as_millis() as i64, &msg);
                    return Err(msg);
                }
            };
            let batch_expected: Vec<String> =
                chunk.iter().map(|&i| expected[i].to_string()).collect();
            suggestions.extend(parse_suggestions(&raw, &batch_expected));
        }
    }
    let suggestions_received = suggestions.len();

    let mut seen: Vec<String> = Vec::new();
    let mut by_seg: Vec<Vec<(&str, &str)>> = vec![Vec::new(); material.len()];
    let flat_map = flatten(&material);
    for s in &suggestions {
        let norm = ai_proofread::normalize_for_match(&s.original);
        if seen.iter().any(|n| *n == norm) {
            continue;
        }
        seen.push(norm.clone());
        if let Some((seg_idx, _)) = flat_map
            .iter()
            .find(|(_, orig)| ai_proofread::normalize_for_match(orig) == norm)
        {
            by_seg[*seg_idx].push((s.original.as_str(), s.suggestion.as_str()));
        }
    }

    let mut drafts: Vec<NewRefineDraft> = Vec::new();
    for (seg_idx, changes) in by_seg.iter().enumerate() {
        if changes.is_empty() {
            continue;
        }
        let seg = &material[seg_idx].seg;
        let mut text = seg.text.clone();
        for (orig, sugg) in changes {
            if let Some(pos) = text.find(orig) {
                text.replace_range(pos..pos + orig.len(), sugg);
            }
        }
        if text == seg.text {
            continue;
        }
        let similarity = crate::asr_pass2::normalized_similarity(&seg.text, &text);
        drafts.push(NewRefineDraft {
            session_id,
            origin: ORIGIN_PROOFREAD.to_string(),
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            base_text: seg.text.clone(),
            refined_text: text,
            source: SOURCE_LLM_PROOFREAD.to_string(),
            confidence: None,
            similarity: Some(similarity),
        });
    }
    let draft_count = match db.add_refine_drafts(&drafts) {
        Ok(n) => n,
        Err(e) => {
            let msg = format!("落校对草稿失败: {}", e);
            record_proofread_failure(&db, task_id, session_id, &model, est_cost, created_at, started.elapsed().as_millis() as i64, &msg);
            return Err(msg);
        }
    };

    let elapsed = started.elapsed().as_millis() as i64;
    let cost_yuan = est_cost;
    let result_json = serde_json::json!({
        "draftCount": draft_count,
        "suggestionsReceived": suggestions_received,
    })
    .to_string();
    let final_rec = crate::db_ai_tasks::AiTaskRecord {
        task_id,
        op_type: "proofread".to_string(),
        ref_id: session_id,
        state: "succeeded".to_string(),
        target_kind: Some("session".to_string()),
        result_json: Some(result_json),
        cost_yuan: Some(cost_yuan),
        elapsed_ms: Some(elapsed),
        model: Some(model.clone()),
        error: None,
        slices: Some(expected.len()),
        created_at,
        finished_at: Some(crate::db::unix_seconds()),
        adopted: false,
    };
    if let Err(e) = db.insert_ai_task(&final_rec) {
        eprintln!("[Proofread] 任务记账失败（不影响草稿）: {e}");
    }
    // 会话域广播（裁决列表可达）
    crate::notify::emit_changed(&st.app, crate::notify::DataDomain::Sessions);
    Ok(ProofreadRunView { draft_count, suggestions_received, chars, cost_yuan, model, capped })
}

/// 失败终态记账（网络/解析/落库错误路径不残留 running 行——任务中心/审计可查）。
fn record_proofread_failure(
    db: &crate::db::Db,
    task_id: u64,
    session_id: i64,
    model: &str,
    cost_yuan: f64,
    created_at: i64,
    elapsed_ms: i64,
    error: &str,
) {
    let rec = crate::db_ai_tasks::AiTaskRecord {
        task_id,
        op_type: "proofread".to_string(),
        ref_id: session_id,
        state: "failed".to_string(),
        target_kind: Some("session".to_string()),
        result_json: None,
        cost_yuan: Some(cost_yuan),
        elapsed_ms: Some(elapsed_ms),
        model: Some(model.to_string()),
        error: Some(error.to_string()),
        slices: None,
        created_at,
        finished_at: Some(crate::db::unix_seconds()),
        adopted: false,
    };
    if let Err(e) = db.insert_ai_task(&rec) {
        eprintln!("[Proofread] 失败任务记账失败: {e}");
    }
}

/// 校对草稿列表（origin=proofread；裁决走 second_pass_decide——裁决与来源解耦）。
#[tauri::command]
pub fn proofread_list(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<crate::commands_asr_pass2::SecondPassView, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let items = state
        .db
        .list_refine_drafts(session_id, ORIGIN_PROOFREAD, None)
        .map_err(|e| format!("读取校对草稿失败: {e}"))?;
    let total = items.len();
    let pending = items.iter().filter(|d| d.status == crate::db_session_refine::STATUS_PENDING).count();
    let adopted = items.iter().filter(|d| d.status == crate::db_session_refine::STATUS_ADOPTED).count();
    let rejected = items.iter().filter(|d| d.status == crate::db_session_refine::STATUS_REJECTED).count();
    Ok(crate::commands_asr_pass2::SecondPassView {
        running: false,
        total,
        pending,
        adopted,
        rejected,
        items,
    })
}
