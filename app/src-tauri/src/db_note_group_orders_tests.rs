//! db_note_group_orders 单测（内存库；AAA 模式）。
//!
//! @ai-context: 覆盖 REQ-315（批 6）排序域——空表/分区快照覆盖保存/单组 clear
//!              回自动/置顶校验拒绝/跨 kind 隔离/删组级联/改判（kind 变更）清行。

use crate::db::Db;
use crate::db_note_group_orders::is_valid_group_order_kind;
use crate::types::{NewNoteGroup, NoteGroup};

fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

fn group(name: &str, kind: &str) -> NewNoteGroup {
    NewNoteGroup {
        name: name.to_string(),
        terrain: "container".to_string(),
        kind: kind.to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    }
}

fn make(db: &Db, name: &str, kind: &str) -> NoteGroup {
    db.create_group(&group(name, kind)).expect("create")
}

#[test]
fn kind_validation_whitelist() {
    assert!(is_valid_group_order_kind("course"));
    assert!(is_valid_group_order_kind("topic"));
    assert!(is_valid_group_order_kind("standalone"));
    assert!(is_valid_group_order_kind("feed"));
    assert!(!is_valid_group_order_kind(""));
    assert!(!is_valid_group_order_kind("Course"));
    assert!(!is_valid_group_order_kind("note"));
}

#[test]
fn empty_table_loads_empty_and_clear_is_idempotent() {
    // Arrange：无任何手动序
    let db = mem_db();
    let g = make(&db, "孤组", "course");
    // Act / Assert：空表加载
    assert!(db.load_group_orders().expect("load").is_empty());
    // 无行 clear → false（不广播——命令层据返回值决定广播）
    assert!(!db.clear_group_order(g.id).expect("clear").to_owned());
}

#[test]
fn save_snapshot_overwrites_partition_rows() {
    // Arrange：course 分区 3 组 + topic 分区 1 组（跨 kind 隔离验证）
    let db = mem_db();
    let a = make(&db, "A", "course");
    let b = make(&db, "B", "course");
    let c = make(&db, "C", "course");
    let t = make(&db, "T", "topic");
    db.save_group_order("course", &[a.id, b.id, c.id]).expect("first snapshot");
    db.save_group_order("topic", &[t.id]).expect("topic snapshot");
    // Act：course 第二次保存换序 + 不写 c（=快照覆盖；C 回自动区）
    db.save_group_order("course", &[c.id, a.id]).expect("overwrite");
    // Assert：course 行被覆盖（B 行消失），topic 行不受影响（load 按 seq, id 决胜）
    let rows = db.load_group_orders().expect("load");
    assert_eq!(rows, vec![(c.id, 0), (t.id, 0), (a.id, 1)]);
}

#[test]
fn empty_ids_clears_whole_partition() {
    // Arrange：course 分区快照（含历史行）+ topic 独立行
    let db = mem_db();
    let a = make(&db, "A", "course");
    let b = make(&db, "B", "course");
    let t = make(&db, "T", "topic");
    db.save_group_order("course", &[a.id, b.id]).expect("snapshot");
    db.save_group_order("topic", &[t.id]).expect("topic snapshot");
    // Act：空 ids = course 分区整体回自动（「手排 ↺」复位语义）
    db.save_group_order("course", &[]).expect("reset");
    // Assert：course 全清，其他 kind 保留
    let rows = db.load_group_orders().expect("load");
    assert_eq!(rows, vec![(t.id, 0)]);
}

#[test]
fn verify_membership_rejects_pinned_cross_kind_and_missing() {
    let db = mem_db();
    let a = make(&db, "A", "course");
    let b = make(&db, "B", "course");
    let t = make(&db, "T", "topic");
    db.update_note_group_pin(b.id, 1).expect("pin B");
    // 全部合法
    assert!(db.verify_group_order_membership("course", &[a.id]).expect("ok"));
    // 置顶组拒绝（置顶组不占手动位）
    assert!(!db.verify_group_order_membership("course", &[a.id, b.id]).expect("pinned"));
    // 跨 kind 拒绝
    assert!(!db.verify_group_order_membership("course", &[a.id, t.id]).expect("cross kind"));
    // 不存在组拒绝
    assert!(!db.verify_group_order_membership("course", &[a.id, 9999]).expect("missing"));
    // 空列表 = 分区复位，恒通过（配合 save 空快照）
    assert!(db.verify_group_order_membership("course", &[]).expect("empty"));
}

#[test]
fn pinned_group_row_survives_and_is_ignored_on_next_snapshot() {
    // @ai-context: 置顶不删存量行（取消置顶回原手动位——notes.pin 同语义）；
    // 下次 save 的「删整分区再插」会自然清掉置顶组陈旧行（只写未置顶成员）。
    let db = mem_db();
    let a = make(&db, "A", "course");
    let b = make(&db, "B", "course");
    db.save_group_order("course", &[a.id, b.id]).expect("snapshot");
    // 置顶 B → 行仍在
    db.update_note_group_pin(b.id, 1).expect("pin");
    assert_eq!(db.load_group_orders().expect("load").len(), 2);
    // A 上移触发的下一次快照只写未置顶成员 → B 陈旧行清除
    db.save_group_order("course", &[a.id]).expect("resnapshot");
    assert_eq!(db.load_group_orders().expect("load"), vec![(a.id, 0)]);
    // B 取消置顶 → 无行 → 回自动区（updated_at 降序兜底），而非旧位
    db.update_note_group_pin(b.id, 0).expect("unpin");
    assert_eq!(db.load_group_orders().expect("load").len(), 1);
}

#[test]
fn delete_group_cascades_order_row() {
    let db = mem_db();
    let a = make(&db, "A", "course");
    let b = make(&db, "B", "course");
    db.save_group_order("course", &[a.id, b.id]).expect("snapshot");
    // Act：删组（FK ON DELETE CASCADE——组删除语义不扩展，只清理本表行）
    assert!(db.delete_group(a.id).expect("delete"));
    // Assert：只剩 B 的行（快照 seq 保留：b 曾位于 1 号位）
    assert_eq!(db.load_group_orders().expect("load"), vec![(b.id, 1)]);
}

#[test]
fn kind_change_overrides_clear_stale_row() {
    // @ai-context: seq 是 kind 分区内相对序号——改判换分区必须清行，否则旧序
    // 在新分区占位（可能与新分区序号撞序/插入旧相对位置）。
    let db = mem_db();
    let a = make(&db, "A", "course");
    let t = make(&db, "T", "topic");
    db.save_group_order("course", &[a.id]).expect("snapshot");
    db.save_group_order("topic", &[t.id]).expect("snapshot topic");
    // Act：A 改判为 topic（带 reason；改判失败路径不改 kind 不触发清理）
    db.override_group_route(a.id, "topic", None, "用户改判：topic")
        .expect("override");
    // Assert：A 的 course 行被清（topic 分区原行不受影响）
    let rows = db.load_group_orders().expect("load");
    assert_eq!(rows, vec![(t.id, 0)]);
}

#[test]
fn group_pin_roundtrip_and_updated_at_refresh() {
    let db = mem_db();
    let a = make(&db, "A", "course");
    assert_eq!(a.pin, 0, "新组默认未置顶");
    // Act：置顶
    assert!(db.update_note_group_pin(a.id, 1).expect("pin"));
    let pinned = db.get_group(a.id).expect("get").expect("exists");
    // Assert：pin 落库 + updated_at 刷新（置顶区按更新时间降序——置顶动作即最前）
    assert_eq!(pinned.pin, 1);
    assert!(pinned.updated_at >= a.updated_at);
    // 取消置顶
    assert!(db.update_note_group_pin(a.id, 0).expect("unpin"));
    assert_eq!(db.get_group(a.id).expect("get").expect("exists").pin, 0);
    // 不存在组 → false
    assert!(!db.update_note_group_pin(9999, 1).expect("missing"));
}

#[test]
fn pin_and_manual_order_save_mark_user_orchestration() {
    // 批 7 审查修复（P2-7 写侧单点）：置顶/手排=用户编排痕迹——route/series
    // 自动产物置 route_overridden=1（空组自动清理谓词主闸），防空组被静默删；
    // 手排标记与快照同事务（save_group_order 内一并 UPDATE，回滚同生共死）。
    let db = mem_db();
    let a = make(&db, "A", "course"); // source=route（helper 默认）
    assert!(db.update_note_group_pin(a.id, 1).expect("pin"));
    assert_eq!(
        db.get_group(a.id).expect("get").expect("a").route_overridden,
        1,
        "置顶=接管该组"
    );
    // 手排快照覆盖：快照内（未置顶）组全部接管
    let b = make(&db, "B", "course");
    db.save_group_order("course", &[a.id, b.id]).expect("snapshot");
    assert_eq!(db.get_group(b.id).expect("get").expect("b").route_overridden, 1);
    // 分区复位（空 ids）不置位任何组（无快照成员——无对象可标记）
    let c = make(&db, "C", "course");
    db.save_group_order("course", &[]).expect("reset");
    assert_eq!(db.get_group(c.id).expect("get").expect("c").route_overridden, 0);
}
