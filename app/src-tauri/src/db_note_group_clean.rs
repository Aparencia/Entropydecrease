//! 笔记组删除行语义与空组自动清理（REQ-316，v0.20.12 批 7）。
//!
//! @ai-context: 用户问题 8——自动路由产生的空组堆积在组侧栏（手动删组需两步
//!              确认，空路由组无治理出口）。本模块提供「仅自动路由空组自动
//!              删除」的共享判定与删除：
//!              ① 谓词 = note_groups.source IN ('route','series')（自动路由/系列
//!                 检测产物）且 route_overridden = 0（用户改判过=修改即记忆，
//!                 REQ-198 永不自动删）；source='manual' 手动建组天然不在白名单。
//!              ② 残留全零 = notes + fragments + flashcards + settlements +
//!                 contracts 五类计数（与 get_group_delete_impact 同口径——SQL
//!                 单点在本模块 group_residue，手动删除影响面复用，防口径漂移）。
//!              ③ 只清理「本次写操作使组变空的组」（调用方在写事务内传入
//!                 affected_group_ids），不存在独立定时/全表清扫任务（用户口径：
//!                 裁决机制是"不留死尸"，自动清理边界=路由产物，见 REQ-294 备注）。
//! @ai-context: 删除语义与手动删组完全一致（不留回收站——全 app 无软删先例）：
//!              knowledge_links 显式清理先于行删 + FK 级联（notes/fragments
//!              SET NULL 无行可移、flashcards/settlements/contracts/orders 级联清
//!              ——空组无残留故级联面实际为空，行删函数仍与 delete_group 共用，
//!              防删除语义双轨）。删组行函数 delete_group_row 同时服务手动删除
//!              （db_note_groups::delete_group）与本自动清理。

use rusqlite::{params, Connection};

/// 已自动清理的组（name 供前端 toast 留痕，须在行删前读出）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanedGroup {
    pub id: i64,
    pub name: String,
}

/// 残留五元计数（与组删除影响面 notes/fragments/cards/settlements/contracts 同口径）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct GroupResidue {
    pub notes: i64,
    pub fragments: i64,
    pub cards: i64,
    pub settlements: i64,
    pub contracts: i64,
}

impl GroupResidue {
    /// 空组判定：五类残留全零才可自动删（任一有值=组仍活着，见文件头 ②）。
    pub fn is_empty(&self) -> bool {
        self.notes == 0
            && self.fragments == 0
            && self.cards == 0
            && self.settlements == 0
            && self.contracts == 0
    }
}

/// 残留计数（单个组；SQL 语义与组删除影响面一致——影响面复用本函数防漂移）。
pub fn group_residue(conn: &Connection, group_id: i64) -> rusqlite::Result<GroupResidue> {
    let count = |sql: &str| -> rusqlite::Result<i64> {
        conn.query_row(sql, params![group_id], |row| row.get::<_, i64>(0))
    };
    Ok(GroupResidue {
        notes: count("SELECT COUNT(*) FROM notes WHERE group_id = ?1")?,
        fragments: count("SELECT COUNT(*) FROM fragments WHERE group_id = ?1")?,
        cards: count("SELECT COUNT(*) FROM flashcards WHERE group_id = ?1")?,
        settlements: count("SELECT COUNT(*) FROM settlements WHERE group_id = ?1")?,
        contracts: count("SELECT COUNT(*) FROM contracts WHERE group_id = ?1")?,
    })
}

/// 删除组行（共享删除语义：knowledge_links 悬空引用显式清理先于行删——links 无
/// FK 到 note_groups；FK 级联面由建表契约生效；行不存在 → false）。
pub fn delete_group_row(conn: &Connection, group_id: i64) -> rusqlite::Result<bool> {
    conn.execute(
        "DELETE FROM knowledge_links WHERE target_type = 'note_group' AND target_id = ?1",
        params![group_id],
    )?;
    // flashcard 间接引用清理（先于级联删行——子查询须在行存在时执行）
    conn.execute(
        "DELETE FROM knowledge_links WHERE target_type = 'flashcard'
         AND target_id IN (SELECT id FROM flashcards WHERE group_id = ?1)",
        params![group_id],
    )?;
    let affected = conn.execute("DELETE FROM note_groups WHERE id = ?1", params![group_id])?;
    Ok(affected > 0)
}

/// 自动路由产物谓词（组行单表可判——source 白名单 + 未改判）。
fn is_auto_route_candidate(conn: &Connection, group_id: i64) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM note_groups
         WHERE id = ?1 AND source IN ('route', 'series') AND route_overridden = 0",
        params![group_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// 空组自动清理（写事务提交前调用——对**本次写操作影响到的组**判定，防全表
/// 扫描误删他组）：自动路由产物 + 残留全零 → 删组；返回实际清理的组。
///
/// @ai-context: 边界（用户口径）——手动建组/改判组/有任意残留组绝不在本函数删除
///              （谓词与残留双闸）；同一事务内检查与删除原子，无"检查后被并发
///              写入"窗口（连接 Mutex 串行化）。重复 id 幂等安全（删除后不再出现）。
pub fn auto_clean_empty_groups(
    conn: &Connection,
    affected_group_ids: &[i64],
) -> rusqlite::Result<Vec<CleanedGroup>> {
    let mut cleaned: Vec<CleanedGroup> = Vec::new();
    for id in affected_group_ids {
        if cleaned.iter().any(|c| c.id == *id) {
            continue; // 重复 id 幂等（同批多次命中只清一次）
        }
        if !is_auto_route_candidate(conn, *id)? {
            continue;
        }
        let residue = group_residue(conn, *id)?;
        if !residue.is_empty() {
            continue;
        }
        let name: String = conn.query_row(
            "SELECT name FROM note_groups WHERE id = ?1",
            params![*id],
            |row| row.get(0),
        )?;
        if delete_group_row(conn, *id)? {
            cleaned.push(CleanedGroup { id: *id, name });
        }
    }
    Ok(cleaned)
}

#[cfg(test)]
#[path = "db_note_group_clean_tests.rs"]
mod tests;
