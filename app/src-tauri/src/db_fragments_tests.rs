//! db_fragments 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::db_fragments::NewFragment;
use crate::types::NewNoteGroup;
/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 碎片入参助手。
fn frag(text: &str, domain: Option<&str>, group_id: Option<i64>) -> NewFragment {
    NewFragment {
        text: text.to_string(),
        image_path: None,
        domain_tag: domain.map(|d| d.to_string()),
        group_id,
        source: "manual".to_string(),
    }
}

#[test]
fn create_and_list_roundtrip() {
    // Arrange
    let db = mem_db();
    db.create_fragment(&frag("眼影晕染技巧", Some("beauty"), None)).expect("c1");
    db.create_fragment(&frag("第二条碎片", None, None)).expect("c2");
    // Act
    let all = db.list_fragments(None, 100).expect("list");
    // Assert：倒序（最新在前）且字段完整
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].text, "第二条碎片");
    assert_eq!(all[1].domain_tag.as_deref(), Some("beauty"));
    assert_eq!(all[1].status, "active");
}

#[test]
fn list_by_group_only_active() {
    // Arrange：组内两条——一条归档
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "化妆美妆".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f1 = db.create_fragment(&frag("活跃碎片", Some("beauty"), Some(group.id))).expect("f1");
    let f2 = db.create_fragment(&frag("将归档碎片", Some("beauty"), Some(group.id))).expect("f2");
    db.set_fragment_status(f2.id, "archived").expect("archive");
    // Act
    let active = db.list_fragments_by_group(group.id).expect("list");
    // Assert：归档项不进学习循环
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].id, f1.id);
}

#[test]
fn count_by_group_and_status() {
    // Arrange：先建组（fragments.group_id 外键约束）
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "计数组".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    db.create_fragment(&frag("a", None, Some(group.id))).expect("a");
    db.create_fragment(&frag("b", None, Some(group.id))).expect("b");
    db.create_fragment(&frag("c", None, None)).expect("c");
    // Act/Assert：各口径计数正确
    assert_eq!(db.count_fragments(None, None).expect("all"), 3);
    assert_eq!(db.count_fragments(Some(group.id), None).expect("g1"), 2);
    assert_eq!(db.count_fragments(Some(group.id), Some("active")).expect("g1a"), 2);
    assert_eq!(db.count_fragments(Some(group.id), Some("archived")).expect("g1arch"), 0);
}

#[test]
fn move_fragment_between_groups() {
    // Arrange
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "目标组".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("fitness".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f = db.create_fragment(&frag("待移动", None, None)).expect("f");
    // Act
    db.update_fragment_group(f.id, Some(group.id)).expect("move");
    db.update_fragment_group(f.id, None).expect("ungroup");
    // Assert
    let fetched = db.list_fragments(None, 10).expect("list");
    assert_eq!(fetched[0].group_id, None);
}

#[test]
fn delete_group_keeps_fragments() {
    // Arrange：删组只断关联（碎片是用户资产，同笔记口径）
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "将删".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f = db.create_fragment(&frag("幸存", None, Some(group.id))).expect("f");
    // Act
    db.with_conn(|conn| {
        conn.execute("DELETE FROM note_groups WHERE id = ?1", rusqlite::params![group.id])
            .map_err(Into::into)
    })
    .expect("delete");
    // Assert
    let fetched = db.list_fragments(None, 10).expect("list");
    assert_eq!(fetched.len(), 1);
    assert_eq!(fetched[0].id, f.id);
    assert_eq!(fetched[0].group_id, None);
}

#[test]
fn delete_fragment_removes_and_detaches_cards() {
    // Arrange：碎片 + 绑定卡（fragment_id 外键）
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "消费组".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f = db.create_fragment(&frag("待删碎片", None, Some(group.id))).expect("f");
    let card = db
        .create_card(&crate::db_flashcards::NewFlashcard {
            group_id: group.id,
            note_id: None,
            fragment_id: Some(f.id),
            front: "线索".to_string(),
            back: "验证".to_string(),
            kind: "fact".to_string(),
            state_json: "{}".to_string(),
            due_at: 0,
        })
        .expect("card");
    // Act：真删碎片
    assert!(db.delete_fragment(f.id).expect("delete"));
    // Assert：碎片消失；卡保留且 fragment_id 解绑（SET NULL——卡是独立资产）
    assert!(db.get_fragment(f.id).expect("get").is_none());
    let fetched = db.get_card(card.id).expect("get").expect("卡应保留");
    assert_eq!(fetched.fragment_id, None);
}

#[test]
fn get_fragment_roundtrip_and_missing() {
    // Arrange
    let db = mem_db();
    let f = db.create_fragment(&frag("可查碎片", None, None)).expect("f");
    // Act/Assert：存在返回完整记录；不存在返回 None
    let got = db.get_fragment(f.id).expect("get").expect("应存在");
    assert_eq!(got.text, "可查碎片");
    assert_eq!(got.status, "active");
    assert!(db.get_fragment(9999).expect("get").is_none());
}

#[test]
fn delete_missing_fragment_returns_false() {
    // Arrange/Act/Assert：删不存在的碎片诚实返回 false（不报错不panic）
    let db = mem_db();
    assert!(!db.delete_fragment(9999).expect("delete"));
}

#[test]
fn promote_fragment_to_note_creates_note_and_deletes_fragment() {
    // Arrange
    let db = mem_db();
    let f = db.create_fragment(&frag("碎片文本：眼影要晕染", None, None)).expect("f");
    // Act：升为未归组笔记
    let note = db.promote_fragment_to_note(std::path::Path::new("."), f.id, "眼影晕染", None).expect("promote");
    // Assert：笔记成立（正文=碎片文本、source=manual、未归组）；碎片已删
    assert_eq!(note.content, "碎片文本：眼影要晕染");
    assert_eq!(note.source, "manual");
    assert_eq!(note.group_id, None);
    assert!(db.get_fragment(f.id).expect("get").is_none());
    let fetched = db.get_note(note.id).expect("get").expect("note 应存在");
    assert_eq!(fetched.content, "碎片文本：眼影要晕染");
}

#[test]
fn promote_fragment_copies_image_and_embeds_ref() {
    // Arrange：临时目录伪造碎片图（promote 只做 fs::copy，字节内容无关）
    let dir = std::env::temp_dir().join(format!("dsh_promote_img_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("fragments")).expect("dir");
    std::fs::write(dir.join("fragments").join("1-abc.png"), b"fake").expect("img");
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "目标组".to_string(),
            terrain: "container".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f = db
        .create_fragment(&NewFragment {
            text: "带图碎片".to_string(),
            image_path: Some("fragments/1-abc.png".to_string()),
            domain_tag: None,
            group_id: Some(group.id),
            source: "manual".to_string(),
        })
        .expect("f");
    // Act：升入指定组
    let note = db
        .promote_fragment_to_note(&dir, f.id, "带图笔记", Some(group.id))
        .expect("promote");
    // Assert：图片已搬运入 notes-images/{nid}/ 且正文含引用；碎片已删；归组生效
    let img_ref = format!("![](notes-images/{}/1-abc.png)", note.id);
    assert!(note.content.contains(&img_ref), "正文应含图片引用: {}", note.content);
    assert!(dir.join("notes-images").join(note.id.to_string()).join("1-abc.png").is_file());
    assert_eq!(note.group_id, Some(group.id));
    assert!(db.get_fragment(f.id).expect("get").is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn promote_fragment_image_missing_degrades_to_text() {
    // Arrange：碎片记录引用不存在图片（外部清理等）
    let db = mem_db();
    let f = db
        .create_fragment(&NewFragment {
            text: "图丢了也要升".to_string(),
            image_path: Some("fragments/ghost.png".to_string()),
            domain_tag: None,
            group_id: None,
            source: "manual".to_string(),
        })
        .expect("f");
    // Act：升笔记（临时目录无 fragments/ghost.png）
    let note = db
        .promote_fragment_to_note(&std::env::temp_dir(), f.id, "降级笔记", None)
        .expect("promote");
    // Assert：图片缺失降级纯文本（碎片文本不丢——诚实降级纪律）
    assert_eq!(note.content, "图丢了也要升");
    assert!(db.get_fragment(f.id).expect("get").is_none());
}

#[test]
fn promote_fragment_missing_returns_error() {
    // Arrange/Act/Assert：升不存在的碎片返回明确错误（不 panic 不静默）
    let db = mem_db();
    let err = db
        .promote_fragment_to_note(std::path::Path::new("."), 99999, "标题", None)
        .expect_err("应报错");
    assert!(err.to_string().contains("碎片不存在"));
}
