//! 标签颜色数据层（v0.14 B 视觉系统）。
//!
//! @ai-context: tag_colors 表读写（tag 文本主键——tags 无独立表，规格 tag_id
//!              前提不存在，按最小合理偏差用 tag 名称作键）。命令层薄壳调用
//!              本层；内存库单测覆盖往返/覆盖/幂等（环境隔离）。
//!
//! @ai-context: 批 7 T18（规格 §1 L5 行 35「`tag_colors` 补种子/迁移」）——本表此前
//!              **零种子、零回填**（全仓唯一的 INSERT 是 `set_tag_color` 的 upsert）⇒
//!              存量标签在过滤面板恒无色。补偿形态 = 本层的**幂等回填**
//!              `backfill_tag_colors`，由 `db.rs` 的 `Db::open` 每次开库调用一次
//!              （失败仅告警不阻断启动，同 uid 回填范式）。

use std::collections::BTreeSet;

use rusqlite::{params, Connection};

use crate::db::Db;
use crate::error::Result;

/// 标签颜色条目（tag → 色板 id）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagColor {
    pub tag: String,
    pub color: String,
}

/// 12 色板 id（**顺序即确定性取色的索引**）。
///
/// @ai-context: 真源 = 前端 `app/src/utils/colorPalette.ts` 的 `COLOR_PALETTE`
///              （`COLOR_IDS = Object.keys(COLOR_PALETTE)` ⇒ 键序 = 本数组顺序）。
///              本数组是它在 Rust 侧的**唯一副本**，两处必须逐字同序：
///              `color_ids_match_frontend_palette` 单测用 `include_str!` 直读真源比对，
///              单边漂移即红（否则回填写进去的 id 会落到 `paletteHex` 的默认灰）。
pub(crate) const TAG_COLOR_PALETTE_IDS: [&str; 12] = [
    "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "gray", "black",
    "white",
];

/// 标签 → 确定性色板 id（FNV-1a 64 位纯算术 ⇒ 与机器 / 平台 / 进程无关）。
///
/// @ai-context: 为什么不用 `DefaultHasher` / `RandomState`：两者都是**进程级随机种子** ⇒
///              同一标签在不同启动会算出不同颜色，「确定性分配」这条硬约束（C2.3）就不成立
///              （`INSERT OR IGNORE` 只挡住覆盖，挡不住规则本身不可复算；测试也无从复算）。
///              FNV-1a 的初值与质数写死在代码里，单测可逐字复算、node 探针可独立对拍。
pub(crate) fn deterministic_tag_color(tag: &str) -> &'static str {
    const FNV_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = FNV_OFFSET_BASIS;
    for byte in tag.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    TAG_COLOR_PALETTE_IDS[(hash % TAG_COLOR_PALETTE_IDS.len() as u64) as usize]
}

/// 解析 `notes.tags` 的 JSON 数组文本（非数组 / 损坏 JSON / 非字符串项一律跳过）。
///
/// @ai-context: 防御性——`tags` 列是 TEXT NOT NULL DEFAULT '[]'，历史行可能被手工改坏；
///              回填是增强路径，遇到坏数据**跳过而不是报错**（不阻断开库，见 `Db::open`）。
fn parse_tag_array(raw: Option<&str>) -> Vec<String> {
    let Some(text) = raw else { return Vec::new() };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else { return Vec::new() };
    let Some(items) = value.as_array() else { return Vec::new() };
    items
        .iter()
        .filter_map(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// 回填实现（自由函数：不持 `Db`，供数据层方法与单测直调；锁由调用方持有）。
fn backfill_tag_colors(conn: &Connection) -> Result<usize> {
    // ① 收集 `notes.tags` 里已出现的**去重**标签（BTreeSet ⇒ 遍历序确定，便于复算）
    let mut tags: BTreeSet<String> = BTreeSet::new();
    {
        let mut stmt = conn.prepare("SELECT tags FROM notes")?;
        let rows = stmt.query_map([], |row| row.get::<_, Option<String>>(0))?;
        for raw in rows {
            for tag in parse_tag_array(raw?.as_deref()) {
                tags.insert(tag);
            }
        }
    }
    // ② `INSERT OR IGNORE`：已存在的行（用户设过的色）一字不动；重复调用返回 0
    let mut inserted = 0usize;
    for tag in &tags {
        inserted += conn.execute(
            "INSERT OR IGNORE INTO tag_colors (tag, color) VALUES (?1, ?2)",
            params![tag, deterministic_tag_color(tag)],
        )?;
    }
    Ok(inserted)
}

impl Db {
    /// 全部标签颜色（空表返回空数组，非错误）。
    pub fn list_tag_colors(&self) -> Result<Vec<TagColor>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT tag, color FROM tag_colors ORDER BY tag")?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(TagColor {
                        tag: row.get(0)?,
                        color: row.get(1)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
    }

    /// 单标签颜色（无 → None；前端渲染回退默认灰用）。
    ///
    /// @ai-context: lib 内暂无生产调用方（前端 list 全量拉取，单查 API 保留为
    ///              诊断/未来增量渲染用）；测试目标已覆盖，登记 dead_code
    ///              豁免（机制先行模式，watermark_cluster 先例）。
    #[allow(dead_code)]
    pub fn get_tag_color(&self, tag: &str) -> Result<Option<String>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT color FROM tag_colors WHERE tag = ?1")?;
            let mut rows = stmt.query_map(params![tag], |row| row.get::<_, String>(0))?;
            match rows.next() {
                Some(Ok(c)) => Ok(Some(c)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 设置标签颜色（upsert：已存在覆盖；重复调用幂等）。
    pub fn set_tag_color(&self, tag: &str, color: &str) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO tag_colors (tag, color) VALUES (?1, ?2)
                 ON CONFLICT(tag) DO UPDATE SET color = excluded.color",
                params![tag, color],
            )?;
            Ok(())
        })
    }

    /// 重置标签颜色（删除条目；不存在时静默成功——幂等）。
    pub fn reset_tag_color(&self, tag: &str) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM tag_colors WHERE tag = ?1", params![tag])?;
            Ok(())
        })
    }

    /// 把 `notes.tags` 里已出现的**去重标签**回填成 `tag_colors` 行（**幂等**）。
    ///
    /// @ai-context: 批 7 T18（规格 §1 L5 行 35「`tag_colors` 补种子/迁移」）。三条硬约束
    ///              （C2.3）：① **幂等**（重跑返回 0 且表逐字不变）② **不覆盖用户已设色**
    ///              （等价 `INSERT OR IGNORE`）③ **不改 schema 主键语义**
    ///              （`tag TEXT PRIMARY KEY` 一字不动）。
    /// @ai-context: 形态为何落在数据层而不是 `db_migrations.rs`：后者 573 行、距 600 硬限仅 27
    ///              （`docs/standards/line-limit-exemptions.md:25`），且本仓已有「每次开库跑一次
    ///              的幂等回填」先例（`db_uid::backfill_table`，`db.rs` 的 `Db::open`）
    ///              ⇒ 回填住 `db_colors.rs`、由 `Db::open` 调用，不引入迁移版本表。
    /// 副作用：写 `tag_colors`（**只增不覆盖**）。返回本次新增行数（幂等重跑 ⇒ 0）。
    pub fn backfill_tag_colors(&self) -> Result<usize> {
        self.with_conn(backfill_tag_colors)
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；同 db_notes 模式）。
#[cfg(test)]
#[path = "db_colors_tests.rs"]
mod tests;
