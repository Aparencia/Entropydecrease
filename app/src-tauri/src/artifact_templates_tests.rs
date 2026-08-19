//! 五档案产物模板 golden 测试（REQ-052 / v0.5.0 M7）。
//!
//! @ai-context: AAA 模式；注入合成 SessionDetail + 关键图候选，
//!              验证五模板产物块结构与内容（golden 语义：结构 + 关键字段断言）。

use super::*;
use crate::types::{Session, SessionOcrBlock, SessionSegment};

/// 构造合成会话详情辅助。
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
        .enumerate()
        .map(|(i, (text, start_ms, end_ms))| SessionSegment {
            id: i as i64 + 1,
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
        .enumerate()
        .map(|(i, (text, timestamp_ms))| SessionOcrBlock {
            id: i as i64 + 1,
            session_id: 1,
            timestamp_ms,
            text: text.into(),
            score: 0.9,
            region: "full".into(),
            region_kind: None,
        })
        .collect();
    SessionDetail { session, segments, ocr_blocks, events: Vec::new() }
}

fn keyframes() -> Vec<KeyFrameCandidate> {
    vec![
        KeyFrameCandidate { timestamp_ms: 1000, score: 5.0, reasons: vec!["新文字".into()], user_marked: false },
        KeyFrameCandidate { timestamp_ms: 4000, score: 3.0, reasons: vec!["停留久".into()], user_marked: false },
    ]
}

/// 网课会话（两章话题 + 板书术语）。
fn lecture_detail() -> SessionDetail {
    detail(
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
        ],
    )
}

#[test]
fn lecture_template_produces_paragraphs_terms_images() {
    // Arrange
    let d = lecture_detail();
    // Act
    let artifact = build_artifact(ProfileKind::Lecture, &d, &keyframes());
    // Assert：含段落/术语/小结/关键图块
    assert_eq!(artifact.profile, "lecture");
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Paragraph));
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::TermAnchor));
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::KeyImage));
    // 关键图 ≤3 张
    let images = artifact.blocks.iter().filter(|b| b.kind == ArtifactKind::KeyImage).count();
    assert!(images <= 3);
    // 块顺序连续（0 起递增）
    for (i, b) in artifact.blocks.iter().enumerate() {
        assert_eq!(b.order as usize, i);
    }
}

#[test]
fn lecture_paragraph_uses_normalized_text() {
    // Arrange：含语气词段
    let d = detail(
        vec![("嗯，这个公式很重要", 0, 5000)],
        vec![],
    );
    // Act
    let artifact = build_artifact(ProfileKind::Lecture, &d, &[]);
    // Assert：书面化文本（"嗯"被清除）
    let para = artifact
        .blocks
        .iter()
        .find(|b| b.kind == ArtifactKind::Paragraph)
        .expect("段落");
    match &para.payload {
        BlockPayload::Text(t) => assert!(!t.contains('嗯'), "书面化应清除语气词: {}", t),
        _ => panic!("段落载荷应为 Text"),
    }
}

#[test]
fn hands_on_template_produces_step_cards() {
    // Arrange：实操会话 + 关键帧
    let d = detail(
        vec![("第一步打开软件", 1000, 3000), ("第二步导入文件", 5000, 8000)],
        vec![],
    );
    // Act
    let artifact = build_artifact(ProfileKind::HandsOn, &d, &keyframes());
    // Assert：StepCard 块（帧图 + 说明 + 时间范围）
    let steps: Vec<&ArtifactBlock> = artifact.blocks.iter().filter(|b| b.kind == ArtifactKind::StepCard).collect();
    assert!(!steps.is_empty(), "实操档案应产出步骤卡");
    for s in steps {
        match &s.payload {
            BlockPayload::Step { image, description, start_ms, end_ms } => {
                assert!(image.ends_with(".webp"));
                assert!(!description.is_empty());
                assert!(end_ms >= start_ms);
            }
            _ => panic!("步骤卡载荷应为 Step"),
        }
        assert!(s.refs.frame_ms.is_some(), "步骤卡应引用帧时间戳");
    }
}

#[test]
fn hands_on_without_keyframes_falls_back_to_paragraphs() {
    // Arrange：无关键帧
    let d = detail(vec![("操作说明", 0, 3000)], vec![]);
    // Act
    let artifact = build_artifact(ProfileKind::HandsOn, &d, &[]);
    // Assert：段落兜底（不空产物）
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Paragraph));
}

#[test]
fn talking_head_template_produces_claims() {
    // Arrange：口播会话（重复短语触发重点）
    let d = detail(
        vec![
            ("重点是边界条件", 0, 5000),
            ("再强调一次重点是边界条件", 6000, 10000),
        ],
        vec![],
    );
    // Act
    let artifact = build_artifact(ProfileKind::TalkingHead, &d, &[]);
    // Assert：Claim 块
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Claim));
}

#[test]
fn talking_head_without_highlights_quotes() {
    // Arrange：无重复短语（无重点）→ Quote 兜底
    let d = detail(vec![("普通陈述内容", 0, 3000)], vec![]);
    // Act
    let artifact = build_artifact(ProfileKind::TalkingHead, &d, &[]);
    // Assert：Quote 块
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Quote));
}

#[test]
fn interview_template_produces_qa_pairs() {
    // Arrange：访谈会话（4 段交替）
    let d = detail(
        vec![
            ("你怎么看待 AI？", 0, 3000),
            ("我认为 AI 是工具", 4000, 7000),
            ("未来会怎样？", 8000, 11000),
            ("会越来越普及", 12000, 15000),
        ],
        vec![],
    );
    // Act
    let artifact = build_artifact(ProfileKind::Interview, &d, &[]);
    // Assert：QAPair 块（2 对）
    let qas = artifact.blocks.iter().filter(|b| b.kind == ArtifactKind::QAPair).count();
    assert_eq!(qas, 2);
}

#[test]
fn meeting_template_extracts_decisions_and_todos() {
    // Arrange：会议会话（含触发词）
    let d = detail(
        vec![
            ("我们决定下周二发布", 0, 3000),
            ("麻烦你整理会议纪要", 4000, 7000),
            ("截止日期是周五", 8000, 11000),
            ("讨论了一些细节", 12000, 15000),
        ],
        vec![],
    );
    // Act
    let artifact = build_artifact(ProfileKind::Meeting, &d, &keyframes());
    // Assert：Decision + Todo 块
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Decision));
    let todos = artifact.blocks.iter().filter(|b| b.kind == ArtifactKind::Todo).count();
    assert_eq!(todos, 2, "两处待办触发词");
    // 截图归档
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::ScreenShot));
}

#[test]
fn meeting_without_trigger_words_falls_back() {
    // Arrange：无触发词
    let d = detail(vec![("讨论了进度", 0, 3000)], vec![]);
    // Act
    let artifact = build_artifact(ProfileKind::Meeting, &d, &[]);
    // Assert：段落兜底
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Paragraph));
}

#[test]
fn empty_session_produces_minimal_artifact() {
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
        let artifact = build_artifact(kind, &d, &[]);
        // Assert：Lecture 产标题块（讲义式有标题）；其余空产物——均不崩溃
        if kind == ProfileKind::Lecture {
            assert_eq!(artifact.blocks.len(), 1, "讲义式空会话应只有标题块");
            assert_eq!(artifact.blocks[0].kind, ArtifactKind::Summary);
        } else {
            assert!(artifact.blocks.is_empty(), "{:?} 空会话应无产物块", kind);
        }
    }
}
