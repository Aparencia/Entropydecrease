//! db_notes_versions.rs / db_ai_usage.rs 单测（AAA 模式；内存库隔离——
//! 不触碰真实数据文件，AGENTS.md §7 测试隔离铁律）。
//!
//! @ai-context: 覆盖：惰性首快照（旧数据迁移兼容）、versioned 写链
//!              （rule 基快照 + ai-refine 新版本）、回滚不破坏历史链、
//!              50 版上限合并（merged_from 摘要）、成本记录 roundtrip。

use crate::db::Db;
use crate::db_ai_usage::AiUsageRecord;
use crate::db_notes_versions::NoteVersion;
use crate::note_version::{NoteVersionSource, VersionMeta, VERSIONS_LIMIT};
use crate::types::NewNote;

fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

fn create_note(db: &Db, content: &str) -> i64 {
    db.create_note(&NewNote {
        title: "测试笔记".to_string(),
        content: content.to_string(),
        source: "manual".to_string(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
    })
    .expect("建笔记")
    .id
}

#[test]
fn first_snapshot_lazily_created() {
    // 旧数据迁移兼容：无版本笔记首次读列表 → 首快照 = 当前内容（source=rule）
    let db = mem_db();
    let id = create_note(&db, "初始内容");
    let versions = db.list_versions(id).expect("列表");
    assert_eq!(versions.len(), 1);
    assert_eq!(versions[0].content, "初始内容");
    assert_eq!(versions[0].source, NoteVersionSource::Rule);
    assert_eq!(versions[0].parent_id, None);
}

#[test]
fn versioned_save_builds_chain() {
    // 统一写路径：首快照(rule, 变更前) + 新版本(ai-refine)——notes.content 同步
    let db = mem_db();
    let id = create_note(&db, "规则版内容");
    let v = db
        .versioned_save(id, "精修版内容", NoteVersionSource::AiRefine, &VersionMeta::default())
        .expect("保存");
    assert_eq!(v.source, NoteVersionSource::AiRefine);
    let versions = db.list_versions(id).expect("列表");
    assert_eq!(versions.len(), 2);
    assert_eq!(versions[0].content, "规则版内容", "首快照=变更前");
    assert_eq!(versions[0].source, NoteVersionSource::Rule);
    assert_eq!(versions[1].content, "精修版内容");
    assert_eq!(versions[1].parent_id, Some(versions[0].id), "parent 链");
    assert_eq!(db.get_note(id).unwrap().unwrap().content, "精修版内容");
}

#[test]
fn rollback_preserves_history() {
    // 回滚=新版本（user_edit，content=目标版本）——线性链（git-like：
    // 每个新版本 parent=最新版本，不破坏历史链；规划"parent=目标版本"
    // 会制造分叉与"线性历史"矛盾，实施取线性语义，见 v0.8.0.md M4 注记）
    let db = mem_db();
    let id = create_note(&db, "v1");
    db.versioned_save(id, "v2", NoteVersionSource::AiRefine, &VersionMeta::default()).unwrap();
    let versions = db.list_versions(id).unwrap();
    let target = versions[0].id; // 回滚到 v1（规则版）
    db.rollback_to(id, target).expect("回滚");
    let versions = db.list_versions(id).unwrap();
    assert_eq!(versions.len(), 3, "回滚不破坏历史链");
    assert_eq!(versions[2].source, NoteVersionSource::UserEdit);
    assert_eq!(versions[2].parent_id, Some(versions[1].id), "线性链：parent=最新版本");
    assert_eq!(versions[2].content, "v1", "回滚后内容=目标版本");
    assert_eq!(db.get_note(id).unwrap().unwrap().content, "v1");
}

#[test]
fn versions_capped_at_limit_with_merge_summary() {
    // 50 版上限：超限合并最旧两版——条数不超限 + 次旧 meta 带 merged_from 摘要
    let db = mem_db();
    let id = create_note(&db, "base");
    for i in 0..(VERSIONS_LIMIT + 5) {
        db.versioned_save(
            id,
            &format!("内容{}", i),
            NoteVersionSource::UserEdit,
            &VersionMeta {
                cost_yuan: Some(i as f64 / 100.0),
                ..VersionMeta::default()
            },
        )
        .unwrap();
    }
    let versions = db.list_versions(id).unwrap();
    assert!(versions.len() <= VERSIONS_LIMIT, "条数不超限: {}", versions.len());
    // 合并后最早版本带 merged_from 摘要（meta 不丢）
    let earliest = &versions[0];
    assert!(earliest.meta.merged_from.is_some(), "合并摘要存在");
}

#[test]
fn usage_record_roundtrip() {
    let db = mem_db();
    let id = create_note(&db, "x");
    let rec = db
        .record_ai_usage(
            id,
            &crate::db_ai_usage::AiUsageInput {
                op_type: "refine",
                tokens_in: 1000,
                tokens_out: 900,
                cost_yuan: 0.01,
                model: "m-1".to_string(),
                slices: 2,
            },
        )
        .expect("落库");
    assert_eq!(rec.op_type, "refine");
    let list = db.list_ai_usage(id).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].tokens_in, 1000);
    assert_eq!(list[0].model, "m-1");
    // 其他笔记互不干扰
    let id2 = create_note(&db, "y");
    assert!(db.list_ai_usage(id2).unwrap().is_empty());
    let _: AiUsageRecord = rec; // 类型引用守卫
    let _: NoteVersion = NoteVersion {
        id: 1,
        note_id: 1,
        content: String::new(),
        source: NoteVersionSource::Rule,
        parent_id: None,
        created_at: 0,
        meta: VersionMeta::default(),
    };
}

#[test]
fn versioned_save_rejects_missing_note() {
    let db = mem_db();
    assert!(db.versioned_save(999, "x", NoteVersionSource::UserEdit, &VersionMeta::default()).is_err());
}
