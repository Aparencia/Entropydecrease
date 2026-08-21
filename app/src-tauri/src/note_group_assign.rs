//! 容器侧组化业务层（v0.11.0 REQ-197；接线优先于新建——存量资产重组织）。
//!
//! @ai-context: 会话→笔记落库后把笔记归入笔记组（v4 §7.4 统一产物层）：
//!              1. series_detect 命中 → 课程组（series_key 幂等，REQ-078 语义升级）；
//!              2. 无系列 → group_route 结构密度路由三态（自成一组/归主题组/待确认）。
//! @ai-context: 信号全部来自既有检测资产（章节/术语/OCR/形态/领域），零新建检测；
//!              组化失败不阻断转笔记主链路（调用方防御性降级，笔记先落库）。
//! @ai-context: 路由理由 JSON 落组（REQ-198 可见可改的数据源）；已改判组
//!              （route_overridden=1）不被自动路由改写——修改即记忆。

use crate::analysis::SessionAnalysis;
use crate::db::Db;
use crate::error::Result;
use crate::group_route::{route_group, GroupRouteSignals, RouteAction};
use crate::types::{NewNoteGroup, Session, SessionOcrBlock, SessionSegment};
use crate::video_profile_domain::{detect_domain, DomainSignals};

/// 会话已归属的组 id（既有笔记继承路径——AI 精修基线同会话同组）。
pub fn group_of_session(db: &Db, session_id: i64) -> Result<Option<i64>> {
    Ok(db.find_note_by_session(session_id)?.and_then(|n| n.group_id))
}

/// 会话 → 组解析：系列直判课程组，否则结构密度路由；返回组 id。
///
/// @ai-context: 幂等语义——同系列多集复用同一课程组（series_key 唯一索引）；
///              主题组按 domain_tag+terrain 复用（契约一：粒度对齐领域）。
pub fn resolve_group_for_session(
    db: &Db,
    session: &Session,
    analysis: &SessionAnalysis,
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
) -> Result<i64> {
    // 1) 系列命中 → 课程组（REQ-078 语义升级：课程组=容器组）
    if let Some(info) = crate::series_detect::extract_series(&session.title) {
        if let Some(existing) = db.find_group_by_series_key(&info.series)? {
            return Ok(existing.id);
        }
        let group = db.create_group(&NewNoteGroup {
            name: info.series.clone(),
            terrain: "container".to_string(),
            kind: "course".to_string(),
            domain_tag: None,
            source: "series".to_string(),
            series_key: Some(info.series.clone()),
            route_reason: Some(
                serde_json::json!({"action":"course","reasons":["系列内容命中（合集/分P）"]})
                    .to_string(),
            ),
        })?;
        return Ok(group.id);
    }
    // 2) 结构密度路由（信号收集 → 三态判定）
    let signals = collect_signals(session, analysis, segments, ocr_blocks);
    let decision = route_group(&signals);
    let reason_json = serde_json::json!({
        "action": match decision.action {
            RouteAction::OwnGroup => "own",
            RouteAction::TopicGroup => "topic",
            RouteAction::NeedConfirm => "confirm",
        },
        "needsConfirm": decision.action == RouteAction::NeedConfirm,
        "reasons": decision.reasons,
    })
    .to_string();
    match decision.action {
        RouteAction::TopicGroup => {
            // 领域命中是 TopicGroup 的前提（route_group 内已保证 Some）
            let kind = signals.domain_kind.expect("TopicGroup 必有领域命中");
            let tag = kind.as_str();
            if let Some(existing) = db.find_topic_group(tag, "container")? {
                return Ok(existing.id);
            }
            let group = db.create_group(&NewNoteGroup {
                name: kind.label().to_string(),
                terrain: "container".to_string(),
                kind: "topic".to_string(),
                domain_tag: Some(tag.to_string()),
                source: "route".to_string(),
                series_key: None,
                route_reason: Some(reason_json),
            })?;
            Ok(group.id)
        }
        // OwnGroup/NeedConfirm 均落独立组——待确认组带标记由 UI 高亮（REQ-198）
        RouteAction::OwnGroup | RouteAction::NeedConfirm => {
            let group = db.create_group(&NewNoteGroup {
                name: session.title.clone(),
                terrain: "container".to_string(),
                kind: "standalone".to_string(),
                domain_tag: None,
                source: "route".to_string(),
                series_key: None,
                route_reason: Some(reason_json),
            })?;
            Ok(group.id)
        }
    }
}

/// 路由信号收集（纯组装：既有资产 → GroupRouteSignals）。
///
/// @ai-context: 口径定义：
///              - 章节密度 = 章节数 / 会话时长（小时）；时长缺失 → None 不投票
///              - OCR 文本密度 = OCR 字符数 / 转写字符数（上限 1.0）——PPT 密集
///                课堂画面文字远超口播文本 → 高值；纯音频 → 0
///              - 形态 unknown = sessions.profile 落库 'unknown'（四维解耦诚实未知）
fn collect_signals(
    session: &Session,
    analysis: &SessionAnalysis,
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
) -> GroupRouteSignals {
    let duration_secs = match (session.started_at, session.ended_at) {
        (start, Some(end)) if end > start => (end - start) as f32,
        _ => 0.0,
    };
    let chapter_density = if duration_secs > 0.0 && !analysis.chapters.is_empty() {
        Some(analysis.chapters.len() as f32 / (duration_secs / 3600.0))
    } else {
        // 零章节也是信号（低结构票）——仅时长可算时才投票
        (duration_secs > 0.0).then_some(0.0)
    };
    let transcript_chars: usize = segments.iter().map(|s| s.text.chars().count()).sum();
    let ocr_chars: usize = ocr_blocks.iter().map(|b| b.text.chars().count()).sum();
    let ocr_text_density = if transcript_chars > 0 || ocr_chars > 0 {
        Some((ocr_chars as f32 / transcript_chars.max(1) as f32).min(1.0))
    } else {
        None
    };
    let domain = detect_domain(&DomainSignals {
        title: Some(session.title.clone()),
        ..Default::default()
    });
    GroupRouteSignals {
        has_series: false, // 系列在 resolve 层早退，此处恒 false
        chapter_density,
        glossary_terms: Some(analysis.glossary.len()),
        ocr_text_density,
        profile_unknown: session.profile.as_deref() == Some("unknown"),
        tier_rich: false, // 画面档未随会话落库（V1.0 接线；缺省不投票）
        domain_kind: domain.kind,
    }
}

/// 单测独立文件。
#[cfg(test)]
#[path = "note_group_assign_tests.rs"]
mod tests;
