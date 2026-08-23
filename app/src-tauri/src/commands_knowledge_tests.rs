//! commands_knowledge 命令层单测（内存库；AAA 模式）。
//!
//! @ai-context: 只测 inner 编排与校验纯函数——薄 `#[tauri::command]` 壳需装配
//!              Tauri State/AppState，无业务逻辑；编排逻辑全在 inner，单独测 inner
//!              等价于测全命令（:memory: 隔离，不触真实数据，AGENTS.md §7）。

use crate::commands_knowledge::{
    normalize_disciplines, normalize_text, parse_target_type, require_id, require_kind,
    require_node_type, require_status, NAME_MAX_CHARS,
};
use crate::commands_knowledge_core::{
    add_knowledge_concept_inner, add_knowledge_model_inner, audit_due_for_system_inner,
    delete_knowledge_link_inner, link_knowledge_target_inner,
    list_knowledge_concepts_inner, list_knowledge_links_inner, list_knowledge_models_inner,
    update_knowledge_concept_inner, update_knowledge_model_inner,
};
use crate::commands_knowledge_systems::{
    add_knowledge_node_inner, archive_knowledge_system_inner, create_knowledge_system_inner,
    delete_knowledge_node_inner, list_knowledge_nodes_inner, list_knowledge_systems_inner,
    update_knowledge_system_inner, update_knowledge_node_inner,
};
use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::db_fragments::NewFragment;
use crate::db_knowledge_links::LinkTarget;
use crate::types::{NewNote, NewNoteGroup};

/// 内存库（schema 经 Db::open 初始化——建表幂等路径同真库）。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

// ── 校验纯函数 ─────────────────────────────────────────────

#[test]
fn whitelist_kind_legal_illegal() {
    // Act + Assert：合法的 global/domain 通过；非法拒绝
    assert!(require_kind("global").is_ok());
    assert!(require_kind("domain").is_ok());
    assert!(require_kind("topic").is_err());
    assert!(require_kind("").is_err());
}

#[test]
fn whitelist_node_type_legal_illegal() {
    assert!(require_node_type("question").is_ok());
    assert!(require_node_type("scenario").is_ok());
    assert!(require_node_type("domain_entry").is_ok());
    assert!(require_node_type("note").is_err());
}

#[test]
fn whitelist_status_by_entity() {
    // system/node/model 用通用态；concept 用 core 态
    assert!(require_status("system", "active").is_ok());
    assert!(require_status("model", "watching").is_ok());
    assert!(require_status("node", "archived").is_ok());
    assert!(require_status("system", "core").is_err());
    assert!(require_status("concept", "core").is_ok());
    assert!(require_status("concept", "watching").is_ok());
    assert!(require_status("concept", "active").is_err());
}

#[test]
fn whitelist_target_type_legal_illegal() {
    assert_eq!(parse_target_type("note_group").expect("note_group"), LinkTarget::NoteGroup);
    assert_eq!(parse_target_type("note").expect("note"), LinkTarget::Note);
    assert_eq!(parse_target_type("flashcard").expect("flashcard"), LinkTarget::Flashcard);
    assert_eq!(parse_target_type("fragment").expect("fragment"), LinkTarget::Fragment);
    assert!(parse_target_type("video").is_err());
}

#[test]
fn name_normalization_trims_and_collapses() {
    // Act：trim + 连续空白折叠为一个空格
    let n = normalize_text("  程序  自      学  ", "名称").expect("normalize");
    // Assert
    assert_eq!(n, "程序 自 学");
    assert_eq!(normalize_text("单行","名称").expect("s"), "单行");
}

#[test]
fn name_empty_and_too_long_rejected() {
    // Act + Assert：空/纯空白拒绝；超长拒绝
    assert!(normalize_text("", "名称").is_err());
    assert!(normalize_text("   ", "名称").is_err());
    let long = "长".repeat(NAME_MAX_CHARS + 1);
    assert!(normalize_text(&long, "名称").is_err());
    let ok = "长".repeat(NAME_MAX_CHARS);
    assert!(normalize_text(&ok, "名称").is_ok());
}

#[test]
fn disciplines_validation() {
    // 合法数组 ≥1 非空 → 规范化 JSON；空数组/全空白/非 JSON → 拒绝
    assert_eq!(normalize_disciplines(r#"["数学","物理"]"#).expect("d"), r#"["数学","物理"]"#);
    assert_eq!(normalize_disciplines(r#"[" 数学 "]"#).expect("t"), r#"["数学"]"#);
    assert!(normalize_disciplines("[]").is_err());
    assert!(normalize_disciplines(r#"["", "  "]"#).is_err());
    assert!(normalize_disciplines("not-json").is_err());
}

#[test]
fn require_id_positive_only() {
    assert!(require_id(1).is_ok());
    assert!(require_id(0).is_err());
    assert!(require_id(-5).is_err());
}

// ── inner 编排：体系 ────────────────────────────────────────

#[test]
fn global_unique_rejects_second_and_requires_core_question() {
    // Arrange：内存库
    let db = mem_db();
    // Act：无 core_question 的 global 拒绝；首个 global 成功
    let missing = create_knowledge_system_inner(&db, "全局".into(), "global".into(), None, None);
    assert!(missing.is_err());
    create_knowledge_system_inner(&db, "全局".into(), "global".into(), None, Some("核心问题".into()))
        .expect("first global");
    // Act：第二个 global 拒绝（预查友好错误）
    let second = create_knowledge_system_inner(&db, "全局2".into(), "global".into(), None, Some("核心问题2".into()));
    // Assert
    assert!(second.is_err());
}

#[test]
fn domain_hangs_on_global_only() {
    let db = mem_db();
    let g = create_knowledge_system_inner(&db, "全局".into(), "global".into(), None, Some("核心问题".into()))
        .expect("global");
    // Act：domain 挂 global 成功
    let d = create_knowledge_system_inner(&db, "领域".into(), "domain".into(), Some(g.id), None).expect("domain");
    assert_eq!(d.parent_system_id, Some(g.id));
    // Act：domain 挂非 global（另一 domain）拒绝
    let d2 = create_knowledge_system_inner(&db, "领域2".into(), "domain".into(), None, None).expect("d2");
    let cross = create_knowledge_system_inner(&db, "领域3".into(), "domain".into(), Some(d2.id), None);
    assert!(cross.is_err());
    // Act：global 带父拒绝
    let g2 = create_knowledge_system_inner(&db, "全局2".into(), "global".into(), Some(g.id), Some("核心问题2".into()));
    assert!(g2.is_err());
    // Act：domain 挂不存在父拒绝
    let d3 = create_knowledge_system_inner(&db, "领域4".into(), "domain".into(), Some(999_999), None);
    assert!(d3.is_err());
}

#[test]
fn update_system_returns_updated_entity() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "待改".into(), "domain".into(), None, None).expect("s");
    // Act：改名 + 置 core_question + 状态
    let updated = update_knowledge_system_inner(&db, s.id, Some("  新  名  ".into()), Some("核心问题".into()), Some("watching".into()))
        .expect("update");
    // Assert：归一化名称落库；core_question/状态更新
    assert_eq!(updated.name, "新 名");
    assert_eq!(updated.core_question.as_deref(), Some("核心问题"));
    assert_eq!(updated.status, "watching");
    // Act：不存在 id 拒绝
    assert!(update_knowledge_system_inner(&db, 999_999, None, None, None).is_err());
}

#[test]
fn archive_system_idempotent() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "将归档".into(), "domain".into(), None, None).expect("s");
    // Act：两次归档
    let a1 = archive_knowledge_system_inner(&db, s.id).expect("a1");
    let a2 = archive_knowledge_system_inner(&db, s.id).expect("a2");
    // Assert：幂等 true；状态 archived
    assert!(a1 && a2);
    assert_eq!(db.get_knowledge_system(s.id).expect("get").expect("exists").status, "archived");
}

#[test]
fn list_systems_roundtrip() {
    let db = mem_db();
    create_knowledge_system_inner(&db, "域一".into(), "domain".into(), None, None).expect("s1");
    create_knowledge_system_inner(&db, "域二".into(), "domain".into(), None, None).expect("s2");
    // Act
    let list = list_knowledge_systems_inner(&db).expect("list");
    // Assert：两体系都在（无筛选）
    assert_eq!(list.len(), 2);
}

// ── inner 编排：节点 ───────────────────────────────────────

#[test]
fn node_parent_cross_system_rejected() {
    let db = mem_db();
    let a = create_knowledge_system_inner(&db, "A".into(), "domain".into(), None, None).expect("a");
    let b = create_knowledge_system_inner(&db, "B".into(), "domain".into(), None, None).expect("b");
    let n1 = add_knowledge_node_inner(&db, a.id, None, "question".into(), "q1".into()).expect("n1");
    // Act：B 体系引用 A 的父节点 → 跨体系拒绝
    let cross = add_knowledge_node_inner(&db, b.id, Some(n1.id), "question".into(), "q2".into());
    assert!(cross.is_err());
    // Act：父不存在拒绝
    assert!(add_knowledge_node_inner(&db, b.id, Some(999_999), "question".into(), "q".into()).is_err());
    // Act：同体系父合法
    let child = add_knowledge_node_inner(&db, a.id, Some(n1.id), "scenario".into(), "子场景".into()).expect("child");
    assert_eq!(child.parent_id, Some(n1.id));
}

#[test]
fn node_name_normalized_persisted() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    // Act：节点文本归一化
    let n = add_knowledge_node_inner(&db, s.id, None, "question".into(), "  子   问题  ".into()).expect("n");
    let c = add_knowledge_node_inner(&db, s.id, None, "question".into(), "  scenario? ".into()).expect("c");
    // Assert：落库为折叠空白
    assert_eq!(n.text, "子 问题");
    assert_eq!(c.text, "scenario?");
}

#[test]
fn delete_node_and_list() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let n = add_knowledge_node_inner(&db, s.id, None, "question".into(), "q".into()).expect("n");
    let list = list_knowledge_nodes_inner(&db, s.id).expect("list");
    assert_eq!(list.len(), 1);
    // Act：删除后再列
    assert!(delete_knowledge_node_inner(&db, n.id).expect("del"));
    assert!(delete_knowledge_node_inner(&db, 999_999).is_err());
    assert!(list_knowledge_nodes_inner(&db, s.id).expect("after").is_empty());
}

#[test]
fn update_node_returns_updated_entity() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let n = add_knowledge_node_inner(&db, s.id, None, "question".into(), "旧问题".into()).expect("n");
    // Act：改文本（归一化）+ 排序 + 状态
    let u = update_knowledge_node_inner(&db, n.id, Some("  新   问题 ".into()), Some(3), Some("watching".into())).expect("u");
    // Assert：归一化文本落库；排序/状态更新；不存在 id 拒绝
    assert_eq!(u.text, "新 问题");
    assert_eq!(u.order_idx, 3);
    assert_eq!(u.status, "watching");
    assert!(update_knowledge_node_inner(&db, 999_999, None, None, None).is_err());
}

// ── inner 编排：概念 ───────────────────────────────────────

#[test]
fn concept_duplicate_rejected_and_normalized_duplicate_rejected() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    add_knowledge_concept_inner(&db, s.id, "熵 减".into(), None, None, None).expect("add");
    // Act：同名直接冲突
    assert!(add_knowledge_concept_inner(&db, s.id, "熵 减".into(), None, None, None).is_err());
    // Act：归一化后同名冲突（" 熵  减 " vs "熵 减"）
    assert!(add_knowledge_concept_inner(&db, s.id, " 熵  减 ".into(), None, None, None).is_err());
}

#[test]
fn concept_name_normalized_and_update_rename_dedup() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let c = add_knowledge_concept_inner(&db, s.id, " 核心   概念 ".into(), None, None, None).expect("c");
    // Assert：名称归一化落库（find_concept_by_name 用归一化名——直接查即可命中）
    assert_eq!(c.name, "核心 概念");
    assert_eq!(db.find_concept_by_name("核心 概念").expect("find").expect("exists").id, c.id);
    // Act：改名查重——改成既有名（另一概念）拒绝；改自身（同一概念同名）允许
    let other = add_knowledge_concept_inner(&db, s.id, "另一概念".into(), None, None, None).expect("other");
    assert!(update_knowledge_concept_inner(&db, other.id, Some("核心 概念".into()), None, None, None, None).is_err());
    let same = update_knowledge_concept_inner(&db, c.id, Some("核心 概念".into()), None, None, None, None).expect("same");
    assert_eq!(same.id, c.id);
}

#[test]
fn list_concepts_filter_by_status() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let c = add_knowledge_concept_inner(&db, s.id, "概念".into(), None, None, None).expect("c");
    update_knowledge_concept_inner(&db, c.id, None, None, None, None, Some("watching".into())).expect("update");
    // Act：按状态过滤
    let watching = list_knowledge_concepts_inner(&db, Some(s.id), Some("watching".into())).expect("watching");
    let core = list_knowledge_concepts_inner(&db, Some(s.id), Some("core".into())).expect("core");
    assert_eq!(watching.len(), 1);
    assert_eq!(core.len(), 0);
    // Act：非法状态拒绝
    assert!(list_knowledge_concepts_inner(&db, Some(s.id), Some("bogus".into())).is_err());
}

// ── inner 编排：模型 ───────────────────────────────────────

#[test]
fn model_disciplines_json_validated_and_persisted() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    // Act：合法 JSON 数组 → 落库为紧凑 JSON
    let m = add_knowledge_model_inner(&db, s.id, "模型".into(), r#"[" 数学 ","物理"]"#.into(), None, None, None).expect("m");
    assert_eq!(m.disciplines, r#"["数学","物理"]"#);
    // Act：空数组/非法 JSON 拒绝
    assert!(add_knowledge_model_inner(&db, s.id, "坏".into(), "[]".into(), None, None, None).is_err());
    assert!(add_knowledge_model_inner(&db, s.id, "坏".into(), "not-json".into(), None, None, None).is_err());
}

#[test]
fn update_model_and_list() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let m = add_knowledge_model_inner(&db, s.id, "模型".into(), r#"["数学"]"#.into(), None, None, None).expect("m");
    // Act：更新学科 JSON + 状态
    let u = update_knowledge_model_inner(&db, m.id, None, Some(r#"["数学","物理"]"#.into()), None, None, None, Some("watching".into())).expect("u");
    assert_eq!(u.disciplines, r#"["数学","物理"]"#);
    assert_eq!(u.status, "watching");
    // Act：列表 + 非法 disciplines 拒绝
    assert_eq!(list_knowledge_models_inner(&db, s.id).expect("list").len(), 1);
    assert!(update_knowledge_model_inner(&db, m.id, None, Some("[]".into()), None, None, None, None).is_err());
}

// ── inner 编排：引用 ───────────────────────────────────────

#[test]
fn link_requires_at_least_one_entity() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    // Act：node/concept/model 全 None → 拒绝
    let r = link_knowledge_target_inner(&db, s.id, None, None, None, "note".into(), 1);
    assert!(r.is_err());
}

#[test]
fn link_cross_system_entity_rejected() {
    let db = mem_db();
    let a = create_knowledge_system_inner(&db, "A".into(), "domain".into(), None, None).expect("a");
    let b = create_knowledge_system_inner(&db, "B".into(), "domain".into(), None, None).expect("b");
    let na = add_knowledge_node_inner(&db, a.id, None, "question".into(), "q".into()).expect("na");
    // Act：B 体系引用 A 的节点 → 跨体系拒绝（先于 target 存在性）
    assert!(link_knowledge_target_inner(&db, b.id, Some(na.id), None, None, "note".into(), 1).is_err());
}

#[test]
fn link_target_not_exists_rejected() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let n = add_knowledge_node_inner(&db, s.id, None, "question".into(), "q".into()).expect("n");
    // Act：目标不存在
    assert!(link_knowledge_target_inner(&db, s.id, Some(n.id), None, None, "note".into(), 999_999).is_err());
}

#[test]
fn link_four_target_types_exist() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let n = add_knowledge_node_inner(&db, s.id, None, "question".into(), "q".into()).expect("n");
    // Arrange：四类目标各建一条（组/笔记/闪卡/碎片）
    let group = db.create_group(&NewNoteGroup {
        name: "组".into(), terrain: "container".into(), kind: "standalone".into(),
        domain_tag: None, source: "route".into(), series_key: None, route_reason: None,
    }).expect("group");
    let note = db.create_note(&NewNote {
        title: "笔记".into(), content: "x".into(), source: "manual".into(), session_id: None,
        rule_version: None, purify_stats: None, tags: None, properties: None, group_id: Some(group.id),
    }).expect("note");
    let card = db.create_card(&NewFlashcard {
        group_id: group.id, note_id: Some(note.id), fragment_id: None, front: "f".into(),
        back: "b".into(), kind: "fact".into(), state_json: "{}".into(), due_at: 0,
    }).expect("card");
    let frag = db.create_fragment(&NewFragment {
        text: "碎片".into(), image_path: None, domain_tag: None, group_id: Some(group.id), source: "manual".into(),
    }).expect("frag");
    // Act：四种 target 类型各引用一次
    let l1 = link_knowledge_target_inner(&db, s.id, Some(n.id), None, None, "note_group".into(), group.id).expect("lg");
    let l2 = link_knowledge_target_inner(&db, s.id, Some(n.id), None, None, "note".into(), note.id).expect("ln");
    let l3 = link_knowledge_target_inner(&db, s.id, Some(n.id), None, None, "flashcard".into(), card.id).expect("lc");
    let l4 = link_knowledge_target_inner(&db, s.id, Some(n.id), None, None, "fragment".into(), frag.id).expect("lf");
    // Assert：类型与 target_id 正确
    assert_eq!(l1.target_type, "note_group");
    assert_eq!(l1.target_id, group.id);
    assert_eq!(l2.target_type, "note");
    assert_eq!(l2.target_id, note.id);
    assert_eq!(l3.target_type, "flashcard");
    assert_eq!(l3.target_id, card.id);
    assert_eq!(l4.target_type, "fragment");
    assert_eq!(l4.target_id, frag.id);
}

#[test]
fn link_idempotent_and_delete() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    let n = add_knowledge_node_inner(&db, s.id, None, "question".into(), "q".into()).expect("n");
    // 目标存在（用不存在的 id 会拒绝——先建一个 group 作合法 target）
    let group = db.create_group(&NewNoteGroup {
        name: "组".into(), terrain: "container".into(), kind: "standalone".into(),
        domain_tag: None, source: "route".into(), series_key: None, route_reason: None,
    }).expect("group");
    // Act：两次同 target 引用 → 幂等返回现有（不重复建链）
    let l1 = link_knowledge_target_inner(&db, s.id, Some(n.id), None, None, "note_group".into(), group.id).expect("l1");
    let l2 = link_knowledge_target_inner(&db, s.id, Some(n.id), None, None, "note_group".into(), group.id).expect("l2");
    assert_eq!(l1.id, l2.id);
    assert_eq!(list_knowledge_links_inner(&db, Some(s.id), None, None, None).expect("list").len(), 1);
    // Act：删除引用后幂等（重复删除不报错）
    assert!(delete_knowledge_link_inner(&db, l1.id).expect("del"));
    assert!(list_knowledge_links_inner(&db, Some(s.id), None, None, None).expect("after").is_empty());
}

// ── inner 编排：审计 ───────────────────────────────────────

#[test]
fn audit_signal_aggregation_counts_and_ms() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    // Arrange：3 节点 + 2 概念 + 1 模型
    for i in 0..3 {
        add_knowledge_node_inner(&db, s.id, None, "question".into(), format!("q{}", i)).expect("node");
    }
    add_knowledge_concept_inner(&db, s.id, "概念甲".into(), None, None, None).expect("c1");
    add_knowledge_concept_inner(&db, s.id, "概念乙".into(), None, None, None).expect("c2");
    add_knowledge_model_inner(&db, s.id, "模型".into(), r#"["数学"]"#.into(), None, None, None).expect("m");
    // Act：审计探测
    let result = audit_due_for_system_inner(&db, s.id).expect("audit");
    // Assert：item_count 聚合；last_audit 从未审计=None；ms 换算
    assert_eq!(result.signal.item_count, 6);
    assert_eq!(result.signal.last_audit_at_ms, None);
    assert_eq!(result.signal.created_at_ms, (s.created_at.max(0) as u64) * 1000);
    assert!(result.signal.now_ms >= result.signal.created_at_ms);
    // 刚建体系未到 90 天 → 不触发
    assert!(!result.due);
}

#[test]
fn audit_signal_records_last_audit() {
    let db = mem_db();
    let s = create_knowledge_system_inner(&db, "域".into(), "domain".into(), None, None).expect("s");
    // Act：记录一次审计后
    db.add_knowledge_audit(s.id, "[]", "{}").expect("audit");
    let result = audit_due_for_system_inner(&db, s.id).expect("audit");
    // Assert：last_audit_at_ms 为毫秒（秒×1000）
    let last = result.signal.last_audit_at_ms.expect("last");
    assert!(last > 0);
    assert_eq!(last % 1000, 0);
}
