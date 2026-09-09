//! db_note_group_clean 单测（REQ-316 批 7；内存库 AAA 模式）。
//!
//! @ai-context: 覆盖自动清理判定表——自动路由产物+五类残留全零才删；手动建组/
//!              改判组/任一残留/影响面外组永不动；级联卫生（note_group_orders
//!              行随删清）；写路径收敛（删除/移组/碎片删除/移组/升笔记触发点）。

use rusqlite::params;

use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::db_fragments::NewFragment;
use crate::db_note_group_clean::{auto_clean_empty_groups, group_residue};
use crate::types::{NewNote, NewNoteGroup};

fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 组入参助手（自动路由容器组；source 可改 manual/series——series 自动带课程
/// 语义：kind=course + series_key 幂等键）。
fn group(name: &str, source: &str) -> NewNoteGroup {
    NewNoteGroup {
        name: name.to_string(),
        terrain: "container".to_string(),
        kind: if source == "series" { "course" } else { "standalone" }.to_string(),
        domain_tag: None,
        source: source.to_string(),
        series_key: if source == "series" { Some(name.to_string()) } else { None },
        route_reason: None,
    }
}

fn note(db: &Db, gid: i64, title: &str) -> i64 {
    db.create_note(&NewNote {
        title: title.to_string(),
        content: "x".to_string(),
        source: "manual".to_string(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: Some(gid),
    })
    .expect("note")
    .id
}

fn fragment(db: &Db, gid: Option<i64>) -> i64 {
    db.create_fragment(&NewFragment {
        text: "碎片".to_string(),
        image_path: None,
        domain_tag: None,
        group_id: gid,
        source: "manual".to_string(),
    })
    .expect("fragment")
    .id
}

#[test]
fn residue_empty_only_when_group_pristine_and_any_item_flips_it() {
    // Arrange：空路由组（is_empty 基线）→ 逐类加残留
    let db = mem_db();
    let g = db.create_group(&group("甲", "route")).expect("g");
    // Assert：五类全空 → 空判定成立
    {
        let guard = db_raw_conn(&db);
        assert!(group_residue(&guard, g.id).expect("r").is_empty());
    }
    // 五类残留齐上（组始终非空——不触发写路径清理干扰本计数测试）
    note(&db, g.id, "笔记");
    fragment(&db, Some(g.id));
    db.create_card(&NewFlashcard {
        group_id: g.id,
        note_id: None,
        fragment_id: None,
        front: "前".into(),
        back: "后".into(),
        kind: "fact".into(),
        state_json: "{}".into(),
        due_at: 0,
    })
    .expect("card");
    db.create_settlement(g.id, "{}").expect("settlement");
    db.upsert_week_contract(g.id, 1_700_000_000, 2, 10).expect("contract");
    // Assert：任一类残留即非空（清理闸门全关）
    let guard = db_raw_conn(&db);
    let r = group_residue(&guard, g.id).expect("r");
    assert!(!r.is_empty());
    assert!(r.notes > 0 && r.fragments > 0 && r.cards > 0 && r.settlements > 0 && r.contracts > 0);
}

/// 临时拿 &Connection（只读/独立事务测试用——helper 入参形态）。
fn db_raw_conn(db: &Db) -> std::sync::MutexGuard<'_, rusqlite::Connection> {
    db.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[test]
fn auto_route_empty_group_is_cleaned() {
    // Arrange：自动路由空组（source=route）
    let db = mem_db();
    let g = db.create_group(&group("路由产物", "route")).expect("g");
    // Act
    let guard = db_raw_conn(&db);
    let cleaned = auto_clean_empty_groups(&guard, &[g.id]).expect("clean");
    drop(guard);
    // Assert：被清理且名字回传（前端 toast 源）
    assert_eq!(cleaned.len(), 1);
    assert_eq!(cleaned[0].id, g.id);
    assert_eq!(cleaned[0].name, "路由产物");
    assert!(db.get_group(g.id).expect("get").is_none());
}

#[test]
fn series_detected_empty_group_is_cleaned() {
    // Arrange：系列检测产物（source=series，kind=course）——同样属自动路由产品
    let db = mem_db();
    let g = db.create_group(&group("某某系列", "series")).expect("g");
    // Act
    let guard = db_raw_conn(&db);
    let cleaned = auto_clean_empty_groups(&guard, &[g.id]).expect("clean");
    drop(guard);
    // Assert
    assert_eq!(cleaned.len(), 1, "系列课程组为空同样清理（下一集会话按 series_key 重建）");
    assert!(db.get_group(g.id).expect("get").is_none());
}

#[test]
fn manual_group_never_auto_cleaned() {
    // Arrange：手动建组（source=manual，route_overridden=0）——用户资产边界
    let db = mem_db();
    let g = db.create_group(&group("我建的", "manual")).expect("g");
    // Act
    let guard = db_raw_conn(&db);
    let cleaned = auto_clean_empty_groups(&guard, &[g.id]).expect("clean");
    drop(guard);
    // Assert：永不自动删（用户口径：手动建组绝不动）
    assert!(cleaned.is_empty());
    assert!(db.get_group(g.id).expect("get").is_some());
}

#[test]
fn overridden_group_never_auto_cleaned() {
    // Arrange：自动路由组已被用户改判（route_overridden=1——修改即记忆）
    let db = mem_db();
    let g = db.create_group(&group("改判过", "route")).expect("g");
    db.override_group_route(g.id, "standalone", None, "用户改判测试").expect("override");
    // Act
    let guard = db_raw_conn(&db);
    let cleaned = auto_clean_empty_groups(&guard, &[g.id]).expect("clean");
    drop(guard);
    // Assert：改判=用户接管——永不自动删
    assert!(cleaned.is_empty());
    assert!(db.get_group(g.id).expect("get").is_some());
}

#[test]
fn any_residue_class_blocks_cleanup() {
    // Arrange：五类残留各建一组（同组多残留=同逻辑——逐类独立验证防漏判）
    let db = mem_db();
    // notes 残留
    let g1 = db.create_group(&group("有笔记", "route")).expect("g1");
    note(&db, g1.id, "在组笔记");
    // fragments 残留
    let g2 = db.create_group(&group("有碎片", "route")).expect("g2");
    fragment(&db, Some(g2.id));
    // cards 残留
    let g3 = db.create_group(&group("有卡", "route")).expect("g3");
    db.create_card(&NewFlashcard {
        group_id: g3.id,
        note_id: None,
        fragment_id: None,
        front: "前".into(),
        back: "后".into(),
        kind: "fact".into(),
        state_json: "{}".into(),
        due_at: 0,
    })
    .expect("card");
    // settlements 残留
    let g4 = db.create_group(&group("有结算", "route")).expect("g4");
    db.create_settlement(g4.id, "{}").expect("settlement");
    // contracts 残留
    let g5 = db.create_group(&group("有周契约", "route")).expect("g5");
    db.upsert_week_contract(g5.id, 1_700_000_000, 3, 15).expect("contract");
    // Act：整批过 helper
    let ids = [g1.id, g2.id, g3.id, g4.id, g5.id];
    let guard = db_raw_conn(&db);
    let cleaned = auto_clean_empty_groups(&guard, &ids).expect("clean");
    drop(guard);
    // Assert：任一残留即挡——五组全存活
    assert!(cleaned.is_empty());
    for gid in ids {
        assert!(db.get_group(gid).expect("get").is_some(), "组 {gid} 有残留不得清");
    }
}

#[test]
fn groups_outside_affected_scope_untouched() {
    // Arrange：两个空路由组——只把 A 列入影响面
    let db = mem_db();
    let a = db.create_group(&group("A", "route")).expect("a");
    let b = db.create_group(&group("B", "route")).expect("b");
    // Act
    let guard = db_raw_conn(&db);
    let cleaned = auto_clean_empty_groups(&guard, &[a.id]).expect("clean");
    drop(guard);
    // Assert：只清影响面内组（B 不动——helper 无全表清扫语义）
    assert_eq!(cleaned.len(), 1);
    assert_eq!(cleaned[0].id, a.id);
    assert!(db.get_group(b.id).expect("get").is_some());
}

#[test]
fn cleanup_cascades_order_rows_and_pin_with_group() {
    // Arrange：空路由组 + 置顶 + 分区手动序行（批 6 基建——组删随 FK CASCADE 清）
    let db = mem_db();
    let g = db.create_group(&group("有序组", "route")).expect("g");
    db.update_note_group_pin(g.id, 1).expect("pin");
    db.save_group_order("standalone", &[g.id]).expect("order");
    // Act
    let guard = db_raw_conn(&db);
    let cleaned = auto_clean_empty_groups(&guard, &[g.id]).expect("clean");
    drop(guard);
    // Assert：组没了、序行/置顶残留零
    assert_eq!(cleaned.len(), 1);
    let orphan: i64 = db
        .with_conn(|c| Ok(c.query_row("SELECT COUNT(*) FROM note_group_orders WHERE group_id = ?1", params![g.id], |r| r.get(0))?))
        .expect("count");
    assert_eq!(orphan, 0, "note_group_orders 随组删级联清行（无孤儿）");
}

// ── 写路径集成（真实命令语义在 db 层事务内收敛的验证） ──

#[test]
fn delete_last_note_cleans_auto_group_in_same_tx() {
    // Arrange：自动路由组 + 唯一笔记（无其他残留）
    let db = mem_db();
    let g = db.create_group(&group("独苗组", "route")).expect("g");
    let n = note(&db, g.id, "最后一篇");
    // Act：删除笔记（命令走同一 db 方法）
    let out = db.delete_note(n).expect("delete");
    // Assert：笔记删除 + 组自动清理同事务完成（无"空组残留"半态）
    assert!(out.deleted);
    assert_eq!(out.auto_cleaned.len(), 1);
    assert_eq!(out.auto_cleaned[0].id, g.id);
    assert!(db.get_group(g.id).expect("get").is_none());
}

#[test]
fn delete_last_note_keeps_manual_group() {
    // Arrange：手动组 + 唯一笔记——删除后组保留（用户口径护栏）
    let db = mem_db();
    let g = db.create_group(&group("手动独苗", "manual")).expect("g");
    let n = note(&db, g.id, "唯一笔记");
    // Act
    let out = db.delete_note(n).expect("delete");
    // Assert：笔记删了，手动空组留在侧栏（永不自动删）
    assert!(out.deleted);
    assert!(out.auto_cleaned.is_empty());
    assert!(db.get_group(g.id).expect("get").is_some());
}

#[test]
fn delete_last_note_keeps_group_with_card_residue() {
    // Arrange：自动组 + 笔记 + 闪卡（卡=残留，删笔记后组仍非空）
    let db = mem_db();
    let g = db.create_group(&group("有卡组", "route")).expect("g");
    let n = note(&db, g.id, "待删");
    db.create_card(&NewFlashcard {
        group_id: g.id,
        note_id: Some(n),
        fragment_id: None,
        front: "前".into(),
        back: "后".into(),
        kind: "fact".into(),
        state_json: "{}".into(),
        due_at: 0,
    })
    .expect("card");
    // Act
    let out = db.delete_note(n).expect("delete");
    // Assert：卡仍在组 → 不清理
    assert!(out.auto_cleaned.is_empty());
    assert!(db.get_group(g.id).expect("get").is_some());
}

#[test]
fn move_last_note_out_cleans_source_auto_group() {
    // Arrange：源组（自动路由，唯一笔记）+ 目标组
    let db = mem_db();
    let src = db.create_group(&group("源组", "route")).expect("src");
    let dst = db.create_group(&group("目标组", "route")).expect("dst");
    let n = note(&db, src.id, "被移走");
    // Act：移入目标组
    let out = db.update_note_group(n, Some(dst.id)).expect("move");
    // Assert：源组变空被自动清理（同事务）；目标组有笔记不动
    assert!(out.moved);
    assert_eq!(out.auto_cleaned.len(), 1);
    assert_eq!(out.auto_cleaned[0].id, src.id);
    assert!(db.get_group(src.id).expect("get").is_none());
    assert!(db.get_group(dst.id).expect("get").is_some());
}

#[test]
fn move_last_note_out_keeps_manual_source_group() {
    // Arrange：手动源组唯一笔记 → 移出（None=回全部）
    let db = mem_db();
    let src = db.create_group(&group("手动源组", "manual")).expect("src");
    let n = note(&db, src.id, "被移出");
    // Act
    let out = db.update_note_group(n, None).expect("move");
    // Assert：手动组永不自动删
    assert!(out.moved);
    assert!(out.auto_cleaned.is_empty());
    assert!(db.get_group(src.id).expect("get").is_some());
}

#[test]
fn delete_last_fragment_cleans_feed_auto_group() {
    // Arrange：feed 主题组（自动路由）+ 唯一碎片
    let db = mem_db();
    let g = db.create_group(&NewNoteGroup {
        name: "化妆灵感".to_string(),
        terrain: "feed".to_string(),
        kind: "topic".to_string(),
        domain_tag: Some("beauty".to_string()),
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("g");
    let f = fragment(&db, Some(g.id));
    // Act：删除碎片（feed 收件箱 🗑 路径）
    let out = db.delete_fragment(f).expect("delete");
    // Assert：feed 空组被自动清理（侧栏 ⚡ feed 分区不再堆 0 空组）
    assert!(out.deleted);
    assert_eq!(out.auto_cleaned.len(), 1);
    assert!(db.get_group(g.id).expect("get").is_none());
}

#[test]
fn move_last_fragment_out_cleans_feed_auto_group() {
    // Arrange：feed 组唯一碎片 → 移出（None）
    let db = mem_db();
    let g = db.create_group(&NewNoteGroup {
        name: "健身碎片".to_string(),
        terrain: "feed".to_string(),
        kind: "topic".to_string(),
        domain_tag: Some("fitness".to_string()),
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("g");
    let f = fragment(&db, Some(g.id));
    // Act
    let out = db.update_fragment_group(f, None).expect("move");
    // Assert
    assert!(out.moved);
    assert_eq!(out.auto_cleaned.len(), 1);
    assert!(db.get_group(g.id).expect("get").is_none());
}

#[test]
fn promote_last_fragment_cleans_source_group_when_note_goes_elsewhere() {
    // Arrange：feed 组唯一碎片；升笔记到容器组（碎片源组将空）
    let db = mem_db();
    let src = db.create_group(&NewNoteGroup {
        name: "灵感碎片".to_string(),
        terrain: "feed".to_string(),
        kind: "topic".to_string(),
        domain_tag: Some("beauty".to_string()),
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("src");
    let dst = db.create_group(&group("沉淀容器", "route")).expect("dst");
    let f = fragment(&db, Some(src.id));
    // Act：升笔记（建笔记+删碎片+源组清理同事务）
    let out = db
        .promote_fragment_to_note(std::path::Path::new("."), f, "沉淀笔记", Some(dst.id))
        .expect("promote");
    // Assert：笔记落目标组；feed 源组空 → 自动清理
    assert_eq!(out.auto_cleaned.len(), 1);
    assert_eq!(out.auto_cleaned[0].id, src.id);
    assert_eq!(out.note.group_id, Some(dst.id));
    assert!(db.get_group(src.id).expect("get").is_none());
    assert!(db.get_group(dst.id).expect("get").is_some());
}
