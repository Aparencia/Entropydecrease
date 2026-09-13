//! db_colors.rs 单测（内存库，环境隔离；v0.14 B 视觉系统）。
//!
//! @ai-context: 批 7 T18 追加三组 —— ① `tag_colors` 幂等回填的四点（C2.3 逐字）② 12 色 id
//!              与前端真源 `colorPalette.ts` 的跨语言对拍 ③ 真 SQLite 文件库上的端到端
//!              「加标签 / 设色 / 清色 → 重新读库」往返（唯一未覆盖的一跳是 Tauri IPC 壳）。

use crate::db::Db;
use crate::types::NewNote;

use super::{deterministic_tag_color, TAG_COLOR_PALETTE_IDS};

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

/// 前端真源（**编译期嵌入**）：`app/src/utils/colorPalette.ts`。
/// 单边漂移（只有一侧改了色板）在这里直接红，不需要任何外部探针。
const FRONTEND_PALETTE_TS: &str = include_str!("../../src/utils/colorPalette.ts");

/// 从真源 TS 的 `COLOR_PALETTE` 字面量里读键序（独立解析，不复用生产代码）。
fn frontend_color_ids() -> Vec<String> {
    let start = FRONTEND_PALETTE_TS
        .find("export const COLOR_PALETTE")
        .expect("真源里找不到 COLOR_PALETTE");
    let block = &FRONTEND_PALETTE_TS[start..];
    let end = block.find("};").expect("COLOR_PALETTE 字面量没有收尾");
    block[..end]
        .lines()
        .filter_map(|line| {
            let (key, rest) = line.trim().split_once(':')?;
            if !rest.trim_start().starts_with('{') {
                return None;
            }
            let key = key.trim();
            let ok = !key.is_empty() && key.chars().all(|c| c.is_ascii_lowercase());
            ok.then(|| key.to_string())
        })
        .collect()
}

/// 造一条带标签的笔记（`notes.tags` = JSON 数组文本，即回填的输入面）。
fn seed_note(db: &Db, title: &str, tags: &[&str]) -> i64 {
    let note = db
        .create_note(&NewNote {
            title: title.to_string(),
            content: String::new(),
            source: "manual".to_string(),
            session_id: None,
            rule_version: None,
            purify_stats: None,
            tags: Some(serde_json::to_string(tags).expect("tags json")),
            properties: None,
            group_id: None,
        })
        .expect("create note");
    note.id
}

#[test]
fn set_get_roundtrip() {
    // Arrange
    let db = mem_db();
    // Act
    db.set_tag_color("化妆", "pink").expect("set");
    // Assert
    assert_eq!(db.get_tag_color("化妆").expect("get").as_deref(), Some("pink"));
    assert_eq!(db.list_tag_colors().expect("list").len(), 1);
}

#[test]
fn upsert_overwrites_existing() {
    // Arrange
    let db = mem_db();
    db.set_tag_color("化妆", "pink").expect("first");
    // Act
    db.set_tag_color("化妆", "purple").expect("second");
    // Assert：覆盖而非新增
    let all = db.list_tag_colors().expect("list");
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].color, "purple");
}

#[test]
fn reset_removes_entry_idempotent() {
    // Arrange
    let db = mem_db();
    db.set_tag_color("化妆", "pink").expect("set");
    // Act
    db.reset_tag_color("化妆").expect("reset");
    // Assert：删除后读不到；重复 reset 幂等不报错
    assert_eq!(db.get_tag_color("化妆").expect("get"), None);
    db.reset_tag_color("化妆").expect("reset again");
    assert!(db.list_tag_colors().expect("list").is_empty());
}

#[test]
fn unknown_tag_returns_none() {
    // Arrange
    let db = mem_db();
    // Act / Assert：无记录返回 None 而非错误
    assert_eq!(db.get_tag_color("不存在").expect("get"), None);
}

#[test]
fn list_orders_by_tag() {
    // Arrange
    let db = mem_db();
    db.set_tag_color("b", "blue").expect("b");
    db.set_tag_color("a", "red").expect("a");
    // Act
    let all = db.list_tag_colors().expect("list");
    // Assert：按 tag 字典序
    assert_eq!(all.iter().map(|t| t.tag.as_str()).collect::<Vec<_>>(), vec!["a", "b"]);
}

// ── 批 7 T18 · `tag_colors` 幂等回填（C2.3 的四点）─────────────────────────────

/// ① 空库：`notes.tags` 全空 ⇒ 回填 0 行、表仍空（不许凭空造行）。
#[test]
fn backfill_empty_db_inserts_nothing() {
    // Arrange
    let db = mem_db();
    // Act
    let inserted = db.backfill_tag_colors().expect("backfill");
    // Assert
    assert_eq!(inserted, 0);
    assert!(db.list_tag_colors().expect("list").is_empty());
}

/// ② 已有标签：2 条笔记共 3 个去重标签 ⇒ 回填 3 行，颜色 = 确定性规则值。
#[test]
fn backfill_seeds_distinct_tags_of_existing_notes() {
    // Arrange：重复标签只算一个（"编程" 出现在两条笔记上）
    let db = mem_db();
    seed_note(&db, "n1", &["化妆", "编程"]);
    seed_note(&db, "n2", &["编程", "乐理"]);
    // Act
    let inserted = db.backfill_tag_colors().expect("backfill");
    // Assert：恰 3 行、逐个标签的颜色等于确定性规则
    assert_eq!(inserted, 3);
    let all = db.list_tag_colors().expect("list");
    assert_eq!(all.len(), 3);
    for row in &all {
        assert_eq!(row.color, deterministic_tag_color(&row.tag), "标签 {} 的颜色不是确定性值", row.tag);
    }
    let mut names: Vec<&str> = all.iter().map(|t| t.tag.as_str()).collect();
    names.sort_unstable();
    assert_eq!(names, vec!["乐理", "化妆", "编程"]);
    // 交叉自证：另一个库（另一条连接）对同一标签给出同一颜色 ⇒ 规则不含进程随机源
    let other = mem_db();
    seed_note(&other, "n1", &["化妆"]);
    other.backfill_tag_colors().expect("backfill other");
    assert_eq!(other.get_tag_color("化妆").expect("get").as_deref(), Some(deterministic_tag_color("化妆")));
}

/// ③ 用户已设色不被覆盖（等价 `INSERT OR IGNORE`）。
#[test]
fn backfill_does_not_override_user_color() {
    // Arrange：用户先显式设色
    let db = mem_db();
    seed_note(&db, "n1", &["化妆"]);
    db.set_tag_color("化妆", "red").expect("user set");
    // 非空真自证：确定性规则给出的默认色**不是** red（否则本用例红不出差别）
    assert_ne!(deterministic_tag_color("化妆"), "red");
    // Act
    let inserted = db.backfill_tag_colors().expect("backfill");
    // Assert：该标签已有行 ⇒ 新增 0，且用户的 red 一字未动
    assert_eq!(inserted, 0);
    assert_eq!(db.get_tag_color("化妆").expect("get").as_deref(), Some("red"));
}

/// ④ 重跑幂等：连续两次 ⇒ 第二次返回 0，且表**逐字**不变。
#[test]
fn backfill_is_idempotent_on_rerun() {
    // Arrange
    let db = mem_db();
    seed_note(&db, "n1", &["化妆", "编程"]);
    assert_eq!(db.backfill_tag_colors().expect("first"), 2);
    let before = db.list_tag_colors().expect("list");
    // Act：第二次
    let second = db.backfill_tag_colors().expect("second");
    // Assert
    assert_eq!(second, 0);
    assert_eq!(db.list_tag_colors().expect("list"), before);
}

// ── 批 7 T18 · 12 色 id 的跨语言对拍（C2.3 第 ②③ 条）────────────────────────

/// Rust 侧 12 色 id 与前端真源 `COLOR_IDS` **同序同集**（`include_str!` 直读真源）。
#[test]
fn color_ids_match_frontend_palette() {
    // Act
    let frontend = frontend_color_ids();
    let rust: Vec<String> = TAG_COLOR_PALETTE_IDS.iter().map(|s| s.to_string()).collect();
    // Assert：先证明解析器没瞎（两侧都得是 12），再逐字比序
    assert_eq!(frontend.len(), 12, "前端真源解析出 {} 个 id（解析器或真源变了）: {frontend:?}", frontend.len());
    assert_eq!(rust.len(), 12, "Rust 侧色板不是 12 个: {rust:?}");
    assert_eq!(rust, frontend, "Rust 侧 12 色 id 与前端真源 COLOR_IDS 不同序 / 不同集");
}

/// 确定性取色的**跨实现**钉住：期望值由本仓 node 探针 `tmp/t18/fnv.mjs` 独立算出
/// （BigInt FNV-1a 64；与 Rust 侧实现各自独立写），逐字抄在这里。
#[test]
fn deterministic_color_matches_independent_probe() {
    for (tag, expected) in [("化妆", "blue"), ("编程", "red"), ("乐理", "gray"), ("x", "white")] {
        assert_eq!(deterministic_tag_color(tag), expected, "标签 {tag} 的确定性取色漂了");
    }
    // 边界：空标签 / 单字符也落在色板内（不 panic、不越界）
    for tag in ["", "a", "标签标签标签标签标签标签标签标签标签标签"] {
        assert!(TAG_COLOR_PALETTE_IDS.contains(&deterministic_tag_color(tag)), "标签 {tag} 取色越界");
    }
}

// ── 批 7 T18 · 端到端（真 SQLite 文件库 + 重开）─────────────────────────────

/// 验收「标签能写进去」的**真库往返**：加标签 → 关闭并重新读库 → 标签仍在（且开库回填
/// 把这两个标签变成 `tag_colors` 行）；设色 → 读回 → 色在；清色 → 读回 → 色无。
///
/// @ai-context: 这是本任务**最强**的一层证据 —— 走的是真实 SQLite 文件（不是 mock），
///              唯一未覆盖的一跳是 Tauri IPC 壳与 WebView（真机不可达，C6.4）。
#[test]
fn e2e_tag_writes_survive_reopen() {
    // Arrange：临时文件库（不触碰真实数据目录）
    let path = std::env::temp_dir().join(format!("entropy_t18_tags_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    let id = {
        let db = Db::open(path.to_str().expect("path utf8")).expect("open file db");
        let note_id = seed_note(&db, "端到端", &[]);
        // Act ①：加标签（生产写端路径 = `update_note_tags` 命令背后的同一数据层方法）
        assert!(db.update_note_tags(note_id, r#"["化妆","编程"]"#).expect("update tags"));
        note_id
    }; // ← db 在此 drop：连接关闭（等价「关掉应用」）
    // Act ②：重新读库
    let db = Db::open(path.to_str().expect("path utf8")).expect("reopen file db");
    let note = db.get_note(id).expect("get note").expect("note 仍在");
    // Assert ①：标签仍在（逐字）
    assert_eq!(note.tags, r#"["化妆","编程"]"#);
    // Assert ②：重开时的幂等回填把这两个标签变成 tag_colors 行（此前该表零种子）
    let seeded = db.list_tag_colors().expect("list after reopen");
    assert_eq!(seeded.len(), 2, "重开未按 notes.tags 回填: {seeded:?}");
    // Act/Assert ③：设色 → 读回 → 色在
    db.set_tag_color("化妆", "purple").expect("set color");
    assert_eq!(db.get_tag_color("化妆").expect("get").as_deref(), Some("purple"));
    // Act/Assert ④：清色 → 读回 → 色无
    db.reset_tag_color("化妆").expect("reset color");
    assert_eq!(db.get_tag_color("化妆").expect("get"), None);
    // 清理
    drop(db);
    let _ = std::fs::remove_file(&path);
}

