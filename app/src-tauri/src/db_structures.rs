//! 结构图记录存储（REQ-183 / v0.7.7）：session_structure_images 表 CRUD。
//!
//! @ai-context: 非线性结构图的持久化元数据（文件在会话目录 struct/，本表记录
//!              归属/类型/坐标/时间/来源）——图库 UI 与将来笔记消费（按屏
//!              screen_id 锚点）的数据源；文件删除由记录驱动。
//! @ai-context: kind/source 为字符串枚举（不动 RegionKind——版面分析模块零
//!              改动）；bbox 为 JSON 帧坐标；旧会话（无 screen_id）NULL 降级。

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::Db;
use crate::error::Result;

/// 结构图记录（前端契约，camelCase）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureImageRecord {
    pub id: i64,
    pub session_id: i64,
    /// 所属屏（NULL=旧数据无屏/手动无屏上下文）
    #[serde(default)]
    pub screen_id: Option<i64>,
    /// table/formula/code/image/manual
    pub kind: String,
    /// 帧坐标 JSON {"x","y","w","h"}
    pub bbox: String,
    /// 裁剪源帧时间戳（屏内选优帧/手动屏 first_seen）
    pub source_ts_ms: u64,
    /// struct/xxx.webp 相对路径
    pub crop_path: String,
    /// auto/manual
    pub source: String,
    pub created_at: u64,
}

/// 建表（幂等；db::open 末尾调用——新库建表 + 旧库补表）。
pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS session_structure_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            screen_id INTEGER,
            kind TEXT NOT NULL,
            bbox TEXT NOT NULL DEFAULT '{}',
            source_ts_ms INTEGER NOT NULL,
            crop_path TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'auto',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_struct_images_session
            ON session_structure_images(session_id, created_at);",
    )?;
    Ok(())
}

/// 插入记录（返回新 id）。
pub fn insert_structure_image(db: &Db, rec: &StructureImageRecord) -> Result<i64> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO session_structure_images
            (session_id, screen_id, kind, bbox, source_ts_ms, crop_path, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            rec.session_id,
            rec.screen_id,
            rec.kind,
            rec.bbox,
            rec.source_ts_ms as i64,
            rec.crop_path,
            rec.source,
            rec.created_at as i64,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 会话结构图列表（按入库时间升序——图库展示顺序）。
pub fn list_structure_images(db: &Db, session_id: i64) -> Result<Vec<StructureImageRecord>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, session_id, screen_id, kind, bbox, source_ts_ms, crop_path, source, created_at
         FROM session_structure_images WHERE session_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt
        .query_map(params![session_id], row_to_record)?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// 按 id 查询记录（纯读；不存在 → Ok(None)）。
/// @ai-context: 审查修复（删除顺序调整）：命令层先取记录删文件、再删记录——
///              文件删除失败时记录保留可重试（避免记录已删文件残留的不一致）。
pub fn get_structure_image(db: &Db, id: i64) -> Result<Option<StructureImageRecord>> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT id, session_id, screen_id, kind, bbox, source_ts_ms, crop_path, source, created_at
         FROM session_structure_images WHERE id = ?1",
        params![id],
        row_to_record,
    )
    .optional()
    .map_err(Into::into)
}
/// 删除记录（返回被删记录——命令层据此删文件；不存在 → Ok(None)）。
pub fn delete_structure_image(db: &Db, id: i64) -> Result<Option<StructureImageRecord>> {
    let existing = get_structure_image(db, id)?;
    if existing.is_some() {
        let conn = db.conn.lock().unwrap();
        conn.execute("DELETE FROM session_structure_images WHERE id = ?1", params![id])?;
    }
    Ok(existing)
}

/// 行 → 记录映射。
fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<StructureImageRecord> {
    Ok(StructureImageRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        screen_id: row.get(2)?,
        kind: row.get(3)?,
        bbox: row.get(4)?,
        source_ts_ms: row.get::<_, i64>(5)? as u64,
        crop_path: row.get(6)?,
        source: row.get(7)?,
        created_at: row.get::<_, i64>(8)? as u64,
    })
}

#[cfg(test)]
#[path = "db_structures_tests.rs"]
mod tests;
