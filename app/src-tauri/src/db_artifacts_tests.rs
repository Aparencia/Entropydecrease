//! 会话产物数据层单测（REQ-052 / v0.5.0 M7）。
//!
//! @ai-context: AAA 模式；内存库隔离；覆盖落库 roundtrip/覆盖语义/读取防御。

use crate::artifact::{
    ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource, SessionArtifact,
};
use crate::db::Db;
use crate::types::NewSession;

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

fn artifact(session_id: i64) -> SessionArtifact {
    SessionArtifact {
        session_id,
        profile: "lecture".into(),
        blocks: vec![
            ArtifactBlock::new(ArtifactKind::Paragraph, 0, BlockPayload::Text("第一段".into())),
            ArtifactBlock {
                kind: ArtifactKind::KeyImage,
                refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(5000) },
                payload: BlockPayload::Image("full/5000.webp".into()),
                order: 1,
                source: BlockSource::Local,
                id: 0,
            },
            ArtifactBlock::new(ArtifactKind::Summary, 2, BlockPayload::Text("小结".into())),
        ],
    }
}

#[test]
fn replace_and_get_artifact_roundtrip() {
    // Arrange
    let db = mem_db();
    let session = db
        .create_session(&NewSession { title: "产物会话".into(), source_window: None, profile: Some("lecture".into()) })
        .unwrap();
    let artifact = artifact(session.id);
    // Act
    db.replace_artifact(&artifact).expect("save");
    let loaded = db.get_artifact(session.id).expect("load").expect("exists");
    // Assert：块数/顺序/字段完整（id 由 DB 回填，比较时忽略）
    assert_eq!(loaded.blocks.len(), 3);
    assert_eq!(loaded.blocks[0].kind, ArtifactKind::Paragraph);
    assert_eq!(loaded.blocks[0].order, 0);
    assert_eq!(loaded.blocks[1].refs.frame_ms, Some(5000));
    assert_eq!(loaded.blocks[2].kind, ArtifactKind::Summary);
    // 顺序升序
    for w in loaded.blocks.windows(2) {
        assert!(w[0].order < w[1].order);
    }
}

#[test]
fn replace_artifact_overwrites() {
    // Arrange：可重算语义——第二次构建覆盖旧产物
    let db = mem_db();
    let session = db.create_session(&NewSession { title: "x".into(), source_window: None, profile: None }).unwrap();
    let first = artifact(session.id);
    db.replace_artifact(&first).unwrap();
    // Act：第二次（少一块）
    let second = SessionArtifact {
        session_id: session.id,
        profile: "lecture".into(),
        blocks: vec![ArtifactBlock::new(ArtifactKind::Paragraph, 0, BlockPayload::Text("新版".into()))],
    };
    db.replace_artifact(&second).unwrap();
    // Assert：覆盖（1 块，非 3 块）
    let loaded = db.get_artifact(session.id).unwrap().unwrap();
    assert_eq!(loaded.blocks.len(), 1);
    assert_eq!(loaded.blocks[0].payload, BlockPayload::Text("新版".into()));
}

#[test]
fn get_artifact_none_when_empty() {
    // Arrange：无产物
    let db = mem_db();
    let session = db.create_session(&NewSession { title: "x".into(), source_window: None, profile: None }).unwrap();
    // Act/Assert：None（不报错）
    assert!(db.get_artifact(session.id).unwrap().is_none());
}

#[test]
fn delete_session_cascades_artifact() {
    // Arrange：产物随会话级联删除（外键）
    let db = mem_db();
    let session = db.create_session(&NewSession { title: "x".into(), source_window: None, profile: None }).unwrap();
    db.replace_artifact(&artifact(session.id)).unwrap();
    // Act
    db.delete_session(session.id).unwrap();
    // Assert：级联清理
    assert!(db.get_artifact(session.id).unwrap().is_none());
}

#[test]
fn empty_artifact_blocks_ok() {
    // Arrange：空块产物（模板可产出空）
    let db = mem_db();
    let session = db.create_session(&NewSession { title: "x".into(), source_window: None, profile: None }).unwrap();
    let empty = SessionArtifact { session_id: session.id, profile: "meeting".into(), blocks: Vec::new() };
    // Act
    db.replace_artifact(&empty).unwrap();
    // Assert：读取 None（空产物 = 无产物）
    assert!(db.get_artifact(session.id).unwrap().is_none());
}
