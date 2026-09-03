//! kb_search 单测（混合检索语义——trigram 子串/2 字 LIKE/双引擎 AND/溯源字段）。

use crate::db::Db;
use crate::db_fragments::NewFragment;
use crate::types::NewNote;

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

fn make_note(title: &str, content: &str) -> NewNote {
    NewNote {
        title: title.into(),
        content: content.into(),
        source: "manual".into(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: None,
    }
}

#[test]
fn empty_query_and_stopword_query_return_empty() {
    // Arrange
    let db = mem_db();
    db.create_note(&make_note("配色", "配色是基础。")).unwrap();
    // Act/Assert
    assert!(db.kb_search("  ", 10).unwrap().is_empty());
    assert!(db.kb_search("你在吗", 10).unwrap().is_empty(), "全停用词诚实空结果");
}

#[test]
fn two_char_chinese_uses_like_substring() {
    // Arrange：2 字词 trigram 无法索引 → LIKE 子串通道
    let db = mem_db();
    db.create_note(&make_note("配色入门", "配色的三种基础手法。")).unwrap();
    db.create_note(&make_note("无关", "讲的是别的主题内容。")).unwrap();
    // Act
    let hits = db.kb_search("配色", 10).unwrap();
    // Assert
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].note_title.as_deref(), Some("配色入门"));
    assert_eq!(hits[0].score_kind, "like");
    assert!(hits[0].snippet.contains("==配色=="), "snippet={}", hits[0].snippet);
}

#[test]
fn chinese_phrase_trigram_substring_hits() {
    // Arrange：4 字短语——trigram 子串匹配（笔记含"晕染手法的运用"）
    let db = mem_db();
    db.create_note(&make_note("眼妆", "# 眼影晕染\n\n晕染手法的运用要点。")).unwrap();
    // Act
    let hits = db.kb_search("晕染手法", 10).unwrap();
    // Assert
    assert_eq!(hits.len(), 1, "短语命中");
    assert_eq!(hits[0].score_kind, "fts");
    assert_eq!(hits[0].heading.as_deref(), Some("眼影晕染"), "节标题溯源");
    assert!(hits[0].snippet.contains("==晕染手法=="));
}

#[test]
fn ascii_words_match_case_insensitive() {
    // Arrange
    let db = mem_db();
    db.create_note(&make_note("css", "Learn Canvas Layout basics here.")).unwrap();
    db.create_note(&make_note("other", "no relevant words.")).unwrap();
    // Act（大小写混写查询——两词各自成词命中）
    let hits = db.kb_search("canvas layout", 10).unwrap();
    // Assert
    assert_eq!(hits.len(), 1);
    assert!(
        hits[0].snippet.contains("==Canvas==") && hits[0].snippet.contains("==Layout=="),
        "snippet={}",
        hits[0].snippet
    );
}

#[test]
fn heading_words_are_searchable() {
    // Arrange：标题行在 chunk 文本内（heading-aware 切块保留行首）
    let db = mem_db();
    db.create_note(&make_note("色彩", "# 第二章 色彩搭配\n\n正文不限标题。")).unwrap();
    // Act：整段标题短语为查询（trigram 命中标题行；heading 字段=去 '#' 全文本）
    let hits = db.kb_search("第二章 色彩搭配", 10).unwrap();
    // Assert
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].heading.as_deref(), Some("第二章 色彩搭配"));
}

#[test]
fn group_name_and_fragment_fields_surface() {
    // Arrange：笔记归组 + 碎片入块
    let db = mem_db();
    let gid: i64 = db
        .with_conn(|c| {
            c.execute(
                "INSERT INTO note_groups (name, terrain, kind, created_at, updated_at)
                 VALUES ('化妆课', 'container', 'course', 1, 1)",
                [],
            )?;
            Ok(c.last_insert_rowid())
        })
        .expect("group");
    let note = db.create_note(&make_note("眼影", "眼影晕染的层次。")).unwrap();
    db.update_note_group(note.id, Some(gid)).unwrap();
    db.create_fragment(&NewFragment {
        text: "灵感碎片：高光的点法。".into(),
        image_path: None,
        domain_tag: None,
        group_id: Some(gid),
        source: "manual".into(),
    })
    .unwrap();
    // Act：查笔记命中（组名溯源）
    let hits = db.kb_search("眼影晕染", 10).unwrap();
    let note_hit = hits.iter().find(|h| h.source_kind == "note").expect("note hit");
    assert_eq!(note_hit.group_name.as_deref(), Some("化妆课"));
    assert_eq!(note_hit.note_id, Some(note.id));
    // Act：查碎片命中（无标题字段——前端降级文案）
    let hits = db.kb_search("灵感碎片", 10).unwrap();
    let frag_hit = hits.iter().find(|h| h.source_kind == "fragment").expect("frag hit");
    assert_eq!(frag_hit.note_title, None);
    assert_eq!(frag_hit.group_name.as_deref(), Some("化妆课"), "碎片组名溯源");
    assert!(frag_hit.fragment_id.is_some());
}

#[test]
fn fts_and_like_engines_combine_with_and() {
    // Arrange：CSS(fts) + 布局(like 2 字) 双引擎 AND——两篇只中一
    // （夹具注意：b 正文不得含"布局"二字——审查修正原夹具误含"布局二字"致双中）
    let db = mem_db();
    db.create_note(&make_note("a", "CSS 布局教程内容。")).unwrap();
    db.create_note(&make_note("b", "CSS 教程只讲网格与配色。")).unwrap();
    // Act
    let hits = db.kb_search("CSS 布局", 10).unwrap();
    // Assert
    assert_eq!(hits.len(), 1, "双引擎 AND——仅同时满足者命中");
    assert_eq!(hits[0].note_title.as_deref(), Some("a"));
}

#[test]
fn quoted_two_char_word_hits_like_db() {
    // Arrange（审查 M1 端到端）：带引号 "配色" 与不带引号行为一致——LIKE 命中
    let db = mem_db();
    db.create_note(&make_note("配色", "配色是配色的基础。")).unwrap();
    // Act
    let hits = db.kb_search("\"配色\"", 10).unwrap();
    // Assert
    assert_eq!(hits.len(), 1, "剥引号后 2 字走 LIKE——不再静默零命中");
    assert_eq!(hits[0].score_kind, "like");
    assert!(hits[0].snippet.contains("==配色=="), "snippet={}", hits[0].snippet);
}

#[test]
fn no_match_returns_empty_not_error() {
    // Arrange
    let db = mem_db();
    db.create_note(&make_note("x", "任意内容。")).unwrap();
    // Act/Assert（长 ASCII 无命中——fts 通道空结果）
    assert!(db.kb_search("qqqzzzxxxvvv", 10).unwrap().is_empty());
}

#[test]
fn limit_is_honored_and_clamped() {
    // Arrange：四篇可命中笔记
    let db = mem_db();
    for i in 0..4 {
        db.create_note(&make_note(&format!("n{}", i), &format!("配色技巧{}。", i))).unwrap();
    }
    // Act
    assert_eq!(db.kb_search("配色技巧", 2).unwrap().len(), 2);
    assert_eq!(db.kb_search("配色技巧", 100).unwrap().len(), 4, "上限钳制");
}

#[test]
fn long_note_chunking_keeps_search_across_sections() {
    // Arrange：800+ 字符长节后再加尾节——跨块检索正常（切块不吞内容）
    let db = mem_db();
    let long: String = "填".repeat(850);
    let note = db.create_note(&make_note("长文", "")).unwrap();
    db.update_note(
        note.id,
        "长文",
        &format!("# 长节\n\n{}\n\n# 尾节\n\n目标词目标词", long),
    )
    .unwrap();
    // Act
    let hits = db.kb_search("目标词", 10).unwrap();
    // Assert（3 字短语 → trigram——尾节块命中且节标题溯源）
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].heading.as_deref(), Some("尾节"));
    assert!(hits[0].snippet.contains("==目标词=="));
}
