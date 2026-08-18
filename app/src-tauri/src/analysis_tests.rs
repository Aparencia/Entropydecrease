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
        })
        .collect();
    SessionDetail { session, segments, ocr_blocks }
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
    ] {
        let analysis = analyze_session(&d, kind);
        // Assert：全空
        assert!(analysis.chapters.is_empty());
        assert!(analysis.highlights.is_empty());
        assert!(analysis.glossary.is_empty());
        assert!(analysis.speaker_changes.is_empty());
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
        SessionSegment { id: 0, session_id: 1, start_ms: 0, end_ms: 1000, text: "第一章内容".into(), source: "asr".into(), confidence: None },
        SessionSegment { id: 1, session_id: 1, start_ms: 40000, end_ms: 41000, text: "第二章内容".into(), source: "asr".into(), confidence: None },
    ];
    let ocr = vec![
        SessionOcrBlock { id: 0, session_id: 1, timestamp_ms: 100, text: "PPT-第一章".into(), score: 0.9, region: "full".into() },
        SessionOcrBlock { id: 1, session_id: 1, timestamp_ms: 40100, text: "PPT-第二章".into(), score: 0.9, region: "full".into() },
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
        SessionSegment { id: 0, session_id: 1, start_ms: 0, end_ms: 1000, text: "第一句".into(), source: "asr".into(), confidence: None },
        SessionSegment { id: 1, session_id: 1, start_ms: 5000, end_ms: 6000, text: "第二句".into(), source: "asr".into(), confidence: None },
    ];
    // Act
    let signals = build_chapter_signals(&segments, &[]);
    // Assert：长静音近似命中
    assert!(signals.iter().any(|s| s.long_silence), "gap≥3s 应标记长静音");
}
