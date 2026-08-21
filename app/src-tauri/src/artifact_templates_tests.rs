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
            bbox: None,
            screen_id: None,
        })
        .collect();
    SessionDetail { session, segments, ocr_blocks, events: Vec::new(), screens: Vec::new() }
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
            BlockPayload::Step { image, description, start_ms, end_ms, .. } => {
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
        ProfileKind::Podcast,
        ProfileKind::Live,
        ProfileKind::Whiteboard,
        ProfileKind::GameTutorial,
        ProfileKind::Exercise,
        ProfileKind::FollowAlong,
        ProfileKind::Coding,
        ProfileKind::Unknown,
    ] {
        let artifact = build_artifact(kind, &d, &[]);
        // Assert：讲义式模板（网课/白板/题目/编程/未知）产标题块；其余空产物——均不崩溃
        let title_only = matches!(
            kind,
            ProfileKind::Lecture
                | ProfileKind::Whiteboard
                | ProfileKind::Exercise
                | ProfileKind::Coding
                | ProfileKind::Unknown
        );
        if title_only {
            assert_eq!(artifact.blocks.len(), 1, "{:?} 讲义式空会话应只有标题块", kind);
            assert_eq!(artifact.blocks[0].kind, ArtifactKind::Summary);
        } else {
            assert!(artifact.blocks.is_empty(), "{:?} 空会话应无产物块", kind);
        }
    }
}

// ── v0.7.0 M2：REQ-121 代码块 / REQ-123 步骤图卡 ──

#[test]
fn coding_template_produces_code_blocks_from_code_frames() {
    // Arrange：相邻 code 帧（跨帧共享边界行 + 真实代码内重复行）
    let d = detail(vec![], vec![]);
    let analysis = analyze_session(&d, ProfileKind::Coding);
    let frames = vec![
        CodeFrame { timestamp_ms: 1000, text: "def add(a, b):\n    return a + b".into() },
        CodeFrame { timestamp_ms: 3000, text: "    return a + b\nprint(add(1, 2))".into() },
    ];
    // Act
    let blocks = code_blocks(&d, &analysis, &frames);
    // Assert：单代码块（同一展示段）；跨帧相邻重复行去重；时间范围=首末帧
    assert_eq!(blocks.len(), 1, "相邻帧应合并为一个代码块");
    let b = &blocks[0];
    assert_eq!(b.kind, ArtifactKind::CodeBlock);
    assert_eq!(b.refs.frame_ms, Some(1000));
    match &b.payload {
        BlockPayload::Code { code, language, time_ms, end_ms } => {
            assert_eq!(code, "def add(a, b):\n    return a + b\nprint(add(1, 2))");
            assert_eq!(language.as_deref(), Some("python"));
            assert_eq!(*time_ms, Some(1000));
            assert_eq!(*end_ms, Some(3000));
        }
        _ => panic!("代码块载荷应为 Code"),
    }
}

#[test]
fn code_blocks_split_runs_by_time_gap() {
    // Arrange：两个展示段（gap 15s > 10s 切段阈值）
    let d = detail(vec![], vec![]);
    let analysis = analyze_session(&d, ProfileKind::Coding);
    let frames = vec![
        CodeFrame { timestamp_ms: 1000, text: "let x = 1;".into() },
        CodeFrame { timestamp_ms: 16000, text: "let y = 2;".into() },
    ];
    // Act
    let blocks = code_blocks(&d, &analysis, &frames);
    // Assert：两代码块（各含时间范围）
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].refs.frame_ms, Some(1000));
    assert_eq!(blocks[1].refs.frame_ms, Some(16000));
}

#[test]
fn code_blocks_empty_frames_honest_degradation() {
    // Arrange：无 code 帧
    let d = detail(vec![], vec![]);
    let analysis = analyze_session(&d, ProfileKind::Coding);
    // Act/Assert：空产物（诚实降级——不产空代码块）
    assert!(code_blocks(&d, &analysis, &[]).is_empty());
}

#[test]
fn coding_build_artifact_skips_code_when_no_code_frames() {
    // Arrange：无 code 区 OCR 块（普通网课式会话）
    let d = detail(vec![("变量定义", 0, 5000)], vec![("标题", 1000)]);
    // Act：编程档案构建
    let artifact = build_artifact(ProfileKind::Coding, &d, &[]);
    // Assert：无 CodeBlock 块（诚实降级），讲义段落仍产出
    assert!(!artifact.blocks.iter().any(|b| b.kind == ArtifactKind::CodeBlock));
    assert!(artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Paragraph));
}

#[test]
fn follow_along_template_produces_step_cards_from_boundaries() {
    // Arrange：跟练会话——口令段（步骤边界信号）
    let d = detail(
        vec![
            ("第一组动作开始", 0, 3000),
            ("第二组跟上节奏", 10000, 13000),
        ],
        vec![],
    );
    // Act：跟练档案构建
    let artifact = build_artifact(ProfileKind::FollowAlong, &d, &[]);
    // Assert：步骤图卡——每个边界一个 StepCard（refs.frame_ms=time_ms；
    //         本版有卡无图 image 空串；label/reason 填充）
    let steps: Vec<&ArtifactBlock> = artifact.blocks.iter().filter(|b| b.kind == ArtifactKind::StepCard).collect();
    assert!(!steps.is_empty(), "跟练档案应产出步骤图卡");
    for s in &steps {
        match &s.payload {
            BlockPayload::Step { image, description, start_ms, end_ms, label, reason } => {
                assert!(image.is_empty(), "本版有卡无图（M3 图注后配图）");
                assert!(!description.is_empty());
                assert_eq!(start_ms, end_ms, "边界点时间范围");
                assert!(label.is_some(), "步骤边界应带标签");
                assert!(reason.is_some(), "步骤边界应带理由");
            }
            _ => panic!("步骤图卡载荷应为 Step"),
        }
        assert!(s.refs.frame_ms.is_some(), "步骤图卡应引用边界时刻");
    }
    // 口令边界 → 标签=口令原文
    assert!(steps.iter().any(|s| matches!(&s.payload, BlockPayload::Step { label: Some(l), .. } if l == "第一组")));
}

// ── v0.9.0 M5（REQ-193）：叙事结构模板变体 ──

/// 会话 33 类故事化科普会话（小马买房公积金知识）。
fn storytelling_detail() -> SessionDetail {
    detail(
        vec![
            ("小马工作几年存了一点钱", 0, 3000),
            ("有一天，小马想买房了", 3000, 6000),
            ("后来小马了解到公积金贷款利息低", 6000, 10000),
            ("1、公积金贷款利息低", 10000, 13000),
            ("2、其他情况可以取出", 13000, 16000),
            ("于是小马决定用公积金贷款", 16000, 20000),
        ],
        vec![("要点：公积金贷款", 7000)],
    )
}

#[test]
fn storytelling_科普_produces_narrative_line_and_points() {
    // Arrange：故事化科普会话（会话 33 归属——口播/解说档案）
    let d = storytelling_detail();
    // Act：口播档案构建产物（叙事变体路径）
    let artifact = build_artifact(ProfileKind::TalkingHead, &d, &[]);
    // Assert：叙事线段落（含角色段保序）+ 要点 Highlight
    let paras: Vec<&ArtifactBlock> = artifact.blocks.iter().filter(|b| b.kind == ArtifactKind::Paragraph).collect();
    let points: Vec<&ArtifactBlock> = artifact.blocks.iter().filter(|b| b.kind == ArtifactKind::Highlight).collect();
    assert!(!paras.is_empty(), "故事化科普应产出叙事线段落");
    assert!(paras.iter().any(|b| matches!(&b.payload, BlockPayload::Text(t) if t.contains("小马"))), "叙事线含角色段");
    assert!(!points.is_empty(), "故事化科普应产出结构化要点");
    assert!(points.iter().any(|b| matches!(&b.payload, BlockPayload::Text(t) if t.contains("1、公积金贷款利息低"))), "要点提取命中编号段");
}

#[test]
fn direct_teaching_模板_零回归() {
    // Arrange：直接教学会话（无故事化特征——现有路径）
    let d = detail(
        vec![
            ("微积分的核心概念是极限", 0, 5000),
            ("极限的定义如下", 6000, 10000),
            ("连续函数满足三个条件", 11000, 15000),
        ],
        vec![("板书：极限定义", 1000)],
    );
    // Act：口播档案构建（直接教学路径——现有摘要模板）
    let artifact = build_artifact(ProfileKind::TalkingHead, &d, &[]);
    // Assert：零回归——无叙事线段落（走 Claim/Quote 现有路径）
    assert!(!artifact.blocks.iter().any(|b| b.kind == ArtifactKind::Paragraph), "直接教学不产叙事线段落");
    // 兜底 Quote 或 Claim 至少存在（现有摘要语义）
    assert!(
        artifact.blocks.iter().any(|b| matches!(b.kind, ArtifactKind::Quote | ArtifactKind::Claim)),
        "直接教学走现有摘要路径"
    );
}
