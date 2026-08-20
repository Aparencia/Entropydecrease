//! 会话结构化分析编排单测（REQ-044/045/046 / v0.5.0 M2）。
//!
//! @ai-context: AAA 模式；注入合成 SessionDetail 验证各机制输出与档案开关门控。

use super::*;
use crate::types::{Session, SessionOcrBlock, SessionSegment};

/// 构造合成会话详情（分段 + OCR 块）。
fn detail(segments: Vec<(&str, u64, u64)>, ocr: Vec<(&str, u64)>) -> SessionDetail {
    let session = Session {
        id: 1,
        title: "合成会话".into(),
        source_window: None,
        started_at: 0,
        ended_at: Some(100),
        status: "finished".into(),
        profile: None,
    };
    let segments = segments
        .into_iter()
        .map(|(text, start_ms, end_ms)| SessionSegment {
            id: 0,
            session_id: 1,
            start_ms,
            end_ms,
            text: text.into(),
            source: "asr".into(),
            confidence: Some(0.9),
            volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None,
        })
        .collect();
    let ocr_blocks = ocr
        .into_iter()
        .map(|(text, timestamp_ms)| SessionOcrBlock {
            id: 0,
            session_id: 1,
            timestamp_ms,
            text: text.into(),
            score: 0.9,
            region: "full".into(),
            region_kind: None,
            bbox: None,
            screen_id: None,
        })
        .collect();
    SessionDetail { session, segments, ocr_blocks, events: Vec::new(), screens: Vec::new() }
}

/// 构造带事件的会话详情（REQ-108：真实信号消费测试）。
fn detail_with_events(
    segments: Vec<(&str, u64, u64)>,
    events: Vec<crate::session_events::SessionEvent>,
) -> SessionDetail {
    let mut d = detail(segments, Vec::new());
    d.events = events;
    d
}

#[test]
fn lecture_profile_runs_chapter_and_glossary() {
    // Arrange：网课会话——两章话题 + 板书术语高频
    let d = detail(
        vec![
            ("第一章 变量定义", 0, 5000),
            ("变量类型讲解", 6000, 10000),
            ("第二章 函数调用", 40000, 45000),
            ("函数参数说明", 46000, 50000),
        ],
        vec![
            ("变量术语表", 1000),
            ("变量术语表", 8000),
            ("函数术语表", 41000),
            ("函数术语表", 47000),
        ],
    );
    // Act：网课档案（章节+术语表开）
    let analysis = analyze_session(&d, ProfileKind::Lecture);
    // Assert：章节边界存在（话题切换 + 画面切换近似）；术语候选存在
    assert!(!analysis.chapters.is_empty(), "网课档案应产出章节边界");
    assert!(!analysis.glossary.is_empty(), "网课档案应产出术语候选");
}

#[test]
fn talking_head_profile_runs_highlights_only() {
    // Arrange：口播会话——重复短语（无 OCR）
    let d = detail(
        vec![
            ("嗯，重点是边界条件", 0, 5000),
            ("再强调一次重点是边界条件", 6000, 10000),
        ],
        vec![],
    );
    // Act：口播档案（重点开；章节/术语表关；书面化开）
    let analysis = analyze_session(&d, ProfileKind::TalkingHead);
    // Assert：重点候选有；章节/术语表空（开关门控生效）；书面化加工版有且可逆
    assert!(!analysis.highlights.is_empty(), "口播档案应产出重点候选");
    assert!(analysis.chapters.is_empty(), "口播档案不开章节检测");
    assert!(analysis.glossary.is_empty(), "口播档案不开术语表");
    assert_eq!(analysis.normalized_segments.len(), 2, "口播档案应产出加工版段");
    assert!(!analysis.normalized_segments[0].text.contains('嗯'), "语气词应被书面化清除");
}

#[test]
fn meeting_profile_speaker_changes_empty_degraded() {
    // Arrange：会议会话（A3 无 embedding 数据）
    let d = detail(vec![("讨论进度", 0, 5000), ("安排下周任务", 6000, 10000)], vec![]);
    // Act：会议档案（说话人检测开）
    let analysis = analyze_session(&d, ProfileKind::Meeting);
    // Assert：降级形态——无 embedding → 空事件（不崩溃、不误判）
    assert!(analysis.speaker_changes.is_empty());
}

#[test]
fn empty_session_safe() {
    // Arrange：空会话
    let d = detail(vec![], vec![]);
    // Act：各档案均不崩溃
    for kind in [
        ProfileKind::Lecture,
        ProfileKind::HandsOn,
        ProfileKind::TalkingHead,
        ProfileKind::Interview,
        ProfileKind::Meeting,
        ProfileKind::Podcast,
        ProfileKind::Live,
        ProfileKind::Whiteboard,
        ProfileKind::GameTutorial,
        ProfileKind::Exercise,
        ProfileKind::FollowAlong,
        ProfileKind::Coding,
    ] {
        let analysis = analyze_session(&d, kind);
        // Assert：全空
        assert!(analysis.chapters.is_empty());
        assert!(analysis.highlights.is_empty());
        assert!(analysis.glossary.is_empty());
        assert!(analysis.speaker_changes.is_empty());
        assert!(analysis.step_boundaries.is_empty());
        assert!(analysis.normalized_segments.is_empty());
    }
}

#[test]
fn hands_on_profile_no_chapters() {
    // Arrange：实操会话
    let d = detail(vec![("第一步操作", 0, 5000), ("第二步操作", 40000, 45000)], vec![]);
    // Act：实操档案（章节关、步骤卡机制由 M7 消费）
    let analysis = analyze_session(&d, ProfileKind::HandsOn);
    // Assert：无章节（开关门控）；无术语表
    assert!(analysis.chapters.is_empty());
    assert!(analysis.glossary.is_empty());
}

#[test]
fn build_chapter_signals_detects_frame_switch_approximation() {
    // Arrange：两窗口 OCR 文本不同（新文字 = 画面切换近似），每窗口均有段文本
    let segments = vec![
        SessionSegment { id: 0, session_id: 1, start_ms: 0, end_ms: 1000, text: "第一章内容".into(), source: "asr".into(), volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None, confidence: None },
        SessionSegment { id: 1, session_id: 1, start_ms: 40000, end_ms: 41000, text: "第二章内容".into(), source: "asr".into(), volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None, confidence: None },
    ];
    let ocr = vec![
        SessionOcrBlock { id: 0, session_id: 1, timestamp_ms: 100, text: "PPT-第一章".into(), score: 0.9, region: "full".into(), region_kind: None, bbox: None, screen_id: None },
        SessionOcrBlock { id: 1, session_id: 1, timestamp_ms: 40100, text: "PPT-第二章".into(), score: 0.9, region: "full".into(), region_kind: None, bbox: None, screen_id: None },
    ];
    // Act
    let signals = build_chapter_signals(&segments, &ocr);
    // Assert：跨窗口文本变化 → 至少一个窗口 frame_switched=true
    assert!(signals.len() >= 2, "应产出 ≥2 窗口");
    assert!(signals.iter().any(|s| s.frame_switched), "新文字窗口应标记画面切换");
}

#[test]
fn build_chapter_signals_long_silence_approximation() {
    // Arrange：段间 gap 4s（> 3s 阈值）
    let segments = vec![
        SessionSegment { id: 0, session_id: 1, start_ms: 0, end_ms: 1000, text: "第一句".into(), source: "asr".into(), volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None, confidence: None },
        SessionSegment { id: 1, session_id: 1, start_ms: 5000, end_ms: 6000, text: "第二句".into(), source: "asr".into(), volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None, confidence: None },
    ];
    // Act
    let signals = build_chapter_signals(&segments, &[]);
    // Assert：长静音近似命中
    assert!(signals.iter().any(|s| s.long_silence), "gap≥3s 应标记长静音");
}

// ── REQ-108（v0.7.0 M1.5）：事件消费真实信号 ──

#[test]
fn chapter_signals_from_real_events() {
    // Arrange：真实帧切换 + 长静音事件（替代 OCR/gap 近似）
    let segments = vec![
        SessionSegment { id: 0, session_id: 1, start_ms: 0, end_ms: 1000, text: "第一章内容".into(), source: "asr".into(), volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None, confidence: None },
        SessionSegment { id: 1, session_id: 1, start_ms: 40000, end_ms: 41000, text: "第二章内容".into(), source: "asr".into(), volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None, confidence: None },
    ];
    let events = vec![
        crate::session_events::SessionEvent {
            id: 1, session_id: 1, kind: crate::session_events::EventKind::FrameSwitch,
            timestamp_ms: 35000, payload: serde_json::json!({}),
        },
        crate::session_events::SessionEvent {
            id: 2, session_id: 1, kind: crate::session_events::EventKind::LongSilence,
            timestamp_ms: 20000, payload: serde_json::json!({"duration_ms": 4000}),
        },
    ];
    // Act：事件版信号（无 OCR 输入也命中——真实信号不依赖画面文字）
    let signals = build_chapter_signals_with_events(&segments, &events);
    // Assert：两窗口均有真实信号（帧切换在第二窗口、长静音在窗口 0-30s）
    assert!(signals.len() >= 2, "应产出 ≥2 窗口");
    assert!(signals.iter().any(|s| s.frame_switched), "真实帧切换事件应标记画面切换");
    assert!(signals.iter().any(|s| s.long_silence), "真实长静音事件应标记长静音");
}

#[test]
fn chapter_analysis_prefers_events_over_approximation() {
    // Arrange：带事件的会话（章节检测走事件路径）
    let d = detail_with_events(
        vec![("第一章内容", 0, 1000), ("第二章内容", 40000, 41000)],
        vec![crate::session_events::SessionEvent {
            id: 1, session_id: 1, kind: crate::session_events::EventKind::FrameSwitch,
            timestamp_ms: 35000, payload: serde_json::json!({}),
        }],
    );
    // Act：网课档案分析（事件路径）
    let analysis = analyze_session(&d, ProfileKind::Lecture);
    // Assert：章节边界产出（帧切换事件 → 双信号中的画面信号）
    assert!(!analysis.chapters.is_empty(), "事件信号应驱动章节检测");
}

#[test]
fn chapter_analysis_falls_back_without_events() {
    // Arrange：无事件的旧会话（零回归——近似路径）
    let d = detail(
        vec![("第一章内容", 0, 1000), ("第二章内容", 40000, 41000)],
        vec![("PPT-第一章", 100), ("PPT-第二章", 40100)],
    );
    // Act
    let analysis = analyze_session(&d, ProfileKind::Lecture);
    // Assert：近似路径仍工作（章节检测不因无事件而失效）
    assert!(!analysis.chapters.is_empty(), "无事件时近似信号路径应保持");
}

// ── REQ-123（v0.7.0 M2）：跟练档案步骤边界 ──

#[test]
fn follow_along_profile_computes_step_boundaries() {
    // Arrange：跟练会话——口令段（步骤切分主信号）
    let d = detail(
        vec![
            ("第一组动作开始", 0, 3000),
            ("第二组跟上节奏", 10000, 13000),
            ("休息一下", 30000, 32000),
        ],
        vec![],
    );
    // Act：跟练档案（步骤边界 gate 开）
    let analysis = analyze_session(&d, ProfileKind::FollowAlong);
    // Assert：口令边界标记正确（cue 理由 + 口令原文标签）
    assert!(!analysis.step_boundaries.is_empty(), "跟练档案应产出步骤边界");
    assert!(analysis.step_boundaries.iter().any(|b| b.reason == "cue" && b.label.as_deref() == Some("第一组")));
    assert!(analysis.step_boundaries.iter().any(|b| b.reason == "cue" && b.label.as_deref() == Some("第二组")));
    assert!(analysis.step_boundaries.iter().any(|b| b.reason == "cue" && b.label.as_deref().unwrap_or_default().contains("休息")));
}

#[test]
fn step_boundaries_gated_by_follow_along_profile() {
    // Arrange：同一段样本（口令段）
    let d = detail(vec![("第二组开始", 10000, 13000)], vec![]);
    // Act：跟练 vs 网课档案
    let follow = analyze_session(&d, ProfileKind::FollowAlong);
    let lecture = analyze_session(&d, ProfileKind::Lecture);
    // Assert：跟练档案计算；其余档案空向量兜底（与 speaker_changes 同模式）
    assert!(!follow.step_boundaries.is_empty());
    assert!(lecture.step_boundaries.is_empty(), "非跟练档案不计算步骤边界");
}

// ── REQ-128（v0.7.0 M2）：实践段消费（前台切换事件 → practice_segments）──

/// 构造信号事件（测试夹具）。
fn ev(
    kind: crate::session_events::EventKind,
    timestamp_ms: u64,
    payload: serde_json::Value,
) -> crate::session_events::SessionEvent {
    crate::session_events::SessionEvent { id: 0, session_id: 1, kind, timestamp_ms, payload }
}

#[test]
fn practice_segments_consumed_from_events() {
    // Arrange：前台切换序列（目标 100 → 编辑器 200 → 回 100）
    let d = detail_with_events(
        vec![("讲解", 0, 2000)],
        vec![
            ev(crate::session_events::EventKind::ForegroundSwitch, 1000, serde_json::json!({"hwnd": 100})),
            ev(crate::session_events::EventKind::ForegroundSwitch, 5000, serde_json::json!({"hwnd": 200})),
            ev(crate::session_events::EventKind::ForegroundSwitch, 9000, serde_json::json!({"hwnd": 100})),
        ],
    );
    // Act：网课档案（全档案计算——实践段不按档案门控）
    let analysis = analyze_session(&d, ProfileKind::Lecture);
    // Assert：一个实践段（5000 离开视频 → 9000 回来），tool 诚实 "other"
    assert_eq!(analysis.practice_segments.len(), 1);
    assert_eq!(analysis.practice_segments[0].start_ms, 5000);
    assert_eq!(analysis.practice_segments[0].end_ms, 9000);
    assert_eq!(analysis.practice_segments[0].tool, "other");
}

#[test]
fn practice_segments_empty_without_events() {
    // Arrange：无事件会话
    let d = detail(vec![("讲解", 0, 5000)], vec![]);
    // Act
    let analysis = analyze_session(&d, ProfileKind::Lecture);
    // Assert：空向量兜底（不崩溃、不误判）
    assert!(analysis.practice_segments.is_empty());
}

// ── REQ-125（v0.7.0 M2）：播放器行为消费（PlayerBehavior 事件 → player_actions）──

#[test]
fn player_actions_consumed_from_events() {
    // Arrange：暂停 → 恢复 → 倍速 事件序列
    let d = detail_with_events(
        vec![("讲解", 0, 2000)],
        vec![
            ev(crate::session_events::EventKind::PlayerBehavior, 3000, serde_json::json!({"action": "pause", "value": null})),
            ev(crate::session_events::EventKind::PlayerBehavior, 8000, serde_json::json!({"action": "play", "value": null})),
            ev(crate::session_events::EventKind::PlayerBehavior, 12000, serde_json::json!({"action": "speed", "value": 1.5})),
        ],
    );
    // Act
    let analysis = analyze_session(&d, ProfileKind::Lecture);
    // Assert：三条行为事件映射完整（action/value/时间）
    assert_eq!(analysis.player_actions.len(), 3);
    assert_eq!(analysis.player_actions[0].action, "pause");
    assert_eq!(analysis.player_actions[0].time_ms, 3000);
    assert_eq!(analysis.player_actions[0].value, None);
    assert_eq!(analysis.player_actions[1].action, "play");
    assert_eq!(analysis.player_actions[2].action, "speed");
    assert_eq!(analysis.player_actions[2].value, Some(1.5));
}

#[test]
fn player_actions_empty_without_events() {
    // Arrange：无事件会话
    let d = detail(vec![("讲解", 0, 5000)], vec![]);
    // Act
    let analysis = analyze_session(&d, ProfileKind::Lecture);
    // Assert：空向量兜底
    assert!(analysis.player_actions.is_empty());
}
