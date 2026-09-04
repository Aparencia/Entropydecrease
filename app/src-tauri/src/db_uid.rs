//! 笔记/会话对外不可变 uid（REQ-277，v0.19.4）。
//!
//! @ai-context Why：用户痛点 = AI 任务域裸数字 id 上屏 + 未来导出/深链/跨设备
//!               合并需要稳定可读身份。库内 INTEGER 主键**不动**（35 表重建 +
//!               无迁移框架的成本核算否决——见 docs/versions/v0.19.4.md §4），
//!               notes/sessions 各增 `uid TEXT UNIQUE` 作为对外身份。
//! @ai-context 形态：`<kind>-YYYYMMDD-<6位 base36>`（n=笔记/s=会话；示例
//!               `n-20260904-x7f2k9`）。日期取 UTC（与内部 unix 时间同基准、
//!               跨时区稳定——uid 是可读标识而非用户可见日期）；后缀 = fnv1a64
//!               (kind:id:created_at) 的确定性哈希（同库确定性、无需随机源、
//!               不暴露自增序），唯一索引 + 冲突重试（salt 递增）兜底。
//! @ai-context 性质：创建即生成、永不修改；内部数字 FK/localStorage 键/命令
//!               入参保持不动；消费端（导出/深链/日志 uid 化）后续铺开。
//! @ai-context 兼容：表缺 uid 列（测试手工旧 schema）时静默跳过——uid 为
//!               身份增强非关键路径，绝不阻断插入/启动。
//!
//! 注意：表名仅取本模块常量（TAB_*）——禁止外部传表名拼 SQL。

use rusqlite::{params, Connection};

/// notes 表常量（仅供本模块回填/确保用——内部固定字符串拼接，无注入面）
pub const TAB_NOTES: &str = "notes";
/// sessions 表常量
pub const TAB_SESSIONS: &str = "sessions";
/// 笔记 uid 前缀
pub const KIND_NOTE: char = 'n';
/// 会话 uid 前缀
pub const KIND_SESSION: char = 's';

/// 冲突重试上限（salt 0..=8——同秒同 id 哈希冲突概率极低，9 次后放弃留 NULL，
/// 下次启动回填再试：永不阻塞主路径）
const MAX_SALT_RETRY: u32 = 8;
/// 36^6（uid 后缀空间——u64 运算防溢出）
const SUFFIX_SPACE: u64 = 36u64.pow(6);

/// fnv1a64（offset basis / prime——纯 std，确定性）
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// unix 秒 → UTC 日期 YYYYMMDD（Hinnant civil_from_days——无 chrono 依赖；
/// created_at ≥0，负秒仅理论防御仍正确）
pub(crate) fn date_from_epoch(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    let yy = if m <= 2 { y + 1 } else { y };
    format!("{yy:04}{m:02}{d:02}")
}

/// 定长 base36（宽度不足补 '0'——uid 后缀定宽可排序可辨识）
fn to_base36(mut v: u64, width: usize) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut s = vec![b'0'; width];
    for i in (0..width).rev() {
        s[i] = DIGITS[(v % 36) as usize];
        v /= 36;
    }
    String::from_utf8(s).expect("base36 恒为 ASCII")
}

/// 生成候选 uid（salt=冲突重试序号；确定性——同参恒同值）
pub fn make_uid(kind: char, id: i64, created_at: i64, salt: u32) -> String {
    let seed = format!("{kind}:{id}:{created_at}");
    let h = fnv1a64(seed.as_bytes())
        .wrapping_add(u64::from(salt).wrapping_mul(0x9e37_79b9_7f4a_7c15));
    format!("{kind}-{}-{}", date_from_epoch(created_at), to_base36(h % SUFFIX_SPACE, 6))
}

/// 表是否含 uid 列（旧库迁移前/测试手工 schema 兼容判断）
fn has_uid_column(conn: &Connection, table: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let cols = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(cols.iter().any(|c| c == "uid"))
}

fn uid_exists(conn: &Connection, table: &str, uid: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("SELECT 1 FROM {table} WHERE uid = ?1"))?;
    let mut rows = stmt.query_map(params![uid], |_| Ok(()))?;
    Ok(rows.next().transpose()?.is_some())
}

/// 存量回填：为 `uid IS NULL` 的行生成 uid（幂等——只补 NULL；重复调用零更新）。
/// 返回本次补写行数。表缺列 → Ok(0)（兼容旧 schema 测试）。
pub fn backfill_table(conn: &Connection, table: &str, kind: char) -> rusqlite::Result<usize> {
    if !has_uid_column(conn, table)? {
        return Ok(0);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT id, created_at FROM {table} WHERE uid IS NULL ORDER BY id"
    ))?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
    let mut updated = 0usize;
    for row in rows {
        let (id, created_at) = row?;
        if ensure_row_uid(conn, table, kind, id, created_at)? {
            updated += 1;
        }
    }
    Ok(updated)
}

/// 单行确保：插入后为无 uid 的新行生成 uid（幂等——已有 uid 则跳过）。
pub fn ensure_uid(
    conn: &Connection,
    table: &str,
    kind: char,
    id: i64,
    created_at: i64,
) -> rusqlite::Result<()> {
    if !has_uid_column(conn, table)? {
        return Ok(()); // 旧 schema（测试）——uid 为身份增强，缺列不阻断
    }
    let _ = ensure_row_uid(conn, table, kind, id, created_at)?;
    Ok(())
}

/// 冲突重试写入（salt 0..=MAX；唯一索引冲突即换盐；全失败留 NULL 下次再补）
fn ensure_row_uid(
    conn: &Connection,
    table: &str,
    kind: char,
    id: i64,
    created_at: i64,
) -> rusqlite::Result<bool> {
    // 闭包内以 Option<String> 读取——NULL 安全（query_row 外层 optional() 不
    // 豁免列级 NULL，须在 row 读取层处理）
    let existing: Option<String> = conn.query_row(
        &format!("SELECT uid FROM {table} WHERE id = ?1"),
        params![id],
        |r| r.get::<_, Option<String>>(0),
    )?;
    if existing.as_deref().is_some_and(|u| !u.is_empty()) {
        return Ok(false); // 已有 uid（幂等）
    }
    for salt in 0..=MAX_SALT_RETRY {
        let uid = make_uid(kind, id, created_at, salt);
        if !uid_exists(conn, table, &uid)? {
            conn.execute(
                &format!("UPDATE {table} SET uid = ?1 WHERE id = ?2"),
                params![uid, id],
            )?;
            return Ok(true);
        }
    }
    eprintln!("[db_uid] {table} id={id} uid 冲突重试耗尽（留 NULL 下轮回填）");
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn date_from_epoch_known_epochs() {
        assert_eq!(date_from_epoch(0), "19700101");
        // 2024-02-29T00:00:00Z（闰年边界）
        assert_eq!(date_from_epoch(1_709_164_800), "20240229");
        // 2026-09-04T00:00:00Z
        assert_eq!(date_from_epoch(1_788_480_000), "20260904");
    }

    #[test]
    fn make_uid_shape_stable_and_deterministic() {
        let a = make_uid(KIND_NOTE, 42, 1_788_480_000, 0);
        let b = make_uid(KIND_NOTE, 42, 1_788_480_000, 0);
        assert_eq!(a, b, "同参必须确定性");
        assert!(a.starts_with("n-20260904-"), "形态 n-YYYYMMDD-xxxxxx: {a}");
        assert_eq!(a.len(), 17, "n-(1)+9+1+6 = 17 字符: {a}");
        assert_ne!(make_uid(KIND_NOTE, 43, 1_788_480_000, 0), a, "id 参与哈希");
        assert_ne!(make_uid(KIND_SESSION, 42, 1_788_480_000, 0), a, "kind 参与哈希");
        assert_ne!(make_uid(KIND_NOTE, 42, 1_788_480_000, 1), a, "salt 换值");
    }

    #[test]
    fn backfill_idempotent_and_only_null_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                uid TEXT
            );
            INSERT INTO notes (created_at, uid) VALUES (1767398400, NULL), (1767398400, 'keep-me'), (1767484800, NULL);",
        )
        .unwrap();
        let first = backfill_table(&conn, TAB_NOTES, KIND_NOTE).unwrap();
        assert_eq!(first, 2, "两行 NULL 被补写");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes WHERE uid IS NULL", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
        let has_keep: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes WHERE uid = 'keep-me'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(has_keep, 1, "既有 uid 不被覆盖");
        let second = backfill_table(&conn, TAB_NOTES, KIND_NOTE).unwrap();
        assert_eq!(second, 0, "幂等：二次回填零更新");
        // 唯一性（同一 schema 下全量 uid 互异）
        let distinct: i64 = conn
            .query_row("SELECT COUNT(DISTINCT uid) FROM notes", [], |r| r.get(0))
            .unwrap();
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(distinct, total);
    }

    #[test]
    fn ensure_uid_fills_new_row_and_skips_existing() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at INTEGER NOT NULL,
                uid TEXT
            );
            INSERT INTO sessions (id, started_at, uid) VALUES (1, 1767398400, NULL), (2, 1767398400, 's-20260904-zzzzzz');",
        )
        .unwrap();
        ensure_uid(&conn, TAB_SESSIONS, KIND_SESSION, 1, 1_788_480_000).unwrap();
        ensure_uid(&conn, TAB_SESSIONS, KIND_SESSION, 2, 1_788_480_000).unwrap();
        let u1: String = conn
            .query_row("SELECT uid FROM sessions WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert!(u1.starts_with("s-20260904-"));
        let u2: String = conn
            .query_row("SELECT uid FROM sessions WHERE id = 2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(u2, "s-20260904-zzzzzz", "已有 uid 不被覆盖");
    }

    #[test]
    fn missing_uid_column_is_noop() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE notes (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL);")
            .unwrap();
        assert_eq!(backfill_table(&conn, TAB_NOTES, KIND_NOTE).unwrap(), 0);
        ensure_uid(&conn, TAB_NOTES, KIND_NOTE, 1, 0).unwrap(); // 不 panic
    }
}
