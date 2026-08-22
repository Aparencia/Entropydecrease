//! session_glossary 数据层纯逻辑测试（build_glossary_terms 形状适配）。

use crate::commands_session_glossary::{build_glossary_terms, GlossaryTerm};
use crate::session_events::SessionEvent;
use crate::types::{Session, SessionDetail, SessionOcrBlock, SessionSegment};
use crate::video_profile::ProfileKind;

/// 构造测试会话（Lecture 档案；OCR 高频缩略词 WBS ×3，ASR 不含）。
///
/// @ai-context: WBS 块 ts 1000/2000/3000——span 2000ms < 60s 水印阈值，
///              不触发水印排除（watermark_filter 三阈值中的 span 维度）；
///              缩略词低阈值路径（OCR ≥2 × ASR ≤1）命中。
fn lecture_detail() -> SessionDetail {
    let session = Session {
        id: 1,
        title: "术语测试".to_string(),
        source_window: None,
        started_at: 1000,
        ended_at: Some(5000),
        status: "finished".to_string(),
        profile: Some("lecture".to_string()),
        kind: None,
    };
    let ocr_blocks: Vec<SessionOcrBlock> = [1000u64, 2000, 3000]
        .into_iter()
        .map(|ts| SessionOcrBlock {
            id: ts as i64,
            session_id: 1,
            timestamp_ms: ts,
            text: "WBS 是什么".to_string(),
            score: 0.9,
            region: "full".to_string(),
            region_kind: None,
            bbox: None,
            screen_id: None,
        })
        .collect();
    let segments = vec![SessionSegment {
        id: 1,
        session_id: 1,
        start_ms: 500,
        end_ms: 900,
        text: "我们开始今天的内容".to_string(),
        source: "asr".to_string(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }];
    SessionDetail {
        session,
        segments,
        ocr_blocks,
        events: Vec::<SessionEvent>::new(),
        screens: Vec::new(),
    }
}

#[test]
fn build_glossary_terms_lecture_returns_high_freq_ocr_term() {
    let terms = build_glossary_terms(&lecture_detail(), ProfileKind::Lecture);
    let wbs = terms.iter().find(|t| t.term == "WBS").expect("WBS 应命中缩略词候选");
    assert_eq!(wbs.ocr_count, 3);
    assert_eq!(wbs.asr_count, 0);
    assert!(wbs.score > 0.0);
}

#[test]
fn build_glossary_terms_talking_head_is_empty() {
    // 口播档案 glossary gate 关（与笔记词汇表时代同口径）——术语表区显示"无术语"
    assert!(build_glossary_terms(&lecture_detail(), ProfileKind::TalkingHead).is_empty());
}

#[test]
fn glossary_term_serializes_camel_case() {
    let t = GlossaryTerm {
        term: "WBS".to_string(),
        score: 3.0,
        ocr_count: 3,
        asr_count: 0,
    };
    let json = serde_json::to_string(&t).unwrap();
    assert!(json.contains("\"ocrCount\":3"), "应序列化为 camelCase: {}", json);
    assert!(json.contains("\"asrCount\":0"));
    assert!(!json.contains("ocr_count"));
}
