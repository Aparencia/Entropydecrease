//! 会话术语表命令（v0.11.5 spec 8️⃣：词汇表完全移出笔记 → 会话详情直供前端）。
//!
//! @ai-context: 复用分析层 glossary 产出（analysis::analyze_session C3 精化，
//!              REQ-061：OCR 高频 × ASR 低频交叉 + 水印词排除 + TF-IDF 加权）——
//!              本命令只做数据装载 + 形状适配（GlossaryCandidate → GlossaryTerm），
//!              不重复计算逻辑（单一产出源，与笔记词汇表时代同口径）。
//! @ai-context: 纯函数 build_glossary_terms 只依赖 std + 纯逻辑，可独立测试
//!              （与 session_display.rs 同模式；命令本身薄壳走 DB 装载）。

use tauri::State;

use crate::commands::AppState;
use crate::glossary::GlossaryCandidate;
use crate::types::SessionDetail;
use crate::video_profile::ProfileKind;

/// 术语表条目（前端展示形状；camelCase 序列化——serde 兼容）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryTerm {
    pub term: String,
    /// 精化候选分（ocr_count × idf；score 降序为展示顺序）
    pub score: f32,
    /// OCR 出现次数（画面高频）
    pub ocr_count: usize,
    /// ASR 出现次数（语音低频）
    pub asr_count: usize,
}

/// 会话术语表（数据层形状适配，纯函数）：SessionDetail + 档案 → 术语列表。
///
/// @ai-context: 复用 analyze_session 的 glossary 产出（档案 gate 与笔记词汇表
///              时代同口径——网课开、口播关）；analyze_session 已按 score
///              降序，此处取前 20 条防噪音（原词汇表块 glossary_max_terms 同值）。
pub(crate) fn build_glossary_terms(
    detail: &SessionDetail,
    profile: ProfileKind,
) -> Vec<GlossaryTerm> {
    crate::analysis::analyze_session(detail, profile)
        .glossary
        .into_iter()
        .take(20)
        .map(|g: GlossaryCandidate| GlossaryTerm {
            term: g.term,
            score: g.score,
            ocr_count: g.ocr_count,
            asr_count: g.asr_count,
        })
        .collect()
}

/// 会话术语表（v0.11.5 spec 8️⃣）：分析层 glossary 产出 → 前端展示。
///
/// @ai-context: 档案取会话落库档案（与 analyze_session_command 同口径，
///              Lecture 默认兜底）；无覆盖参数——详情页术语表跟随会话档案即可。
#[tauri::command]
pub async fn session_glossary(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Vec<GlossaryTerm>, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", id))?;
    let segments = state.db.list_segments(id).map_err(|e| e.to_string())?;
    let ocr_blocks = state.db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    let events = state.db.list_events(id).map_err(|e| e.to_string())?;
    let kind = session
        .profile
        .as_deref()
        .map(ProfileKind::parse)
        .unwrap_or(ProfileKind::Lecture);
    let detail = SessionDetail {
        session,
        segments,
        ocr_blocks,
        events,
        screens: Vec::new(),
    };
    Ok(build_glossary_terms(&detail, kind))
}

#[cfg(test)]
#[path = "commands_session_glossary_tests.rs"]
mod tests;
