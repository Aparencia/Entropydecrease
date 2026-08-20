//! 补缝式 AI 前置 Tauri commands（REQ-055 / v0.5.0 M8；REQ-085 / v0.6.0 M1）。
//!
//! @ai-context: 本层只做参数校验、调用判定器（ai_judge）+ mock（ai_mock）、
//!              错误映射（AGENTS.md §6）。云端未实装（V1.0）——
//!              前端"AI 增强"按钮显示"V1.0 开放"（占位），本层验证链路。
//! @ai-context: 三命令：scan_ai_candidates（判定器扫描会话失败块）、
//!              ai_enhance_mock（mock 增强：验证协议校验 + 返回响应）、
//!              ai_enhance_status（云端状态：V1.0 未开放）。
//! @ai-context: REQ-085（v0.6.0 M1）：review_text_filter（边界段三态复核——
//!              授权默认关 + 配额/缓存/审计 + 失败降级纯规则）、
//!              text_filter_status（云端复核可用性/配额查询）。

use tauri::State;

use crate::ai_guardrails::AiAuditEntry;
use crate::ai_judge::{judge_candidates, to_request, AiCandidate, AiJudgeConfig};
use crate::ai_mock::AiMockAdapter;
use crate::ai_protocol::{
    AiEnhanceResponse, TextFilterDecision, TextFilterRequest, TextFilterResponse,
    TextFilterSegment,
};
use crate::ai_text_filter::{AiTextFilterAdapter, AiTextFilterConfig};
use crate::commands::AppState;
use crate::note_filter::{
    apply_ai_decisions, boundary_candidates, filter_note, BoundarySegment, NoteFilterResult,
};

/// 扫描会话补缝候选（判定器三入口：unknown 区/低置信/重建失败）。
#[tauri::command]
pub async fn scan_ai_candidates(state: State<'_, AppState>, session_id: i64) -> Result<Vec<AiCandidate>, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let segments = state.db.list_segments(session_id).map_err(|e| e.to_string())?;
    let ocr_blocks = state.db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
    Ok(judge_candidates(&ocr_blocks, &segments, &AiJudgeConfig::default()))
}

/// mock 增强：本地假 AI 产出合法响应（验证协议 schema 校验 + 渲染链路）。
///
/// @ai-context: V1.0 实装后本命令替换为真实云端适配器调用（协议/判定器/
///              护栏零改动）；返回响应已经过 validate 校验（非法即 Err）。
/// @ai-context: 护栏骨架（REQ-055 第 4 点）：同图 hash 缓存（命中零重复调用）+
///              每日配额（耗尽拒绝）+ 审计缓冲（V1.0 落库）。
#[tauri::command]
pub async fn ai_enhance_mock(
    state: State<'_, AppState>,
    candidate: AiCandidate,
) -> Result<AiEnhanceResponse, String> {
    let now = crate::db_sessions_rows::unix_seconds();
    // 同图 hash：裁剪图路径 → hash（缓存键；无图则按候选时间戳）
    let hash = candidate
        .source_ref
        .crop_image
        .as_deref()
        .map(simple_hash)
        .unwrap_or(candidate.time_ms);
    // 护栏：配额 + 缓存（锁内 read-modify-write）
    {
        let mut guards = state
            .ai_guardrails
            .lock()
            .map_err(|e| format!("护栏状态锁中毒: {}", e))?;
        // 缓存命中 → 零重复调用（不消耗配额）
        if let Some(cached) = guards.cache.get(hash) {
            let resp: AiEnhanceResponse =
                serde_json::from_str(&cached).map_err(|e| format!("缓存响应反序列化失败: {}", e))?;
            return Ok(resp);
        }
        // 配额耗尽 → 拒绝（V1.0 计费护栏）
        if !guards.quota.try_consume(now) {
            return Err("今日 AI 增强配额已用完（V1.0 可调）".to_string());
        }
        // mock 调用（V1.0 替换为云端适配器）
        let adapter = AiMockAdapter;
        let request = to_request(&candidate);
        let response = adapter.enhance(&request);
        // schema 强校验：非法响应丢弃（保留本地结果——调用方不合并）
        response
            .validate()
            .map_err(|e| format!("AI 响应校验失败（已丢弃，保留本地结果）: {}", e))?;
        // 缓存响应 + 审计
        let raw = serde_json::to_string(&response)
            .map_err(|e| format!("序列化 AI 响应失败: {}", e))?;
        guards.cache.put(hash, raw.clone(), now as u64 * 1000);
        guards.push_audit(AiAuditEntry {
            at_unix: now,
            upload_summary: format!("hash={:x},type={:?}", hash, request.request_type),
            result: "ok".to_string(),
        });
        Ok(response)
    }
}

/// 简易字符串 hash（缓存键；非加密用途——同图去重足够）。
fn simple_hash(s: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut h);
    h.finish()
}

/// 云端 AI 状态（V1.0 未开放：前端按钮显示占位）。
#[tauri::command]
pub fn ai_enhance_status() -> AiEnhanceStatus {
    AiEnhanceStatus {
        available: false,
        version: "V1.0",
        message: "补缝式 AI 云端实装排期 V1.0（当前为本地规则链路）".to_string(),
    }
}

/// 云端 AI 状态载荷。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEnhanceStatus {
    pub available: bool,
    pub version: &'static str,
    pub message: String,
}

// ────────────────────────────────────────────────────────────
// REQ-085：笔记文本 AI 复核（边界段三态判定）
// ────────────────────────────────────────────────────────────

/// AI 复核执行元信息（前端展示：授权/送审/配额/降级原因）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewMeta {
    /// 全局开关（env AI_TEXT_FILTER_ENABLED + 密钥非空）
    pub enabled: bool,
    /// 本次调用是否获用户授权（上传确认）
    pub authorized: bool,
    /// 实际送审段数（0 = 未送审）
    pub sent: usize,
    /// 边界段总数（候选）
    pub candidates: usize,
    /// 今日配额耗尽（剩余批未送审）
    pub quota_hit: bool,
    /// 降级原因（网络/超时/非法响应——纯规则结果原样输出）
    pub error: Option<String>,
    /// 生效模型
    pub model: String,
}

/// 复核结果（过滤结果 + AI 元信息 + 判定列表）。
///
/// @ai-context: decisions（审查修复 2026-08-19）：AI 三态判定列表——前端
///              落库时回传（session_to_note 的 ai_decisions），保证预览与
///              落库输出一致（REQ-081"一键落库与转笔记输出一致"）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFilterReview {
    pub result: NoteFilterResult,
    pub ai: AiReviewMeta,
    pub decisions: Vec<TextFilterDecision>,
}

/// 文本复核状态（前端按钮/徽标用）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFilterStatus {
    pub enabled: bool,
    pub model: String,
    pub batch_size: usize,
    pub quota_remaining: u32,
    /// mock 模式（AI_TEXT_FILTER_MOCK=1——本地规则判定，不联网；测试/离线开发）
    pub mock: bool,
}

/// 边界段批量复核（REQ-085）：规则层保留段 → 六类边界候选 → 云端三态判定。
///
/// @ai-context: 安全红线：authorized=false 或全局未开启 → 纯规则结果原样输出
///              （不上传）；上传前由前端确认"将发送 N 段文本至 SiliconFlow"。
/// @ai-context: 降级铁律：AI 不可用/超配额/非法响应 → 回退纯规则结果
///              （不丢不假）；配额按段消耗（计费语义），同批文本 hash 缓存
///              零重复送审；审计记录上传摘要（hash+段数，不含原文）。
/// @ai-context: 锁序：配额/缓存判定在短锁内完成即释放，网络调用不持全局锁
///              （防 60s 超时阻塞其他 AI 命令）；竞态只可能轻微超额消耗
///              配额（保守方向，可接受）。
#[tauri::command]
pub async fn review_text_filter(
    state: State<'_, AppState>,
    session_id: i64,
    authorized: bool,
) -> Result<TextFilterReview, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let db = state.db.clone();
    let ui_junk = state.ui_junk.clone();
    let guards = state.ai_guardrails.clone();
    // v0.7.3 审查修复：AI 复核预览与 preview_session_note/session_to_note 同口径——
    // 画面要点屏 attach 归档图 + 重建配图行（否则复核后预览配图消失，双出口不一致）
    let data_dir = state.data_dir.clone();
    let mock = std::env::var("AI_TEXT_FILTER_MOCK").map(|v| v == "1").unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        let session = db
            .get_session(session_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("会话不存在: {}", session_id))?;
        // 审查修复（2026-08-19）：与 preview_session_note 口径一致——
        // recording 会话数据不完整，AI 复核结果无意义且浪费配额
        if session.status == crate::db_sessions::SESSION_STATUS_RECORDING {
            return Err("进行中的会话不能 AI 复核，请先结束会话".to_string());
        }
        let segments = db.list_segments(session_id).map_err(|e| e.to_string())?;
        let ocr_blocks = db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
        // ① 纯规则过滤（与 preview_session_note 同一管线）
        let mut result = filter_note(&session.title, &segments, &ocr_blocks, &ui_junk);
        // ①b v0.7.3 审查修复：画面要点配图（与 preview_session_note 同口径——
        // 归档图匹配 + 重建含图段落；目录缺失/无图 → 纯文本降级）
        let images_dir = data_dir.join("session-images").join(session_id.to_string());
        crate::screens::attach_images(&mut result.ocr_screens, &images_dir);
        crate::note_filter::refresh_screen_points(&mut result);
        // ② 边界候选（规则层判不了的段）
        let boundary = boundary_candidates(&result.kept);
        let cfg = AiTextFilterConfig::from_env();
        let mut meta = AiReviewMeta {
            enabled: cfg.enabled,
            authorized,
            sent: 0,
            candidates: boundary.len(),
            quota_hit: false,
            error: None,
            model: cfg.model.clone(),
        };
        // ③ 门控：全局开关 + 用户授权 + 有候选（三者缺一 → 纯规则输出）
        if !cfg.enabled || !authorized || boundary.is_empty() {
            return Ok(TextFilterReview { result, ai: meta, decisions: Vec::new() });
        }
        let adapter = AiTextFilterAdapter::new(cfg.clone());
        let mock_adapter = AiMockAdapter;
        let mut quota_hit = false;
        let mut error: Option<String> = None;
        let mut sent = 0usize;
        // 全量判定收集（落库回传用——预览/落库一致性）
        let mut decisions_all: Vec<TextFilterDecision> = Vec::new();
        // ④ 分批送审（批量上限 30 段/请求）
        for chunk in boundary.chunks(cfg.batch_size) {
            if quota_hit || error.is_some() {
                break;
            }
            let request = TextFilterRequest {
                segments: chunk
                    .iter()
                    .map(|b: &BoundarySegment| TextFilterSegment {
                        segment_id: b.segment_id,
                        text: b.text.clone(),
                        prev: b.prev.clone(),
                        next: b.next.clone(),
                        hint: Some(b.kind.hint().to_string()),
                    })
                    .collect(),
            };
            let ids: Vec<i64> = chunk.iter().map(|b| b.segment_id).collect();
            // 缓存键：段文本序列 + 上下文（prev/next/hint）——merge 方向判定
            // 依赖上下文，键必须覆盖全送审内容（同批同上下文才零重复送审）
            let key_text = chunk
                .iter()
                .map(|b| {
                    format!(
                        "{}:{}/prev={}/next={}/hint={}",
                        b.segment_id,
                        b.text,
                        b.prev.as_deref().unwrap_or(""),
                        b.next.as_deref().unwrap_or(""),
                        b.kind.hint()
                    )
                })
                .collect::<Vec<_>>()
                .join("|");
            let key = crate::ai_guardrails::text_hash(&key_text);
            // 短锁：缓存命中 → 直接复用判定（不消耗配额）
            let cached = guards
                .lock()
                .map_err(|e| format!("护栏状态锁中毒: {}", e))?
                .cache
                .get(key);
            if let Some(raw) = cached {
                match serde_json::from_str::<TextFilterResponse>(&raw) {
                    Ok(resp) if resp.validate(&ids).is_ok() => {
                        decisions_all.extend(resp.decisions.clone());
                        result = apply_ai_decisions(result, &resp.decisions);
                        continue;
                    }
                    _ => {} // 缓存损坏/校验失败 → 重新送审（防御）
                }
            }
            // 短锁：配额按段消耗（计费语义）；耗尽 → 停止送审
            let now = crate::db_sessions_rows::unix_seconds();
            {
                let mut g = guards
                    .lock()
                    .map_err(|e| format!("护栏状态锁中毒: {}", e))?;
                if (0..chunk.len()).any(|_| !g.quota.try_consume(now)) {
                    quota_hit = true;
                    break;
                }
            }
            // 云端调用（mock 模式供测试/离线开发；释放锁后网络不阻塞其他命令）
            let response = if mock {
                mock_adapter.review_text(&request)
            } else {
                match adapter.review(&request) {
                    Ok(r) => r,
                    Err(e) => {
                        error = Some(format!("AI 复核失败（回退纯规则）: {}", e));
                        break;
                    }
                }
            };
            // schema 强校验：非法响应丢弃（回退规则结果——防御性编程铁律）
            if let Err(e) = response.validate(&ids) {
                error = Some(format!("AI 响应校验失败（已丢弃，回退纯规则）: {}", e));
                break;
            }
            // 短锁：缓存响应 + 审计（上传摘要不含原文——隐私）
            {
                let mut g = guards
                    .lock()
                    .map_err(|e| format!("护栏状态锁中毒: {}", e))?;
                let raw = serde_json::to_string(&response)
                    .map_err(|e| format!("序列化 AI 响应失败: {}", e))?;
                g.cache.put(key, raw, now as u64 * 1000);
                g.push_audit(AiAuditEntry {
                    at_unix: now,
                    upload_summary: format!("text-filter hash={:x} segs={}", key, chunk.len()),
                    result: "ok".to_string(),
                });
            }
            sent += chunk.len();
            decisions_all.extend(response.decisions.clone());
            result = apply_ai_decisions(result, &response.decisions);
        }
        meta.sent = sent;
        meta.quota_hit = quota_hit;
        meta.error = error;
        Ok(TextFilterReview { result, ai: meta, decisions: decisions_all })
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

/// 文本复核状态（前端展示：可用性/模型/批量/剩余配额）。
#[tauri::command]
pub fn text_filter_status(state: State<'_, AppState>) -> TextFilterStatus {
    let cfg = AiTextFilterConfig::from_env();
    let (used, limit) = state
        .ai_guardrails
        .lock()
        .map(|g| g.quota.usage())
        .unwrap_or((0, 0));
    let mock = std::env::var("AI_TEXT_FILTER_MOCK").map(|v| v == "1").unwrap_or(false);
    TextFilterStatus {
        enabled: cfg.enabled,
        model: cfg.model,
        batch_size: cfg.batch_size,
        quota_remaining: limit.saturating_sub(used),
        mock,
    }
}
