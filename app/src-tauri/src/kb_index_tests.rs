//! kb_index/kb_reindex 单测（影子表双写 + 生命周期钩子 + 重建/统计）。

use std::path::Path;

use crate::db::Db;
use crate::db_fragments::NewFragment;
use crate::kb_reindex::KbIndexStats;
use crate::note_version::{NoteVersionSource, VersionMeta};
use crate::types::NewNote;

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

fn make_note(content: &str) -> NewNote {
    NewNote {
        title: "测试笔记".into(),
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

fn make_fragment(text: &str) -> NewFragment {
    NewFragment {
        text: text.into(),
        image_path: None,
        domain_tag: None,
        group_id: None,
        source: "manual".into(),
    }
}

/// 数 kb_chunks 行（kind 过滤；None=全部）。
fn count_chunks(db: &Db, kind: Option<&str>) -> i64 {
    db.with_conn(|c| {
        let sql = match kind {
            Some(k) => format!("SELECT COUNT(*) FROM kb_chunks WHERE source_kind='{}'", k),
            None => "SELECT COUNT(*) FROM kb_chunks".to_string(),
        };
        Ok(c.query_row(&sql, [], |r| r.get::<_, i64>(0))?)
    })
    .expect("count chunks")
}

fn count_fts(db: &Db) -> i64 {
    db.with_conn(|c| Ok(c.query_row("SELECT COUNT(*) FROM kb_fts", [], |r| r.get::<_, i64>(0))?))
        .expect("count fts")
}

/// 取单块 (heading, text)。
fn chunk_heading_text(db: &Db, note_id: i64, ord: i64) -> (Option<String>, String) {
    db.with_conn(|c| {
        Ok(c.query_row(
            "SELECT heading, text FROM kb_chunks WHERE note_id=?1 AND ord=?2",
            rusqlite::params![note_id, ord],
            |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
        )?)
    })
    .expect("chunk row")
}

#[test]
fn create_note_indexes_content_with_headings() {
    // Arrange
    let db = mem_db();
    let new = make_note("# 第一章\n\n正文一。\n\n# 第二章\n\n正文二。");
    // Act
    let note = db.create_note(&new).expect("create");
    // Assert
    assert_eq!(count_chunks(&db, None), 2, "两节两块");
    assert_eq!(count_chunks(&db, None), count_fts(&db), "影子表同步");
    let (heading, text) = chunk_heading_text(&db, note.id, 1);
    assert_eq!(heading.as_deref(), Some("第二章"));
    assert!(text.contains("正文二"));
}

#[test]
fn empty_content_note_has_no_chunks() {
    // Arrange/Act
    let db = mem_db();
    db.create_note(&make_note("   ")).expect("create");
    // Assert
    assert_eq!(count_chunks(&db, None), 0);
}

#[test]
fn update_note_title_only_keeps_chunks_but_content_change_rebuilds() {
    // Arrange
    let db = mem_db();
    let note = db.create_note(&make_note("旧内容甲")).expect("create");
    assert_eq!(count_chunks(&db, None), 1);
    // Act：纯标题保存——内容未变，不得重建
    db.update_note(note.id, "新标题", "旧内容甲").expect("title-only");
    // Assert
    assert_eq!(count_chunks(&db, None), 1);
    // Act：正文变化——旧块清、新块立
    db.update_note(note.id, "新标题", "# 升级\n\n新内容乙").expect("content change");
    // Assert
    assert_eq!(count_chunks(&db, None), 1);
    let (heading, text) = chunk_heading_text(&db, note.id, 0);
    assert_eq!(heading.as_deref(), Some("升级"));
    assert!(text.contains("新内容乙") && !text.contains("旧内容甲"), "旧块应被替换");
}

#[test]
fn versioned_save_indexes_at_save_collector() {
    // Arrange
    let db = mem_db();
    let note = db.create_note(&make_note("")).expect("create");
    assert_eq!(count_chunks(&db, None), 0);
    // Act（保存收口——正文变化才重建）
    db.versioned_save(note.id, "# 要点\n\n记忆卡内容", NoteVersionSource::UserEdit, &VersionMeta::default())
        .expect("versioned_save");
    // Assert
    assert_eq!(count_chunks(&db, None), 1);
    db.versioned_save(note.id, "# 要点\n\n改过的内容", NoteVersionSource::UserEdit, &VersionMeta::default())
        .expect("save2");
    assert_eq!(count_chunks(&db, None), 1);
    let (_, text) = chunk_heading_text(&db, note.id, 0);
    assert!(text.contains("改过的内容") && !text.contains("记忆卡内容"));
}

#[test]
fn delete_note_clears_chunks_and_fts() {
    // Arrange
    let db = mem_db();
    let note = db.create_note(&make_note("# 待删\n\n内容")).expect("create");
    assert_eq!(count_chunks(&db, None), 1);
    // Act
    assert!(db.delete_note(note.id).expect("delete"));
    // Assert
    assert_eq!(count_chunks(&db, None), 0);
    assert_eq!(count_fts(&db), 0);
}

#[test]
fn fragment_lifecycle_indexes_once_and_clears_on_delete() {
    // Arrange
    let db = mem_db();
    // Act：建碎片 → 入块
    let f = db.create_fragment(&make_fragment("配色灵感：莫兰迪灰蓝。")).expect("create");
    // Assert
    assert_eq!(count_chunks(&db, Some("fragment")), 1);
    assert_eq!(count_fts(&db), 1);
    // Act：删除碎片 → 清块
    assert!(db.delete_fragment(f.id).expect("delete"));
    // Assert
    assert_eq!(count_chunks(&db, Some("fragment")), 0);
    assert_eq!(count_fts(&db), 0);
}

#[test]
fn promote_fragment_clears_fragment_chunks_and_indexes_new_note() {
    // Arrange
    let db = mem_db();
    let f = db
        .create_fragment(&make_fragment("# 升笔记素材\n\n正文升笔记。"))
        .expect("create");
    assert_eq!(count_chunks(&db, Some("fragment")), 1);
    // Act（建笔记 + 删碎片同事务——索引钩子随事务收口）
    let note = db
        .promote_fragment_to_note(Path::new("."), f.id, "升的笔记", None)
        .expect("promote");
    // Assert
    assert_eq!(count_chunks(&db, Some("fragment")), 0, "碎片块应清");
    assert_eq!(count_chunks(&db, Some("note")), 1, "笔记入块");
    let (_, text) = chunk_heading_text(&db, note.id, 0);
    assert!(text.contains("升笔记素材"));
}

#[test]
fn reindex_all_rebuilds_and_stats_report_clean_state() {
    // Arrange
    let db = mem_db();
    db.create_note(&make_note("# 甲\n\n内容甲内容。")).expect("n1");
    db.create_note(&make_note("乙内容乙内容。")).expect("n2");
    db.create_fragment(&make_fragment("丙碎片内容。")).expect("f");
    // Act（模拟钩子漏挂路径：绕 db API 清库后全量重建）
    db.with_conn(|c| {
        c.execute_batch("DELETE FROM kb_chunks; DELETE FROM kb_fts;")?;
        Ok(())
    })
    .expect("wipe");
    let mut progress: Vec<(u64, u64)> = Vec::new();
    let report = db.kb_reindex_all(&mut |d, t| progress.push((d, t))).expect("reindex");
    // Assert
    assert_eq!(report.sources_total, 3);
    assert_eq!(report.succeeded, 3);
    assert_eq!(report.failed, 0);
    assert_eq!(progress.last().copied(), Some((3, 3)), "进度到顶");
    let stats: KbIndexStats = db.kb_index_stats().expect("stats");
    assert_eq!(stats.sources_total, 3);
    assert_eq!(stats.sources_indexed, 3);
    assert_eq!(stats.dirty_sources, 0);
    assert_eq!(stats.error_count, 0);
    assert_eq!(stats.index_version, stats.current_index_version);
    assert!(stats.reindex_all_at.is_some());
    assert!(stats.chunks_total > 0);
    assert_eq!(stats.chunks_total, stats.fts_rows, "影子表一致");
    assert!(stats.fts_ready);
    assert!(!stats.embedding_ready, "v0.19.3 前无 embedding——诚实状态");
}

#[test]
fn reindex_all_is_idempotent_and_recovers_orphans() {
    // Arrange：文件库 + 第二裸连接（FK 默认关）模拟"绕过 db API 直删源行"——
    // 常规连接 FK ON 时级联兜底会顺清 kb_chunks（勿依赖影子表，但主清理路径
    // 之外确实存在 FK 关闭的极端写入口，孤儿检测兜底必须成立）
    let dir = tempfile::tempdir().expect("tmpdir");
    let db_path = dir.path().join("kb.db");
    let db = Db::open(db_path.to_str().expect("utf8 path")).expect("open db");
    let n1 = db.create_note(&make_note("# 甲\n\n正文甲。")).expect("n1");
    db.create_fragment(&make_fragment("碎片丁内容。")).expect("f");
    db.kb_reindex_all(&mut |_, _| {}).expect("reindex1");
    let before = count_chunks(&db, None);
    // Act：全量重建幂等（块数不变）
    db.kb_reindex_all(&mut |_, _| {}).expect("reindex2");
    // Assert
    assert_eq!(count_chunks(&db, None), before, "重建幂等");
    // Act：FK 关闭连接直删源行 → 孤儿块计入脏源
    // （bundled SQLite 编译期 DEFAULT_FOREIGN_KEYS=1——需显式关 FK 模拟
    // 极端写入口；常规连接级联兜底会顺清 kb_chunks，勿依赖影子表清理）
    {
        let raw = rusqlite::Connection::open(&db_path).expect("raw conn");
        raw.pragma_update(None, "foreign_keys", false).expect("fk off");
        raw.execute("DELETE FROM notes WHERE id=?1", [n1.id]).expect("raw delete");
    }
    let dirty = db.kb_index_stats().expect("stats").dirty_sources;
    assert_eq!(dirty, 1, "孤儿块应报脏");
    // Act：重建自愈
    db.kb_reindex_all(&mut |_, _| {}).expect("reindex3");
    let stats = db.kb_index_stats().expect("stats");
    assert_eq!(stats.dirty_sources, 0, "重建后脏源清零");
    assert_eq!(stats.error_count, 0);
}

#[test]
fn empty_source_rows_are_not_dirty() {
    // Arrange：空正文笔记/空文本碎片不可索引——不算漏索引
    let db = mem_db();
    db.create_note(&make_note("")).expect("empty note");
    db.create_fragment(&make_fragment("")).expect("empty frag");
    db.kb_reindex_all(&mut |_, _| {}).expect("reindex");
    // Assert
    let stats = db.kb_index_stats().expect("stats");
    assert_eq!(stats.sources_total, 0, "无可索引源");
    assert_eq!(stats.dirty_sources, 0);
}
