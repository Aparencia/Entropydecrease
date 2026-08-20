//! 会话管理 Tauri commands（REQ-010，ADR-004；v0.6.0 M1 笔记净化接入）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              DB 读写为快速操作直接调用，不额外 spawn_blocking（连接内 Mutex 保护）。
//! @ai-context: 入参校验（TD-005 修复口径）：title 非空且 ≤100 字；分页参数有界。
//! @ai-context: REQ-081/082（v0.6.0 M1）：session_to_note（落库）与
//!              preview_session_note（只读预览）共用 note_filter 单一管线——
//!              输出一致性由构造保证（同一过滤链/同一 Markdown 组装）。

use std::collections::HashSet;

use tauri::State;

use crate::ai_protocol::TextFilterDecision;
use crate::analysis::analyze_session_opt;
use crate::commands::{normalize_title, AppState, TITLE_MAX_CHARS};
use crate::db::Db;
use crate::db_sessions::SESSION_STATUS_RECORDING;
use crate::note_filter::{apply_ai_decisions, filter_note, NoteFilterResult, PurifyEnv, RULE_VERSION};
use crate::outline::{detect_outline_smart, OutlineConfig};
use crate::structure_note::render_note_structure;
use crate::types::{
    BatchNoteResult, ConvertedNote, NewNote, NewSession, NewSessionOcrBlock, NewSessionSegment,
    Note, Session, SessionDetail, SessionListItem, SessionOcrBlock, SessionSegment, SkippedNote,
};
use crate::ui_junk::UiJunkList;
use crate::video_profile::ProfileKind;

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

/// 列出会话（关键词可选；默认第 1 页 50 条，新→旧；v0.7.1 起携带转化状态标记）。
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
    state
        .db
        .list_sessions(keyword.as_deref(), limit, offset.unwrap_or(0))
        .map_err(|e| e.to_string())
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

/// 加载会话笔记原料（会话 + 转写段 + OCR 块；单一管线双出口共用）。
///
/// @ai-context: REQ-081：预览与转笔记从同一原料装载开始，保证口径一致；
///              v0.7.1 起注入 &Db（不再依赖 AppState）——批量编排可单测。
fn load_note_material(
    db: &Db,
    id: i64,
) -> Result<(Session, Vec<SessionSegment>, Vec<SessionOcrBlock>), String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = db
        .get_session(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", id))?;
    if session.status == SESSION_STATUS_RECORDING {
        return Err("进行中的会话不能生成笔记，请先结束会话".to_string());
    }
    let segments = db.list_segments(id).map_err(|e| e.to_string())?;
    let ocr_blocks = db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    Ok((session, segments, ocr_blocks))
}

/// 结构渲染接线（v0.7.6 REQ-177/178，双出口共用）。
///
/// @ai-context: 在 refresh_screen_points 之后调用——净化/配图/警示行先落定，
///              结构层在其上叠加章节标题与词汇表块；预览与落库同函数同口径
///              （REQ-081 单一管线双出口契约）。
/// @ai-context: 输入为会话原料（segments/ocr_blocks）——章节检测/大纲标题/
///              术语表均为纯本地规则（analysis/outline/glossary 复用）——
///              不依赖云端 AI（本地优先铁律）；失败不阻断转笔记主链路
///              （分析失败按空结构处理，不抛错）。
fn apply_note_structure(
    result: &mut NoteFilterResult,
    db: &Db,
    session: &Session,
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    env: &PurifyEnv,
) {
    // 档案驱动：章节检测/术语表按档案开关（网课开、口播关——analysis 内部门控）
    let kind = session
        .profile
        .as_deref()
        .map(ProfileKind::parse)
        .unwrap_or(ProfileKind::Lecture);
    let detail = SessionDetail {
        session: session.clone(),
        segments: segments.to_vec(),
        ocr_blocks: ocr_blocks.to_vec(),
        events: db.list_events(session.id).unwrap_or_default(),
        screens: Vec::new(),
    };
    let analysis = analyze_session_opt(&detail, kind, &env.symbol);
    let outline = detect_outline_smart(ocr_blocks, &result.ocr_screens, &OutlineConfig::default());
    let _ = render_note_structure(
        result,
        &analysis.chapters,
        &outline,
        &analysis.glossary,
        &env.config.structure,
    );
}

/// 会话 → 笔记核心（v0.7.1 提取：单条与批量共用同一管线）。
///
/// @ai-context: REQ-082：过滤链（UI 垃圾/重复合并/碎片/低置信/口语净化/口头禅
///              删除——v0.7.5 净化接线）与预览共用；ai_decisions（REQ-085）
///              可选叠加——前端把预览中已确认的 AI 判定结果回传，落库与预览
///              输出保持一致（默认 None=纯规则）。
/// @ai-context: 只允许 finished/failed 会话转换；source 沿用 classroom；
///              v0.7.1 起落库携带 session_id（列表 has_note/查看笔记跳转的数据源）；
///              v0.7.3（REQ-160）：data_dir 供画面要点屏 attach 归档图
///              （配图行随 image_ref 进入笔记 markdown）。
/// @ai-context: v0.7.5：净化配置/符号映射注入（REQ-173 JSON 可校准）；失败/
///              异常会话追加警示行（REQ-170 诚实降级）；落库携带 rule_version
///              + purify_stats 元数据（REQ-171——旧笔记 NULL 诚实降级）。
fn convert_to_note(
    db: &Db,
    ui_junk: &UiJunkList,
    env: &PurifyEnv,
    data_dir: &std::path::Path,
    id: i64,
    title: Option<String>,
    ai_decisions: Option<Vec<TextFilterDecision>>,
) -> Result<Note, String> {
    let (session, segments, ocr_blocks) = load_note_material(db, id)?;
    let fallback = format!("{}（会话）", session.title);
    let title = normalize_title(title.unwrap_or_default(), &fallback);
    let mut result = filter_note(&title, &segments, &ocr_blocks, ui_junk, env);
    if let Some(decisions) = ai_decisions {
        result = apply_ai_decisions(result, &decisions);
    }
    // v0.7.3（REQ-160）：画面要点配图（归档 full 图匹配；目录缺失/无图 → 纯文本降级）
    let images_dir = data_dir.join("session-images").join(id.to_string());
    crate::screens::attach_images(&mut result.ocr_screens, &images_dir);
    // v0.7.5（REQ-170）：失败/异常会话 → 警示行（refresh 前写入——markdown
    // 重建口径一致；警示为正文行，用户可手动删除）
    crate::note_filter::apply_session_warning(&mut result, &session.status);
    crate::note_filter::refresh_screen_points(&mut result);
    // v0.7.6（REQ-177/178）：结构渲染——章节标题 + 词汇表块（纯本地增强层；
    // 无结构数据/分析失败 → 原样输出不阻断，见 apply_note_structure）
    apply_note_structure(&mut result, db, &session, &segments, &ocr_blocks, env);
    let new = NewNote {
        title: result.title.clone(),
        content: result.markdown.clone(),
        source: "classroom".to_string(),
        session_id: Some(id),
        // REQ-171：规则版本 + 净化统计落库（可追溯"用哪版规则生成"）
        rule_version: Some(RULE_VERSION.to_string()),
        purify_stats: Some(serde_json::to_string(&result.stats).unwrap_or_default()),
    };
    db.create_note(&new).map_err(|e| e.to_string())
}

/// 会话 → 笔记：转写段 + OCR 块经 note_filter 净化管线，一键落库（REQ-010 闭环）。
#[tauri::command]
pub async fn session_to_note(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    ai_decisions: Option<Vec<TextFilterDecision>>,
) -> Result<Note, String> {
    convert_to_note(
        &state.db,
        &state.ui_junk,
        &PurifyEnv {
            config: state.purify.clone(),
            symbol: state.symbol_normalize.clone(),
            corrections: state.ocr_corrections.clone(),
        },
        &state.data_dir,
        id,
        title,
        ai_decisions,
    )
}

/// 批量转笔记核心编排（v0.7.1：部分成功语义——单条失败不阻塞其他）。
///
/// @ai-context: 纯编排纯函数（注入 Db + UiJunkList，无 Tauri 依赖，可单测）；
///              跳过规则显式回传原因（不静默）：无效 id / 进行中 / 已转 / 会话不存在；
///              DB 读错误视为硬失败中止（库损坏时继续处理无意义）。
pub fn run_batch_conversion(
    db: &Db,
    ui_junk: &UiJunkList,
    env: &PurifyEnv,
    data_dir: &std::path::Path,
    ids: Vec<i64>,
) -> Result<BatchNoteResult, String> {
    if ids.len() > 50 {
        return Err("批量转换上限 50 条".to_string());
    }
    let mut converted = Vec::new();
    let mut skipped = Vec::new();
    let mut seen = HashSet::new();
    for id in ids {
        if id <= 0 {
            skipped.push(SkippedNote { session_id: id, reason: "无效的会话 id".to_string() });
            continue;
        }
        if !seen.insert(id) {
            continue; // 重复 id 静默去重（同一会话只处理一次）
        }
        match db.get_session(id) {
            Ok(Some(s)) if s.status == SESSION_STATUS_RECORDING => {
                skipped.push(SkippedNote {
                    session_id: id,
                    reason: "进行中的会话不能生成笔记".to_string(),
                });
            }
            Ok(Some(_)) => {
                // 已转跳过（防重复笔记）；详情页单条转换保留"有意重新生成"路径
                if db.find_note_by_session(id).map_err(|e| e.to_string())?.is_some() {
                    skipped.push(SkippedNote {
                        session_id: id,
                        reason: "已转笔记（批量转跳过，避免重复）".to_string(),
                    });
                    continue;
                }
                match convert_to_note(db, ui_junk, env, data_dir, id, None, None) {
                    Ok(note) => converted.push(ConvertedNote { session_id: id, note_id: note.id }),
                    Err(reason) => skipped.push(SkippedNote { session_id: id, reason }),
                }
            }
            Ok(None) => {
                skipped.push(SkippedNote { session_id: id, reason: "会话不存在".to_string() });
            }
            Err(e) => {
                skipped.push(SkippedNote { session_id: id, reason: e.to_string() });
            }
        }
    }
    Ok(BatchNoteResult { converted, skipped })
}

/// 批量转笔记（v0.7.1 会话体验：列表勾选批量转化）。
#[tauri::command]
pub async fn batch_session_to_note(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<BatchNoteResult, String> {
    run_batch_conversion(
        &state.db,
        &state.ui_junk,
        &PurifyEnv {
            config: state.purify.clone(),
            symbol: state.symbol_normalize.clone(),
            corrections: state.ocr_corrections.clone(),
        },
        &state.data_dir,
        ids,
    )
}

/// 会话笔记预览（REQ-081）：过滤后只读预览——不落库、不改库。
///
/// @ai-context: 与 session_to_note 同一过滤管线（输出一致性由构造保证）；
///              返回 NoteFilterResult（markdown + 过滤统计 + 被过滤对照 +
///              kept 段），前端展示过滤统计卡/对照复查/一键落库。
/// @ai-context: v0.7.3（REQ-160）：ocr_screens attach 归档图（预览屏卡配图；
///              目录缺失/无图 → 纯文本降级）。
/// @ai-context: v0.7.6（REQ-177/178）：预览与落库同口径——结构渲染（章节
///              标题 + 词汇表块）在预览即生效。
#[tauri::command]
pub async fn preview_session_note(
    state: State<'_, AppState>,
    id: i64,
) -> Result<NoteFilterResult, String> {
    let (session, segments, ocr_blocks) = load_note_material(&state.db, id)?;
    let env = PurifyEnv {
        config: state.purify.clone(),
        symbol: state.symbol_normalize.clone(),
        corrections: state.ocr_corrections.clone(),
    };
    let mut result = filter_note(&session.title, &segments, &ocr_blocks, &state.ui_junk, &env);
    let images_dir = state.data_dir.join("session-images").join(id.to_string());
    crate::screens::attach_images(&mut result.ocr_screens, &images_dir);
    // v0.7.5（REQ-170）：预览与落库同口径——异常会话预览即带警示行
    crate::note_filter::apply_session_warning(&mut result, &session.status);
    crate::note_filter::refresh_screen_points(&mut result);
    // v0.7.6（REQ-177/178）：结构渲染（与 convert_to_note 同函数同口径）
    apply_note_structure(&mut result, &state.db, &session, &segments, &ocr_blocks, &env);
    Ok(result)
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
    let sessions = state
        .db
        .list_sessions(None, LIST_LIMIT_MAX, 0)
        .map_err(|e| e.to_string())?;
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
    crate::db_ocr_search::search_command(&state.db, &keyword).map_err(|e| e.to_string())
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
