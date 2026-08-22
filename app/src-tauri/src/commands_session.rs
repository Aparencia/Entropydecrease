//! 会话管理 Tauri commands（REQ-010，ADR-004；v0.6.0 M1 笔记净化接入）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              DB 读写为快速操作直接调用，不额外 spawn_blocking（连接内 Mutex 保护）。
//! @ai-context: 入参校验（TD-005 修复口径）：title 非空且 ≤100 字；分页参数有界。
//! @ai-context: 笔记转换管线（session_to_note/preview_session_note/批量编排）已
//!              于 v0.7.6 审查拆至 commands_session_note.rs（>600 行硬拆，
//!              AGENTS.md §3）；lib.rs 命令注册按定义模块引用。

use tauri::State;

use crate::commands::{normalize_title, AppState, TITLE_MAX_CHARS};
use crate::types::{NewSession, NewSessionOcrBlock, NewSessionSegment, Session, SessionDetail, SessionListItem};

/// 会话列表单页上限。
const LIST_LIMIT_MAX: u64 = 200;

/// 会话列表项填充显示序号（v0.11.5）：按 (started_at, id) 升序 rank 一次赋值。
///
/// @ai-context: 纯函数 assign_display_no 见 session_display.rs（仅 std 依赖，
///              rustc 独立可测）；本 helper 只做列表↔纯函数的形状适配，
///              数据层不计算 rank（分页下非全局），由命令层统一赋值。
fn apply_display_no(items: &mut [SessionListItem]) {
    let pairs: Vec<(i64, i64)> =
        items.iter().map(|i| (i.session.id, i.session.started_at)).collect();
    let display = crate::session_display::assign_display_no(&pairs);
    for item in items.iter_mut() {
        item.display_no = display[&item.session.id];
    }
}

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

/// 列出会话（关键词可选；默认第 1 页 50 条，新→旧；v0.7.1 起携带转化状态标记）。
///
/// @ai-context: display_no 为单次返回列表内的 rank 语义（按时间序 1..=len）——
///              offset=0 时页内编号即全局编号（当前前端仅取第 1 页）；
///              offset>0 时页内 rank 从 1 重新编号，与首页重复，非全局连续；
///              全局连续编号由 list_session_courses 对全量赋值保证（v0.11.5）。
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    keyword: Option<String>,
    limit: Option<u64>,
    offset: Option<u64>,
) -> Result<Vec<SessionListItem>, String> {
    let limit = limit.unwrap_or(50).min(LIST_LIMIT_MAX);
    // REQ-176（v0.7.5）：残留 recording 会话兜底——线程已死但 DB 停留
    // recording（停止链路异常/崩溃，会话31 实证）→ 列表拉取即翻案，
    // 无需重启（running_session_id 排除进行中会话，绝不误标）
    let running_id = state.live_session.running_session_id();
    state
        .db
        .mark_stale_recording(running_id)
        .map_err(|e| e.to_string())?;
    let mut items = state
        .db
        .list_sessions(keyword.as_deref(), limit, offset.unwrap_or(0))
        .map_err(|e| e.to_string())?;
    // v0.11.5：显示序号 = 时间序 rank（删除会话后自动归位；与内部 id/排序模式解耦）
    apply_display_no(&mut items);
    Ok(items)
}

/// 会话详情：会话 + 转写段 + OCR 块 + 信号事件 + 画面要点屏（时间轴对齐，一次取全）。
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
    // REQ-108（v0.7.0 M1.5）：信号事件随详情取全（章节检测真实信号消费）
    let events = state.db.list_events(id).map_err(|e| e.to_string())?;
    // v0.7.3（REQ-160，ADR-015）：画面要点屏卡（新数据按 screen_id 分组、
    // 旧数据聚类兜底；图匹配失败/目录缺失不阻断——前端无缩略图降级）
    let images_dir = state.data_dir.join("session-images").join(id.to_string());
    let mut screens = crate::screens::build_screens(&ocr_blocks, Some(&images_dir));
    // v0.7.3（REQ-159）：屏内结构块渲染课后精修产物（表格 Markdown/公式 LaTeX；
    // 未精修 → 保留原始 OCR 文本，徽标降级）
    let artifact = state.db.get_artifact(id).map_err(|e| e.to_string())?;
    crate::screens::refine_screen_structures(&mut screens, artifact.as_ref());
    Ok(SessionDetail { session, segments, ocr_blocks, events, screens })
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
        speech_rate: None,
        pause_ms: None,
        speaker: None,
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
        // v0.7.3：外部追加无位置/屏上下文（None=旧口径，聚类兜底）
        bbox: None,
        screen_id: None,
    };
    state.db.add_ocr_block(&new).map(|b| b.id).map_err(|e| e.to_string())
}

// ────────────────────────────────────────────────────────────
// 笔记转换管线（v0.7.6 审查硬拆）：commands_session_note.rs——原料装载/
// 结构渲染接线/单条转换/批量编排/只读预览；lib.rs 按定义模块注册命令。
// 批量转笔记单测（commands_session_batch_tests.rs）引用新模块 run_batch_conversion。
// ────────────────────────────────────────────────────────────

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
/// @ai-context: v0.7.3（REQ-160）：屏标题优先（版面角色分类），无屏回退文本启发式。
#[tauri::command]
pub async fn session_outline(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Vec<crate::outline::OutlineEntry>, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let ocr_blocks = state.db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    let screens = crate::screens::build_screens(&ocr_blocks, None);
    Ok(crate::outline::detect_outline_smart(
        &ocr_blocks,
        &screens,
        &crate::outline::OutlineConfig::default(),
    ))
}

/// 课程分组（REQ-078）：课程键 = 标题章节前缀（"第3章"等）；无前缀 → 标题本身。
///
/// @ai-context: 纯函数（派生方案——sessions 表不加 course 列，零迁移）；
///              前端按此分组折叠；用户标记覆盖（前端本地）留 UI 层。
/// @ai-context: v0.7.2（REQ-152）：合集检测优先——P/第X集/EP/括号/数字后缀式标题
///              归组到**系列名**（B站合集 P1/P2/P3 自动同组）；"第X章/节/讲"式
///              保持原语义（每章一组，现状零回归）。
pub fn course_of(title: &str) -> String {
    if let Some(info) = crate::series_detect::extract_series(title) {
        return info.series;
    }
    let t = title.trim();
    let chars: Vec<char> = t.chars().collect();
    let mut i = 0;
    while i + 1 < chars.len() {
        if chars[i] == '第' {
            let mut j = i + 1;
            // 中文数字判定复用 series_detect（单一来源，防两处漂移）
            while j < chars.len()
                && (chars[j].is_ascii_digit() || crate::series_detect::is_cjk_num_char(chars[j]))
            {
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

/// 课程分组（会话列表按课程键分组，组内新→旧；v0.7.1：组内携带转化状态标记）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseGroup {
    pub course: String,
    pub sessions: Vec<SessionListItem>,
}

/// 会话列表按课程分组（REQ-078：长列表可折叠）。
#[tauri::command]
pub async fn list_session_courses(state: State<'_, AppState>) -> Result<Vec<CourseGroup>, String> {
    let mut sessions = state
        .db
        .list_sessions(None, LIST_LIMIT_MAX, 0)
        .map_err(|e| e.to_string())?;
    // v0.11.5：先对全量赋显示序号——课程分组只是视图（组内 item 自全量 move），
    // 合并去重后调用一次，保证全局连续；删除会话后自动重排（不复用旧号）
    apply_display_no(&mut sessions);
    let mut groups: std::collections::BTreeMap<String, Vec<SessionListItem>> =
        std::collections::BTreeMap::new();
    for s in sessions {
        groups.entry(course_of(&s.session.title)).or_default().push(s);
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
    for item in state.db.list_sessions(None, LIST_LIMIT_MAX, 0).map_err(|e| e.to_string())? {
        let session = &item.session;
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

/// 图内文字检索（REQ-133 IMG-1 / v0.7.0 M3）：关键词 → 命中 OCR 块 + 图路径。
///
/// @ai-context: 搜"PPT 上的词"命中图（与段搜索并存：段搜转写、本命令搜画面）；
///              内存过滤（OCR 块量级可控，与段搜索同口径）。
#[tauri::command]
pub async fn search_ocr_blocks(
    state: State<'_, AppState>,
    keyword: String,
) -> Result<Vec<crate::db_ocr_search::OcrBlockHit>, String> {
    // M4 修复：传入数据目录——命中图路径做真实存在性校验（不再假数据）
    crate::db_ocr_search::search_command(&state.db, Some(&state.data_dir), &keyword)
        .map_err(|e| e.to_string())
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

/// 批量转笔记单测独立文件（保持本文件 ≤300 行目标，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_session_batch_tests.rs"]
mod batch_tests;
