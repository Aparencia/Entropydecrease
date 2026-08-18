//! 产物块模型单测（REQ-052 / v0.5.0 M7）。
//!
//! @ai-context: AAA 模式；块模型 roundtrip（JSON 序列化/反序列化无损）、
//!              载荷/来源/引用字段契约。

use super::*;

#[test]
fn block_json_roundtrip_preserves_all_fields() {
    // Arrange：各载荷类型块
    let blocks = vec![
        ArtifactBlock::new(ArtifactKind::Paragraph, 0, BlockPayload::Text("段落内容".into())),
        ArtifactBlock::new(ArtifactKind::KeyImage, 1, BlockPayload::Image("full/1000.webp".into())),
        ArtifactBlock {
            kind: ArtifactKind::Table,
            refs: BlockRefs { segment_id: Some(3), ocr_block_id: Some(7), frame_ms: Some(5000) },
            payload: BlockPayload::Table(TableBlock {
                markdown: "|A|B|\n|---|---|\n|1|2|".into(),
                structure_confidence: 0.9,
                cell_refs: vec![(0, 0, "A".into())],
            }),
            order: 2,
            source: BlockSource::Local,
            id: 42,
        },
        ArtifactBlock::new(ArtifactKind::Formula, 3, BlockPayload::Formula(FormulaBlock {
            latex: "x^2".into(),
            source_text: "x2".into(),
            confidence: 0.9,
        })),
        ArtifactBlock::new(
            ArtifactKind::TermAnchor,
            4,
            BlockPayload::Term { term: "熵".into(), definition: Some("系统无序度".into()) },
        ),
        ArtifactBlock::new(
            ArtifactKind::StepCard,
            5,
            BlockPayload::Step {
                image: "full/2000.webp".into(),
                description: "第一步".into(),
                start_ms: 1000,
                end_ms: 5000,
            },
        ),
        ArtifactBlock::new(
            ArtifactKind::QAPair,
            6,
            BlockPayload::QA { question: "什么是 X？".into(), answer: "X 是…".into() },
        ),
        ArtifactBlock::new(
            ArtifactKind::CodeBlock,
            7,
            BlockPayload::Code { code: "let x = 1;".into(), language: Some("rust".into()) },
        ),
    ];
    // Act：逐个 roundtrip
    for b in &blocks {
        let raw = serde_json::to_string(b).expect("serialize");
        let back: ArtifactBlock = serde_json::from_str(&raw).expect("deserialize");
        // Assert：无损
        assert_eq!(back, *b, "块 {:?} roundtrip 必须无损", b.kind);
    }
}

#[test]
fn session_artifact_roundtrip() {
    // Arrange
    let artifact = SessionArtifact {
        session_id: 9,
        profile: "lecture".into(),
        blocks: vec![
            ArtifactBlock::new(ArtifactKind::Summary, 0, BlockPayload::Text("小结".into())),
            ArtifactBlock::new(ArtifactKind::Paragraph, 1, BlockPayload::Text("正文".into())),
        ],
    };
    // Act
    let raw = serde_json::to_string(&artifact).unwrap();
    let back: SessionArtifact = serde_json::from_str(&raw).unwrap();
    // Assert
    assert_eq!(back, artifact);
}

#[test]
fn block_source_variants_serialize() {
    // Act：三种来源序列化
    for (source, expect) in [
        (BlockSource::Local, "local"),
        (BlockSource::AiEnhanced, "ai-enhanced"),
        (BlockSource::Placeholder, "placeholder"),
    ] {
        let b = ArtifactBlock { source, ..ArtifactBlock::new(ArtifactKind::Paragraph, 0, BlockPayload::Text("x".into())) };
        let raw = serde_json::to_string(&b).unwrap();
        // Assert：来源永远可辨认（kebab-case 契约）
        assert!(raw.contains(&format!("\"source\":\"{}\"", expect)), "{}", raw);
    }
}

#[test]
fn block_kind_serializes_kebab_case() {
    // Act：QAPair → qa-pair（kebab-case）
    let b = ArtifactBlock::new(ArtifactKind::QAPair, 0, BlockPayload::Text("x".into()));
    let raw = serde_json::to_string(&b).unwrap();
    // Assert
    eprintln!("serialized: {}", raw);
    assert!(raw.contains("\"kind\":\"qa-pair\""), "actual: {}", raw);
}

#[test]
fn block_refs_partial_fill() {
    // Arrange：仅 frame_ms（图片块典型引用）
    let b = ArtifactBlock {
        refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(12345) },
        ..ArtifactBlock::new(ArtifactKind::KeyImage, 0, BlockPayload::Image("f".into()))
    };
    // Act
    let raw = serde_json::to_string(&b).unwrap();
    let back: ArtifactBlock = serde_json::from_str(&raw).unwrap();
    // Assert：None 字段保留缺省（serde 默认）
    assert_eq!(back.refs.frame_ms, Some(12345));
    assert_eq!(back.refs.segment_id, None);
}
