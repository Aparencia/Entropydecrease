//! 检索索引·影子表双写与生命周期（REQ-258，v0.19.0；设计 §5.2/§5.3）。
//!
//! @ai-context: kb_chunks/kb_fts 的一切写入收敛于本模块（同事务双写，不依赖
//!              SQLite 触发器与 recursive_triggers）；删除源行前先经本模块清
//!              影子表（kb_chunks 的 FK CASCADE 仅兜底——级联不负责 kb_fts）。
//! @ai-context: 失败纪律——索引错误经 record_index_error 落 kb_meta（error_count/
//!              last_error），**绝不阻断主链路**（保存/删除照常成功；stats 角标
//!              "索引待重建"可见 + reindex_all 兜底，ADR-029 决策 6 三保险）。
//! @ai-context: 实现口径说明（偏离 spec 草案"保存后 spawn_blocking 静默重索引"
//!              字面）：单笔记重索引为毫秒级 DELETE+INSERT，且 Db 连接本由
//!              Mutex 串行——异步线程只把开销移出事务却引入同笔记两次快速保存
//!              的**索引乱序竞态**（旧内容后写覆盖新内容）；改为保存事务内同步
//!              重建（单点收口 + 零竞态 + 不阻塞 UI 的量级不变），重建失败仍
//!              软记录不反悔保存。

use rusqlite::{Connection, OptionalExtension};

use crate::db::unix_seconds;
use crate::kb_chunk::{chunk_fragment, chunk_note};

/// 派生索引格式版本（索引语义变更/embedding 接入时 +1——与 kb_meta 不符即
/// 触发前端"索引待重建"角标；reindex_all 落当前值）。
pub const KB_INDEX_VERSION: i64 = 1;

pub(crate) const META_INDEX_VERSION: &str = "index_version";
pub(crate) const META_REINDEX_ALL_AT: &str = "reindex_all_at";
pub(crate) const META_ERROR_COUNT: &str = "error_count";
pub(crate) const META_LAST_ERROR: &str = "last_error";
// ---------- kb_meta 读写（幂等——INSERT OR REPLACE 单键语义） ----------

/// 读 kb_meta（缺失 → None）。
pub(crate) fn meta_get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM kb_meta WHERE key = ?1", [key], |r| r.get(0))
        .optional()
}

/// 写 kb_meta（覆盖语义）。
pub(crate) fn meta_set(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO kb_meta (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

// ---------- 影子表同步（清 → 写，两表同连接/同事务内完成） ----------

/// 清整篇笔记块（kb_fts 先于 kb_chunks——fts 行按 chunk_id 对照删除）。
pub(crate) fn clear_note_chunks(conn: &Connection, note_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM kb_fts WHERE chunk_id IN
            (SELECT id FROM kb_chunks WHERE source_kind='note' AND note_id=?1)",
        [note_id],
    )?;
    conn.execute(
        "DELETE FROM kb_chunks WHERE source_kind='note' AND note_id=?1",
        [note_id],
    )?;
    Ok(())
}

/// 清整块碎片块（语义同 clear_note_chunks）。
pub(crate) fn clear_fragment_chunks(conn: &Connection, fragment_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM kb_fts WHERE chunk_id IN
            (SELECT id FROM kb_chunks WHERE source_kind='fragment' AND fragment_id=?1)",
        [fragment_id],
    )?;
    conn.execute(
        "DELETE FROM kb_chunks WHERE source_kind='fragment' AND fragment_id=?1",
        [fragment_id],
    )?;
    Ok(())
}

/// 写笔记块（先清后写——幂等重建语义；空正文零块）。
pub(crate) fn rebuild_note_chunks(
    conn: &Connection,
    note_id: i64,
    content: &str,
) -> rusqlite::Result<()> {
    clear_note_chunks(conn, note_id)?;
    for c in chunk_note(content) {
        insert_chunk(conn, "note", Some(note_id), None, &c)?;
    }
    Ok(())
}

/// 写碎片块（碎片不可变——一次性索引，无更新路径；空文本零块）。
pub(crate) fn write_fragment_chunks(
    conn: &Connection,
    fragment_id: i64,
    text: &str,
) -> rusqlite::Result<()> {
    for c in chunk_fragment(text) {
        insert_chunk(conn, "fragment", None, Some(fragment_id), &c)?;
    }
    Ok(())
}

/// 单块双写（kb_chunks 行 → kb_fts 影子行；embedding 列留 NULL——v0.19.3）。
fn insert_chunk(
    conn: &Connection,
    kind: &str,
    note_id: Option<i64>,
    fragment_id: Option<i64>,
    c: &crate::kb_chunk::KbChunk,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO kb_chunks (source_kind, note_id, fragment_id, ord, heading, char_start, char_end, text)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            kind,
            note_id,
            fragment_id,
            c.ord as i64,
            c.heading,
            c.char_start as i64,
            c.char_end as i64,
            c.text
        ],
    )?;
    let chunk_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO kb_fts (text, chunk_id) VALUES (?1, ?2)",
        rusqlite::params![c.text, chunk_id],
    )?;
    Ok(())
}

// ---------- 失败可见（软记录——主链路不反悔） ----------

/// 记录索引失败（error_count 自增 + last_error 覆盖——stats/UI 角标数据源）。
/// 记录本身失败只 eprintln（元数据丢失不阻断业务）。
pub(crate) fn record_index_error(conn: &Connection, msg: &str) {
    let count: i64 = meta_get(conn, META_ERROR_COUNT)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let _ = meta_set(conn, META_ERROR_COUNT, &(count + 1).to_string());
    let _ = meta_set(conn, META_LAST_ERROR, msg);
    eprintln!("[kb-index] 索引失败（已记录，主链路不阻断）: {}", msg);
}

/// 重置失败计数（reindex_all 启动时清零——报告即"本次重建"口径）。
pub(crate) fn reset_index_errors(conn: &Connection) {
    let _ = meta_set(conn, META_ERROR_COUNT, "0");
    let _ = meta_set(conn, META_LAST_ERROR, "");
}

/// 供 hooks 的软失败包裹（hook 侧用：失败记录不抛出——主链路无感）。
///
/// @ai-context: 事务内调用时 conn 即事务连接——错误记录与重建同事务
///              （重建失败也能把"失败事实"留在库内，不丢信号）。
pub(crate) fn soft_rebuild_note(conn: &Connection, note_id: i64, content: &str) {
    if let Err(e) = rebuild_note_chunks(conn, note_id, content) {
        record_index_error(conn, &format!("笔记 {} 重索引失败: {}", note_id, e));
    }
}

pub(crate) fn soft_clear_note(conn: &Connection, note_id: i64) {
    if let Err(e) = clear_note_chunks(conn, note_id) {
        record_index_error(conn, &format!("笔记 {} 清块失败: {}", note_id, e));
    }
}

pub(crate) fn soft_clear_fragment(conn: &Connection, fragment_id: i64) {
    if let Err(e) = clear_fragment_chunks(conn, fragment_id) {
        record_index_error(conn, &format!("碎片 {} 清块失败: {}", fragment_id, e));
    }
}

pub(crate) fn soft_index_fragment(conn: &Connection, fragment_id: i64, text: &str) {
    if let Err(e) = write_fragment_chunks(conn, fragment_id, text) {
        record_index_error(conn, &format!("碎片 {} 索引失败: {}", fragment_id, e));
    }
}

/// 时间戳（kb_meta 落值用——与 db 层 unix_seconds 同口径）。
pub(crate) fn now_seconds() -> i64 {
    unix_seconds()
}

#[cfg(test)]
#[path = "kb_index_tests.rs"]
mod tests;
