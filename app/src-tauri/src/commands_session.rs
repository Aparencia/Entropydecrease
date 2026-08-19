//! 会话管理 Tauri commands（REQ-010，ADR-004；v0.6.0 M1 笔记净化接入）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              DB 读写为快速操作直接调用，不额外 spawn_blocking（连接内 Mutex 保护）。
//! @ai-context: 入参校验（TD-005 修复口径）：title 非空且 ≤100 字；分页参数有界。
//! @ai-context: REQ-081/082（v0.6.0 M1）：session_to_note（落库）与
//!              preview_session_note（只读预览）共用 note_filter 单一管线——
//!              输出一致性由构造保证（同一过滤链/同一 Markdown 组装）。

use tauri::State;

use crate::ai_protocol::TextFilterDecision;
use crate::commands::{normalize_title, AppState, TITLE_MAX_CHARS};
use crate::db_sessions::SESSION_STATUS_RECORDING;
use crate::note_filter::{apply_ai_decisions, filter_note, NoteFilterResult};
use crate::types::{
    NewNote, NewSession, NewSessionOcrBlock, NewSessionSegment, Note, Session, SessionDetail,
    SessionOcrBlock, SessionSegment,
};

/// 会话列表单页上限。
const LIST_LIMIT_MAX: u64 = 200;

/// 新建会话（REQ-010；v0.5.0 M1/REQ-043：可指定视频类型档案）。
#[tauri::command]
pub async fn create_session(
    state: State<'_, AppState>,
    title: String,
    source_window: Option<String>,
    profile: Option<String>,
) -> Result<Session, String> {
    let new = NewSession {
        title: normalize_title(title, "未命名会话"),
        source_window: source_window.map(|s| s.chars().take(TITLE_MAX_CHARS).collect()),
        profile: profile.map(|p| p.chars().take(30).collect()),
    };
    state.db.create_session(&new).map_err(|e| e.to_string())
}

/// 结束会话（status=recording → finished）。
#[tauri::command]
pub async fn finish_session(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    state.db.finish_session(id).map_err(|e| e.to_string())
}

/// 列出会话（关键词可选；默认第 1 页 50 条，新→旧）。
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    keyword: Option<String>,
    limit: Option<u64>,
    offset: Option<u64>,
) -> Result<Vec<Session>, String> {
    let limit = limit.unwrap_or(50).min(LIST_LIMIT_MAX);
    state
        .db
        .list_sessions(keyword.as_deref(), limit, offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

/// 会话详情：会话 + 转写段 + OCR 块（时间轴对齐，一次取全）。
#[tauri::command]
pub async fn get_session_detail(state: State<'_, AppState>, id: i64) -> Result<SessionDetail, String> {
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
    Ok(SessionDetail { session, segments, ocr_blocks })
}

/// 删除会话（级联清理转写段与 OCR 块）。
#[tauri::command]
pub async fn delete_session(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    state.db.delete_session(id).map_err(|e| e.to_string())
}

/// 追加转写段（实时捕获链路调用）。
#[tauri::command]
pub async fn add_session_segment(
    state: State<'_, AppState>,
    session_id: i64,
    start_ms: u64,
    end_ms: u64,
    text: String,
    source: String,
    confidence: Option<f32>,
) -> Result<i64, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let new = NewSessionSegment {
        session_id,
        start_ms,
        end_ms,
        text: text.chars().take(10_000).collect(),
        source: normalize_source(&source),
        confidence,
        // REQ-103：手工追加段无音量数据（None=未知）
        volume: None,
    };
    state.db.add_segment(&new).map(|s| s.id).map_err(|e| e.to_string())
}

/// 追加 OCR 块（实时捕获链路调用）。
#[tauri::command]
pub async fn add_session_ocr_block(
    state: State<'_, AppState>,
    session_id: i64,
    timestamp_ms: u64,
    text: String,
    score: f32,
    region: String,
) -> Result<i64, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let new = NewSessionOcrBlock {
        session_id,
        timestamp_ms,
        text: text.chars().take(10_000).collect(),
        score: score.clamp(0.0, 1.0),
        region: if region == "subtitle" { "subtitle" } else { "full" }.to_string(),
        // 外部追加无版面上下文，区域标注留空
        region_kind: None,
    };
    state.db.add_ocr_block(&new).map(|b| b.id).map_err(|e| e.to_string())
}

/// 加载会话笔记原料（会话 + 转写段 + OCR 块；单一管线双出口共用）。
///
/// @ai-context: REQ-081：预览与转笔记从同一原料装载开始，保证口径一致。
fn load_note_material(
    state: &AppState,
    id: i64,
) -> Result<(Session, Vec<SessionSegment>, Vec<SessionOcrBlock>), String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", id))?;
    if session.status == SESSION_STATUS_RECORDING {
        return Err("进行中的会话不能生成笔记，请先结束会话".to_string());
    }
    let segments = state.db.list_segments(id).map_err(|e| e.to_string())?;
    let ocr_blocks = state.db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    Ok((session, segments, ocr_blocks))
}

/// 会话 → 笔记：转写段 + OCR 块经 note_filter 净化管线，一键落库（REQ-010 闭环）。
///
/// @ai-context: REQ-082：过滤链（UI 垃圾/重复合并/碎片/低置信）与预览共用；
///              ai_decisions（REQ-085）可选叠加——前端把预览中已确认的 AI
///              判定结果回传，落库与预览输出保持一致（默认 None=纯规则）。
/// @ai-context: 只允许 finished/failed 会话转换；source 沿用 classroom。
#[tauri::command]
pub async fn session_to_note(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    ai_decisions: Option<Vec<TextFilterDecision>>,
) -> Result<Note, String> {
    let (session, segments, ocr_blocks) = load_note_material(&state, id)?;
    let fallback = format!("{}（会话）", session.title);
    let title = normalize_title(title.unwrap_or_default(), &fallback);
    let mut result = filter_note(&title, &segments, &ocr_blocks, &state.ui_junk);
    if let Some(decisions) = ai_decisions {
        result = apply_ai_decisions(result, &decisions);
    }
    let new = NewNote {
        title: result.title.clone(),
        content: result.markdown.clone(),
        source: "classroom".to_string(),
    };
    state.db.create_note(&new).map_err(|e| e.to_string())
}

/// 会话笔记预览（REQ-081）：过滤后只读预览——不落库、不改库。
///
/// @ai-context: 与 session_to_note 同一过滤管线（输出一致性由构造保证）；
///              返回 NoteFilterResult（markdown + 过滤统计 + 被过滤对照 +
///              kept 段），前端展示过滤统计卡/对照复查/一键落库。
#[tauri::command]
pub async fn preview_session_note(
    state: State<'_, AppState>,
    id: i64,
) -> Result<NoteFilterResult, String> {
    let (session, segments, ocr_blocks) = load_note_material(&state, id)?;
    Ok(filter_note(&session.title, &segments, &ocr_blocks, &state.ui_junk))
}

/// 归一化转写段来源标识（asr | subtitle | fused，其余回退 asr）。
fn normalize_source(source: &str) -> String {
    match source {
        "subtitle" | "fused" => source.to_string(),
        _ => "asr".to_string(),
    }
}

// ────────────────────────────────────────────────────────────
// M6 会话体验（REQ-076/078/079）
// ────────────────────────────────────────────────────────────

/// 会话质量报告（REQ-076）：可信度总览 + 低置信列表（点击定位原料）。
#[tauri::command]
pub async fn session_quality_report(
    state: State<'_, AppState>,
    id: i64,
) -> Result<crate::quality_report::QualityReport, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let segments = state.db.list_segments(id).map_err(|e| e.to_string())?;
    let ocr_blocks = state.db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    // REQ-100（v0.7.0 M1）：接入 engine 诊断计数（失败 AtomicU64 + 重打分超时），
    // 指标从"恒 ≈0"变真实（纯函数 build_quality_report_from_counts 见 quality_report.rs）
    Ok(crate::quality_report::build_quality_report_with_engine(&segments, &ocr_blocks, &state.engines))
}

/// 会话大纲（REQ-077）：OCR 全帧块 → 大纲条目（产物视图侧边导航，点击跳转）。
#[tauri::command]
pub async fn session_outline(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Vec<crate::outline::OutlineEntry>, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let ocr_blocks = state.db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    Ok(crate::outline::detect_outline(&ocr_blocks, &crate::outline::OutlineConfig::default()))
}

/// 课程分组（REQ-078）：课程键 = 标题章节前缀（"第3章"等）；无前缀 → 标题本身。
///
/// @ai-context: 纯函数（派生方案——sessions 表不加 course 列，零迁移）；
///              前端按此分组折叠；用户标记覆盖（前端本地）留 UI 层。
pub fn course_of(title: &str) -> String {
    let t = title.trim();
    let chars: Vec<char> = t.chars().collect();
    let mut i = 0;
    while i + 1 < chars.len() {
        if chars[i] == '第' {
            let mut j = i + 1;
            while j < chars.len() && (chars[j].is_ascii_digit() || is_cjk_num(chars[j])) {
                j += 1;
            }
            // "第X章/节/讲/课/部分" → 前缀即课程键
            if j > i + 1 && j < chars.len() && "章节讲课部分".contains(chars[j]) {
                return chars[..=j].iter().collect();
            }
        }
        i += 1;
    }
    t.to_string()
}

/// 中文数字判定（课程前缀匹配用）。
fn is_cjk_num(c: char) -> bool {
    "零〇一二三四五六七八九十百".contains(c)
}

/// 课程分组（会话列表按课程键分组，组内新→旧）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseGroup {
    pub course: String,
    pub sessions: Vec<Session>,
}

/// 会话列表按课程分组（REQ-078：长列表可折叠）。
#[tauri::command]
pub async fn list_session_courses(state: State<'_, AppState>) -> Result<Vec<CourseGroup>, String> {
    let sessions = state
        .db
        .list_sessions(None, LIST_LIMIT_MAX, 0)
        .map_err(|e| e.to_string())?;
    let mut groups: std::collections::BTreeMap<String, Vec<Session>> = std::collections::BTreeMap::new();
    for s in sessions {
        groups.entry(course_of(&s.title)).or_default().push(s);
    }
    Ok(groups
        .into_iter()
        .map(|(course, sessions)| CourseGroup { course, sessions })
        .collect())
}

/// 段搜索命中（REQ-079：片段上下文 + 定位原料）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentHit {
    pub session_id: i64,
    pub session_title: String,
    pub segment_id: i64,
    pub start_ms: u64,
    /// 命中位置前后上下文片段（前端高亮渲染）
    pub snippet: String,
}

/// 会话段搜索（REQ-079）：关键词 → 命中段 + 片段上下文（一键跳详情定位）。
///
/// @ai-context: 内存过滤（会话段量级可控，避免为搜索建索引）；大小写不敏感
///              （ASCII）；结果有界（200 条防超大 payload）。
#[tauri::command]
pub async fn search_session_segments(
    state: State<'_, AppState>,
    keyword: String,
) -> Result<Vec<SegmentHit>, String> {
    let kw = keyword.trim().to_lowercase();
    if kw.is_empty() {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    for session in state.db.list_sessions(None, LIST_LIMIT_MAX, 0).map_err(|e| e.to_string())? {
        for s in state.db.list_segments(session.id).map_err(|e| e.to_string())? {
            if s.text.to_lowercase().contains(&kw) {
                hits.push(SegmentHit {
                    session_id: session.id,
                    session_title: session.title.clone(),
                    segment_id: s.id,
                    start_ms: s.start_ms,
                    snippet: snippet_around(&s.text, &kw),
                });
                if hits.len() >= 200 {
                    return Ok(hits);
                }
            }
        }
    }
    Ok(hits)
}

/// 片段上下文（纯函数）：命中位置前后各 12 字符（省略号标注截断）。
///
/// @ai-context: 审查修复（2026-08-19）：`text[..pos]` 直接字节切片在
///              to_lowercase 长度变化字符（如 U+0130）下可能落在字符中间
///              panic——改用 get(..pos)（非边界时回退整串，不 panic）。
fn snippet_around(text: &str, kw_lower: &str) -> String {
    const WINDOW: usize = 12;
    let lower = text.to_lowercase();
    let Some(pos) = lower.find(kw_lower) else {
        return text.chars().take(2 * WINDOW + kw_lower.chars().count()).collect();
    };
    let chars: Vec<char> = text.chars().collect();
    let byte_pos = text.get(..pos).map(|p| p.chars().count()).unwrap_or(0); // 命中起点（字符序）
    let start = byte_pos.saturating_sub(WINDOW);
    let end = (byte_pos + kw_lower.chars().count() + WINDOW).min(chars.len());
    let mut snippet: String = chars[start..end].iter().collect();
    if start > 0 {
        snippet.insert(0, '…');
    }
    if end < chars.len() {
        snippet.push('…');
    }
    snippet
}
