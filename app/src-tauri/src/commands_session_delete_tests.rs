//! 批量删除会话单测（批 4；AAA 模式 + :memory: 隔离库，绝不触碰真实数据）。
//!
//! @ai-context: 由 commands_session_delete.rs 以 #[cfg(test)] #[path] 引入；
//!              被测对象 run_batch_delete 为命令核心（注入 Db，无 Tauri 态），
//!              域广播在命令宏入口、不在此测试（与批量转笔记测试同构）。
//! @ai-context: 原子性用 SQLite RAISE(ABORT) 触发器模拟中途失败——真实语句
//!              失败难以在 :memory: 造出，触发器是 schema 层最接近的失败源。

use crate::commands_session_delete::run_batch_delete;
use crate::db::Db;
use crate::types::{NewNote, NewSession, NewSessionSegment};

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

/// 造一个已结束（finished）会话（带转写段 = 有内容）。
fn finished_session(db: &Db, title: &str) -> i64 {
    let s = db
        .create_session(&NewSession {
            title: title.into(),
            source_window: None,
            profile: None,
            kind: None,
        })
        .expect("create session");
    db.finish_session(s.id).expect("finish session");
    db.add_segment(&NewSessionSegment {
        session_id: s.id,
        start_ms: 0,
        end_ms: 1000,
        text: format!("{} 的转写", title),
        source: "asr".into(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    })
    .expect("add segment");
    s.id
}

/// 直插子表行（转写段由 finished_session 已插一条；此处补 OCR 块/产物块/
/// 信号事件各一——加段共四张表四行，验证删除外键级联全清）。
fn seed_child_rows(db: &Db, session_id: i64) {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO session_ocr_blocks (session_id, timestamp_ms, text, score, region)
             VALUES (?1, 0, 'cascade ocr', 0.9, 'full')",
            rusqlite::params![session_id],
        )?;
        conn.execute(
            "INSERT INTO artifact_blocks (session_id, kind, payload_json, block_order)
             VALUES (?1, 'chapter', '{}', 0)",
            rusqlite::params![session_id],
        )?;
        conn.execute(
            "INSERT INTO session_events (session_id, kind, timestamp_ms)
             VALUES (?1, 'app_foreground', 0)",
            rusqlite::params![session_id],
        )?;
        Ok(())
    })
    .expect("seed child rows");
}

/// 子表残留行数（>0 说明级联未生效）。
fn child_row_count(db: &Db, session_id: i64) -> i64 {
    db.with_conn(|conn| {
        let mut count = 0i64;
        for table in ["session_segments", "session_ocr_blocks", "artifact_blocks", "session_events"] {
            let sql = format!("SELECT COUNT(*) FROM {} WHERE session_id = ?1", table);
            count += conn.query_row(&sql, rusqlite::params![session_id], |row| {
                row.get::<_, i64>(0)
            })?;
        }
        Ok(count)
    })
    .expect("count child rows")
}

#[test]
fn batch_delete_removes_all_and_cascades_children() {
    // Arrange：三个会话（两个待删），各带四张子表行
    let db = mem_db();
    let a = finished_session(&db, "A课");
    let b = finished_session(&db, "B课");
    let keep = finished_session(&db, "保留课");
    for id in [a, b, keep] {
        seed_child_rows(&db, id);
    }
    assert_eq!(child_row_count(&db, a), 4);
    // Act
    let result = run_batch_delete(&db, vec![a, b]).expect("batch delete");
    // Assert：计数精确；会话与子表全清；未选会话原样保留
    assert_eq!(result.deleted, 2);
    assert!(db.get_session(a).expect("db").is_none());
    assert!(db.get_session(b).expect("db").is_none());
    assert_eq!(child_row_count(&db, a), 0);
    assert_eq!(child_row_count(&db, b), 0);
    assert_eq!(child_row_count(&db, keep), 4);
    assert!(db.get_session(keep).expect("db").is_some());
}

#[test]
fn batch_delete_atomic_rollback_on_mid_failure() {
    // Arrange：A 在触发器守卫之前、B 命中守卫——任何实现若逐条提交都会半删
    let db = mem_db();
    let a = finished_session(&db, "A课");
    let b = finished_session(&db, "B课");
    db.with_conn(|conn| {
        // 触发器 DDL 不支持绑定变量——b 为刚由本库 create_session 生成的 i64，
        // 非用户输入，直接内联安全（防御注释：杜绝字符串拼接的例外场景）
        let sql = format!(
            "CREATE TRIGGER guard_delete BEFORE DELETE ON sessions
             WHEN OLD.id = {} BEGIN SELECT RAISE(ABORT, 'guard: session busy'); END",
            b,
        );
        conn.execute_batch(&sql)?;
        Ok(())
    })
    .expect("create guard trigger");
    // Act
    let err = run_batch_delete(&db, vec![a, b]).expect_err("must fail atomically");
    // Assert：整体报错且 A 也未被删除（单事务回滚——无半删残留）
    assert!(err.contains("guard: session busy"), "err={err}");
    assert!(db.get_session(a).expect("db").is_some(), "A 应随事务回滚保留");
    assert!(db.get_session(b).expect("db").is_some());
}

#[test]
fn batch_delete_keeps_note_but_unbinds_session() {
    // Arrange：已转笔记的会话（笔记是用户资产——删会话只断关联不删笔记）
    let db = mem_db();
    let id = finished_session(&db, "已转课");
    let note = db
        .create_note(&NewNote {
            title: "转换笔记".into(),
            content: "x".into(),
            source: "classroom".into(),
            session_id: Some(id),
            rule_version: None,
            purify_stats: None,
            tags: None,
            properties: None,
            group_id: None,
        })
        .expect("create note");
    // Act
    run_batch_delete(&db, vec![id]).expect("batch delete");
    // Assert：笔记保留且 session_id 已置空（外键 SET NULL 语义）
    let kept = db.get_note(note.id).expect("db").expect("note kept");
    assert_eq!(kept.session_id, None);
    assert!(db.find_note_by_session(id).expect("db").is_none());
}

#[test]
fn batch_delete_coexists_with_batch_convert() {
    // Arrange：与批量转笔记同一编排链走一遍（先转后删——真实页面动线）
    let db = mem_db();
    let id = finished_session(&db, "先转后删课");
    let converted = crate::commands_session_note::run_batch_conversion(
        &db,
        &crate::ui_junk::UiJunkList::defaults(),
        &crate::note_filter::PurifyEnv::default(),
        std::path::Path::new("."),
        vec![id],
    )
    .expect("batch convert");
    assert_eq!(converted.converted.len(), 1);
    let note_id = converted.converted[0].note_id;
    // Act：删除已转会话
    run_batch_delete(&db, vec![id]).expect("batch delete");
    // Assert：笔记留存且解绑；会话已删
    let kept = db.get_note(note_id).expect("db").expect("note kept");
    assert_eq!(kept.session_id, None);
    assert!(db.get_session(id).expect("db").is_none());
}

#[test]
fn batch_delete_validation_and_counting() {
    let db = mem_db();
    let a = finished_session(&db, "A课");
    // 空 ids → 报错
    let err = run_batch_delete(&db, vec![]).expect_err("empty must err");
    assert!(err.contains("不能为空"), "err={err}");
    // 非正 id → 报错（与单条 delete_session 同口径）
    let err = run_batch_delete(&db, vec![0]).expect_err("invalid must err");
    assert!(err.contains("无效的会话 id"), "err={err}");
    // 超上限 → 报错（201 > 200）
    let over: Vec<i64> = (1..=201).collect();
    let err = run_batch_delete(&db, over).expect_err("over-limit must err");
    assert!(err.contains("上限"), "err={err}");
    // 重复 id 静默去重 + 不存在的 id 宽容（计 0，不报错——与单条一致）
    let result = run_batch_delete(&db, vec![a, a, 99_999]).expect("dedupe & missing ok");
    assert_eq!(result.deleted, 1);
    assert!(db.get_session(a).expect("db").is_none());
}
