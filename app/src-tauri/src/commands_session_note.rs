//! 会话 → 笔记转换管线 commands（REQ-081/082；v0.7.6 审查硬拆）。
//!
//! @ai-context: v0.7.6 新增代码审查：commands_session.rs 超 600 行硬拆
//!              （AGENTS.md §3 不允许豁免）——将笔记转换内聚域（原料装载/
//!              结构渲染接线/单条转换/批量编排/只读预览）拆至此文件；
//!              commands_session.rs 经 `pub use` 重导出命令函数，lib.rs
//!              命令注册与既有调用方零改动（公共 API 保持兼容）。
//! @ai-context: REQ-081/082：session_to_note（落库）与 preview_session_note
//!              （只读预览）共用 note_filter 单一管线——输出一致性由构造保证
//!              （同一过滤链/同一 Markdown 组装）；v0.7.6 结构渲染层（章节
//!              标题+词汇表块）双出口同函数同口径。
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）。

use std::collections::HashSet;

use tauri::State;

use crate::ai_protocol::TextFilterDecision;
use crate::analysis::analyze_session_opt;
use crate::commands::{normalize_title, AppState};
use crate::db::Db;
use crate::db_sessions::SESSION_STATUS_RECORDING;
use crate::note_filter::{apply_ai_decisions, filter_note, NoteFilterResult, PurifyEnv, RULE_VERSION};
use crate::outline::{detect_outline_smart, OutlineConfig};
use crate::structure_note::render_note_structure;
use crate::types::{
    BatchNoteResult, ConvertedNote, NewNote, Note, Session, SessionDetail, SessionOcrBlock,
    SessionSegment, SkippedNote,
};
use crate::ui_junk::UiJunkList;
use crate::video_profile::ProfileKind;

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

/// 结构渲染接线（v0.7.6 REQ-177/178，预览/落库/AI 复核三出口共用）。
///
/// @ai-context: 在 refresh_screen_points 之后调用——净化/配图/警示行先落定，
///              结构层在其上叠加章节标题与词汇表块；预览与落库同函数同口径
///              （REQ-081 单一管线双出口契约）。
/// @ai-context: 输入为会话原料（segments/ocr_blocks）——章节检测/大纲标题/
///              术语表均为纯本地规则（analysis/outline/glossary 复用）——
///              不依赖云端 AI（本地优先铁律）；失败不阻断转笔记主链路
///              （分析失败按空结构处理，不抛错）。
/// @ai-context: pub(crate)（v0.7.6 审查修复）：commands_ai.rs AI 复核出口
///              复用——复核后预览与落库同含结构层（REQ-081 三出口一致）。
pub(crate) fn apply_note_structure(
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
    // TD-2026-08-20-C：list_events 失败不再静默——事件缺失时章节检测回退
    // OCR/gap 近似（诚实降级语义不变），但留日志线索（purify_config 同模式）
    let events = match db.list_events(session.id) {
        Ok(ev) => ev,
        Err(e) => {
            eprintln!("[notes] list_events 失败（章节检测回退 OCR/gap 近似）: {e}");
            Vec::new()
        }
    };
    let detail = SessionDetail {
        session: session.clone(),
        segments: segments.to_vec(),
        ocr_blocks: ocr_blocks.to_vec(),
        events,
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
///
/// @ai-context: TD-2026-08-20-A 清偿：主体迁 spawn_blocking——v0.7.6 起管线叠加
///              analyze_session_opt 全量分析（章节/术语/重点等），千段长会话
///              可达秒级，不得占用异步运行时线程（review_text_filter 先例）。
#[tauri::command]
pub async fn session_to_note(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    ai_decisions: Option<Vec<TextFilterDecision>>,
) -> Result<Note, String> {
    let state: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("转笔记任务失败: {}", e))?
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
/// @ai-context: TD-2026-08-20-A 清偿：迁 spawn_blocking（≤50 条 × 全量分析，
///              长会话批量可达数十秒——不得阻塞异步运行时线程）。
#[tauri::command]
pub async fn batch_session_to_note(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<BatchNoteResult, String> {
    let state: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("批量转笔记任务失败: {}", e))?
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
    // TD-2026-08-20-A 清偿：迁 spawn_blocking（预览与落库同口径——全量分析
    // 同样耗时；数据所有权移入闭包，消除 segments/ocr_blocks 二次拷贝——观察 1）
    let state: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("笔记预览任务失败: {}", e))?
}
