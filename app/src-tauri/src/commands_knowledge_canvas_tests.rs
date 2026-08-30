//! commands_knowledge_canvas 命令层单测（内存库；AAA 模式）。
//!
//! @ai-context: 只测 inner 编排与校验（薄 `#[tauri::command]` 壳无业务逻辑）；
//!              校验用例断言 Err 而非 panic（AGENTS.md §6）。重点契约：
//!              ① 位置经 list_knowledge_nodes 随行返回（画布直接读取路径）；
//!              ② batch 事务原子——任一节点校验失败整体拒绝（无部分写入）；
//!              ③ 坐标有限值/zoom 正数校验（NaN/Infinity/0/负值/超界拒绝）。

use crate::commands_knowledge_canvas::{
    batch_initialize_canvas_positions_inner, get_canvas_prefs_inner, get_canvas_viewport_inner,
    save_canvas_prefs_inner, save_canvas_viewport_inner, update_node_canvas_position_inner,
};
use crate::commands_knowledge_systems::{
    add_knowledge_node_inner, create_knowledge_system_inner, list_knowledge_nodes_inner,
};
use crate::db::Db;
use crate::types::CanvasNodePosition;

/// 内存库（schema 经 Db::open 初始化——建表/ensure_column 幂等路径同真库）。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建全局体系（返回 id）。
fn make_global(db: &Db) -> i64 {
    create_knowledge_system_inner(db, "全局".to_string(), "global".to_string(), None, Some("核心问题".to_string()))
        .expect("全局体系")
        .id
}

/// 建领域体系（返回 id）。
fn make_domain(db: &Db, name: &str) -> i64 {
    create_knowledge_system_inner(db, name.to_string(), "domain".to_string(), None, None)
        .expect("领域体系")
        .id
}

/// 建问题树根节点（返回 id）。
fn make_node(db: &Db, system_id: i64, text: &str) -> i64 {
    add_knowledge_node_inner(db, system_id, None, "question".to_string(), text.to_string())
        .expect("节点创建")
        .id
}

/// 从 list 结果取指定节点（位置列随行返回的读取路径断言）。
fn node_by_id(db: &Db, system_id: i64, node_id: i64) -> crate::types::KnowledgeNode {
    list_knowledge_nodes_inner(db, system_id)
        .expect("list")
        .into_iter()
        .find(|n| n.id == node_id)
        .expect("节点存在")
}

#[test]
fn update_positions_single_roundtrip() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    let n1 = make_node(&db, sid, "问题一");
    let n2 = make_node(&db, sid, "问题二");
    // Act：新节点位置为 None（未布局）；更新 n1 后随 list 返回
    assert_eq!(node_by_id(&db, sid, n1).canvas_x, None);
    assert_eq!(node_by_id(&db, sid, n2).canvas_x, None);
    let ok = update_node_canvas_position_inner(&db, n1, 12.5, -30.0).expect("保存位置");
    // Assert
    assert!(ok);
    let got = node_by_id(&db, sid, n1);
    assert_eq!(got.canvas_x, Some(12.5));
    assert_eq!(got.canvas_y, Some(-30.0));
    // 未更新的 n2 仍为 None（不串写）
    assert_eq!(node_by_id(&db, sid, n2).canvas_x, None);
}

#[test]
fn update_positions_idempotent_overwrite() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    let n1 = make_node(&db, sid, "问题一");
    // Act：两次保存同一节点（拖拽落点可重复）
    update_node_canvas_position_inner(&db, n1, 1.0, 2.0).expect("第一次");
    update_node_canvas_position_inner(&db, n1, 3.0, 4.0).expect("第二次");
    // Assert：后写覆盖
    let got = node_by_id(&db, sid, n1);
    assert_eq!(got.canvas_x, Some(3.0));
    assert_eq!(got.canvas_y, Some(4.0));
}

#[test]
fn update_positions_rejects_bad_input() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    let n1 = make_node(&db, sid, "问题一");
    // Act/Assert：非法 id / 不存在节点 / NaN / Infinity 全部拒绝
    assert!(update_node_canvas_position_inner(&db, 0, 1.0, 1.0).is_err());
    assert!(update_node_canvas_position_inner(&db, 99999, 1.0, 1.0).is_err());
    assert!(update_node_canvas_position_inner(&db, n1, f64::NAN, 1.0).is_err());
    assert!(update_node_canvas_position_inner(&db, n1, 1.0, f64::INFINITY).is_err());
    // 拒绝后位置不变（仍 null）
    assert_eq!(node_by_id(&db, sid, n1).canvas_x, None);
}

#[test]
fn batch_initializes_all_positions() {
    // Arrange：1 根 + 1 子（辐射布局首批写全量）
    let db = mem_db();
    let sid = make_global(&db);
    let root = make_node(&db, sid, "根");
    let child = add_knowledge_node_inner(&db, sid, Some(root), "scenario".to_string(), "子".to_string())
        .expect("子节点")
        .id;
    let positions = vec![
        CanvasNodePosition { node_id: root, x: 0.0, y: 0.0 },
        CanvasNodePosition { node_id: child, x: 220.0, y: 0.0 },
    ];
    // Act
    let ok = batch_initialize_canvas_positions_inner(&db, sid, positions).expect("批量写入");
    // Assert
    assert!(ok);
    assert_eq!(node_by_id(&db, sid, root).canvas_x, Some(0.0));
    assert_eq!(node_by_id(&db, sid, child).canvas_x, Some(220.0));
    assert_eq!(node_by_id(&db, sid, child).canvas_y, Some(0.0));
}

#[test]
fn batch_is_atomic_on_validation_failure() {
    // Arrange：n2 属另一体系——整体拒绝，n1 不得被部分写入
    let db = mem_db();
    let sid = make_global(&db);
    let other = make_domain(&db, "另一领域");
    let n1 = make_node(&db, sid, "问题一");
    let outsider = make_node(&db, other, "别家节点");
    let positions = vec![
        CanvasNodePosition { node_id: n1, x: 10.0, y: 10.0 },
        CanvasNodePosition { node_id: outsider, x: 20.0, y: 20.0 },
    ];
    // Act
    let err = batch_initialize_canvas_positions_inner(&db, sid, positions).expect_err("跨体系应拒绝");
    // Assert：业务错误信息 + n1 未被写入（事务前校验，零部分写入）
    assert!(err.contains("不属于该体系"), "应报跨体系业务错误，实际: {}", err);
    assert_eq!(node_by_id(&db, sid, n1).canvas_x, None);
}

#[test]
fn batch_rejects_empty_duplicate_and_missing() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    let n1 = make_node(&db, sid, "问题一");
    // Act/Assert：空列表 / 节点不存在 / 重复节点 / 非法坐标 全拒绝
    assert!(batch_initialize_canvas_positions_inner(&db, sid, vec![]).is_err());
    assert!(
        batch_initialize_canvas_positions_inner(
            &db,
            sid,
            vec![CanvasNodePosition { node_id: 99999, x: 1.0, y: 1.0 }],
        )
        .is_err()
    );
    assert!(
        batch_initialize_canvas_positions_inner(
            &db,
            sid,
            vec![
                CanvasNodePosition { node_id: n1, x: 1.0, y: 1.0 },
                CanvasNodePosition { node_id: n1, x: 2.0, y: 2.0 },
            ],
        )
        .is_err()
    );
    assert!(
        batch_initialize_canvas_positions_inner(
            &db,
            sid,
            vec![CanvasNodePosition { node_id: n1, x: f64::NAN, y: 1.0 }],
        )
        .is_err()
    );
    // 不存在的体系
    assert!(
        batch_initialize_canvas_positions_inner(
            &db,
            99999,
            vec![CanvasNodePosition { node_id: n1, x: 1.0, y: 1.0 }],
        )
        .is_err()
    );
}

#[test]
fn viewport_save_get_roundtrip_and_missing() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    // Act：从未保存 → None；保存后读取
    assert_eq!(get_canvas_viewport_inner(&db, sid).expect("首次读"), None);
    save_canvas_viewport_inner(&db, sid, 100.0, 200.0, 1.5).expect("保存");
    let vp = get_canvas_viewport_inner(&db, sid).expect("读取").expect("有记录");
    // Assert
    assert_eq!(vp.viewport_x, 100.0);
    assert_eq!(vp.viewport_y, 200.0);
    assert_eq!(vp.zoom, 1.5);
    // Act：upsert 覆盖（拖拽/缩放后再次保存）
    save_canvas_viewport_inner(&db, sid, -10.0, -20.0, 0.8).expect("覆盖");
    let vp2 = get_canvas_viewport_inner(&db, sid).expect("读取").expect("有记录");
    // Assert：后写覆盖 + 每体系一份
    assert_eq!(vp2.viewport_x, -10.0);
    assert_eq!(vp2.zoom, 0.8);
    let other = make_domain(&db, "另一领域");
    assert_eq!(get_canvas_viewport_inner(&db, other).expect("他体系读"), None);
}

#[test]
fn viewport_rejects_bad_zoom_and_unknown_system() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    // Act/Assert：zoom 0 / 负 / NaN / Infinity / 超上界 全拒绝
    assert!(save_canvas_viewport_inner(&db, sid, 0.0, 0.0, 0.0).is_err());
    assert!(save_canvas_viewport_inner(&db, sid, 0.0, 0.0, -1.0).is_err());
    assert!(save_canvas_viewport_inner(&db, sid, 0.0, 0.0, f64::NAN).is_err());
    assert!(save_canvas_viewport_inner(&db, sid, 0.0, 0.0, f64::INFINITY).is_err());
    assert!(save_canvas_viewport_inner(&db, sid, 0.0, 0.0, 11.0).is_err());
    assert!(save_canvas_viewport_inner(&db, sid, f64::NAN, 0.0, 1.0).is_err());
    // 不存在的体系（save/get 都拒绝）
    assert!(save_canvas_viewport_inner(&db, 99999, 0.0, 0.0, 1.0).is_err());
    assert!(get_canvas_viewport_inner(&db, 99999).is_err());
    // 拒绝后无记录
    assert_eq!(get_canvas_viewport_inner(&db, sid).expect("读"), None);
}

#[test]
fn canvas_prefs_save_get_roundtrip_and_default_missing() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    // Act：从未保存 → None（前端回落默认 smoothstep + radial）
    assert_eq!(get_canvas_prefs_inner(&db, sid).expect("首次读"), None);
    // 保存 → 回读
    save_canvas_prefs_inner(&db, sid, "bezier", true, "mindmap").expect("保存");
    let p = get_canvas_prefs_inner(&db, sid).expect("读").expect("有记录");
    // Assert：camelCase 契约字段与箭头布尔往返
    assert_eq!(p.edge_style, "bezier");
    assert!(p.edge_arrows);
    assert_eq!(p.layout_algorithm, "mindmap");
    // upsert 覆盖
    save_canvas_prefs_inner(&db, sid, "straight", false, "org").expect("覆盖");
    let p2 = get_canvas_prefs_inner(&db, sid).expect("读").expect("有");
    assert_eq!((p2.edge_style.as_str(), p2.edge_arrows, p2.layout_algorithm.as_str()), ("straight", false, "org"));
}

#[test]
fn canvas_prefs_rejects_unknown_enum_and_system() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    // Act/Assert：非法连线/布局枚举拒绝（白名单前后端同口径）
    assert!(save_canvas_prefs_inner(&db, sid, "curvy", false, "radial").is_err());
    assert!(save_canvas_prefs_inner(&db, sid, "smoothstep", false, "force").is_err());
    assert!(save_canvas_prefs_inner(&db, sid, "", false, "").is_err());
    // 不存在的体系（save/get 都拒绝）
    assert!(save_canvas_prefs_inner(&db, 99999, "straight", false, "radial").is_err());
    assert!(get_canvas_prefs_inner(&db, 99999).is_err());
    // 非法 id 拒绝
    assert!(save_canvas_prefs_inner(&db, 0, "straight", false, "radial").is_err());
}

#[test]
fn canvas_prefs_whitelist_all_valid_values() {
    // Arrange：合法枚举全套逐一试（防白名单漏项——前端枚举同口径）
    let db = mem_db();
    let sid = make_global(&db);
    for style in ["straight", "bezier", "smoothstep", "step"] {
        for algo in ["radial", "mindmap", "treeRight", "org", "fishbone", "dualRing"] {
            save_canvas_prefs_inner(&db, sid, style, false, algo).expect("合法保存");
            let p = get_canvas_prefs_inner(&db, sid).expect("读").expect("有");
            assert_eq!(p.edge_style, style);
            assert_eq!(p.layout_algorithm, algo);
        }
    }
}
