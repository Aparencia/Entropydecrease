//! 补缝式 AI 前置 Tauri commands（REQ-055 / v0.5.0 M8）。
//!
//! @ai-context: 本层只做参数校验、调用判定器（ai_judge）+ mock（ai_mock）、
//!              错误映射（AGENTS.md §6）。云端未实装（V1.0）——
//!              前端"AI 增强"按钮显示"V1.0 开放"（占位），本层验证链路。
//! @ai-context: 三命令：scan_ai_candidates（判定器扫描会话失败块）、
//!              ai_enhance_mock（mock 增强：验证协议校验 + 返回响应）、
//!              ai_enhance_status（云端状态：V1.0 未开放）。

use tauri::State;

use crate::ai_guardrails::AiAuditEntry;
use crate::ai_judge::{judge_candidates, to_request, AiCandidate, AiJudgeConfig};
use crate::ai_mock::AiMockAdapter;
use crate::ai_protocol::AiEnhanceResponse;
use crate::commands::AppState;

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
