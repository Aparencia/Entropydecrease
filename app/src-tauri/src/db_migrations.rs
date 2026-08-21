//! SQLite schema 建表与列迁移（H3 拆分自 db.rs）。
//!
//! @ai-context: db.rs 超 600 行硬拆——建表 SQL + ensure_column 列迁移内聚于本模块；
//!              db.rs 只保留 Db 结构体定义、连接/锁管理与核心通用方法。
//! @ai-context: init_schema 幂等——新库建表、旧库补列/补索引，重复启动安全。
//!              公共 API 签名不变（Db::open 行为与拆分前完全一致）。

use rusqlite::Connection;

use crate::error::Result;

/// 初始化全部核心 schema（建表 + 索引 + 旧库列迁移 + 子模块表）。
///
/// @ai-context: CREATE TABLE IF NOT EXISTS 只对新库生效；既有数据库缺列时靠
///              ensure_column ALTER 补齐（每列迁移的 Why 见调用处注释）。
pub(crate) fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        -- 会话主表（ADR-004：每次学习 = 一个会话）
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            source_window TEXT,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            status TEXT NOT NULL DEFAULT 'recording',
            -- v0.5.0 M1（REQ-043）：视频类型档案标识（kebab-case；NULL=默认档案）
            profile TEXT
        );
        -- 会话转写段（ASR final / 字幕 / 融合统一落库）
        CREATE TABLE IF NOT EXISTS session_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            text TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'asr',
            confidence REAL
        );
        CREATE INDEX IF NOT EXISTS idx_segments_session ON session_segments(session_id, start_ms);
        -- 会话 OCR 块（字幕区 / 全帧）
        CREATE TABLE IF NOT EXISTS session_ocr_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            timestamp_ms INTEGER NOT NULL,
            text TEXT NOT NULL,
            score REAL NOT NULL,
            region TEXT NOT NULL DEFAULT 'full',
            -- v0.5.0 M4（REQ-048）：来源版面区域类型（kebab-case；NULL=整帧直跑）
            region_kind TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_ocr_blocks_session ON session_ocr_blocks(session_id, timestamp_ms);
        -- v0.5.0 M7（REQ-052）：会话产物块（会话 1:1 产物，块有序；payload JSON）
        CREATE TABLE IF NOT EXISTS artifact_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            refs_json TEXT NOT NULL DEFAULT '{}',
            payload_json TEXT NOT NULL,
            block_order INTEGER NOT NULL,
            source TEXT NOT NULL DEFAULT 'local'
        );
        CREATE INDEX IF NOT EXISTS idx_artifact_session ON artifact_blocks(session_id, block_order);
        -- v0.7.0 M1.5（REQ-108）：会话信号事件表（统一落库——章节检测/实践段标记/周报备数据；
        -- 设计见 docs/archive/2026-08-19/2026-08-19-session-events-table-design.md）
        CREATE TABLE IF NOT EXISTS session_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, timestamp_ms);
        CREATE INDEX IF NOT EXISTS idx_events_kind ON session_events(session_id, kind);
        -- v0.11.0（REQ-195，v4 §7.4 融合点基建）：笔记组——统一产物层唯一容器；
        -- terrain 为管线分叉前提（container/feed），kind 三种形成方式（课程/主题/独立）
        CREATE TABLE IF NOT EXISTS note_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            terrain TEXT NOT NULL DEFAULT 'container',
            kind TEXT NOT NULL DEFAULT 'standalone',
            domain_tag TEXT,
            source TEXT NOT NULL DEFAULT 'route',
            series_key TEXT,
            route_reason TEXT,
            route_overridden INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        -- 课程组幂等键（同一系列名唯一；部分索引仅约束非 NULL）
        CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_series
            ON note_groups(series_key) WHERE series_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_groups_domain ON note_groups(domain_tag);",
    )?;
    // v0.5.0 M1（REQ-043）：旧库迁移——sessions 表补 profile 列（兼容既有数据库）
    ensure_column(conn, "sessions", "profile", "ALTER TABLE sessions ADD COLUMN profile TEXT")?;
    // v0.5.0 M4（REQ-048）：旧库迁移——ocr_blocks 表补 region_kind 列
    ensure_column(
        conn,
        "session_ocr_blocks",
        "region_kind",
        "ALTER TABLE session_ocr_blocks ADD COLUMN region_kind TEXT",
    )?;
    // v0.7.3（REQ-156，ADR-015）：旧库迁移——ocr_blocks 表补屏卡体系两列：
    // bbox=检测框 JSON {x,y,w,h}（帧坐标系）、screen_id=采集时分配的屏号
    // （NULL=旧数据无屏，视图层聚类兜底——ADR-015 决策 1/2）
    ensure_column(
        conn,
        "session_ocr_blocks",
        "bbox",
        "ALTER TABLE session_ocr_blocks ADD COLUMN bbox TEXT",
    )?;
    ensure_column(
        conn,
        "session_ocr_blocks",
        "screen_id",
        "ALTER TABLE session_ocr_blocks ADD COLUMN screen_id INTEGER",
    )?;
    // v0.7.0 M1（REQ-103）：旧库迁移——segments 表补 volume 列
    // （段内平均音量，重点标注音量骤变信号输入；旧数据 None=未知）
    ensure_column(
        conn,
        "session_segments",
        "volume",
        "ALTER TABLE session_segments ADD COLUMN volume REAL",
    )?;
    // v0.7.0 M1.5（REQ-109）：段级元数据列——语速/段前停顿/speaker 影子列
    // （K1 掌握度建模（V1.0）输入：语速=字/秒、停顿=与上段 gap、speaker=V1.0 讲者接线）
    ensure_column(
        conn,
        "session_segments",
        "speech_rate",
        "ALTER TABLE session_segments ADD COLUMN speech_rate REAL",
    )?;
    ensure_column(
        conn,
        "session_segments",
        "pause_ms",
        "ALTER TABLE session_segments ADD COLUMN pause_ms INTEGER",
    )?;
    ensure_column(
        conn,
        "session_segments",
        "speaker",
        "ALTER TABLE session_segments ADD COLUMN speaker TEXT",
    )?;
    // v0.7.1（会话体验批次）：notes 表补 session_id 列——会话↔笔记关联
    // （删除会话 ON DELETE SET NULL：笔记是用户资产，只断关联不删笔记；
    //   旧数据 NULL=未关联，不猜不填——历史 classroom 笔记无法追溯归属）
    ensure_column(
        conn,
        "notes",
        "session_id",
        "ALTER TABLE notes ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL",
    )?;
    // v0.7.5（REQ-171）：notes 表补规则版本/净化统计两列——笔记可回答
    // "用哪版规则生成、滤了什么"；旧笔记 NULL 诚实降级（不猜不填，ADR-014 先例）
    ensure_column(
        conn,
        "notes",
        "rule_version",
        "ALTER TABLE notes ADD COLUMN rule_version TEXT",
    )?;
    ensure_column(
        conn,
        "notes",
        "purify_stats",
        "ALTER TABLE notes ADD COLUMN purify_stats TEXT",
    )?;
    // v0.10.0（REQ-004 增强）：notes 表补 tags/properties/pin 列
    ensure_column(
        conn,
        "notes",
        "tags",
        "ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
    )?;
    ensure_column(
        conn,
        "notes",
        "properties",
        "ALTER TABLE notes ADD COLUMN properties TEXT",
    )?;
    ensure_column(
        conn,
        "notes",
        "pin",
        "ALTER TABLE notes ADD COLUMN pin INTEGER NOT NULL DEFAULT 0",
    )?;
    // 关联查询索引（列表 has_note 子查询 + 笔记页来源跳转共用）
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_session ON notes(session_id)")?;
    // v0.11.0（REQ-195）：notes 补 group_id 列——笔记↔组关联
    // （删组 ON DELETE SET NULL：笔记是用户资产，只断关联不删笔记；
    //   旧数据 NULL=未归组，不猜不填——ADR-014 先例）
    ensure_column(
        conn,
        "notes",
        "group_id",
        "ALTER TABLE notes ADD COLUMN group_id INTEGER REFERENCES note_groups(id) ON DELETE SET NULL",
    )?;
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_group ON notes(group_id)")?;
    // v0.7.7（REQ-183）：结构图记录表（建表幂等——新库建表/旧库补表）
    crate::db_structures::init(conn)?;
    // v0.8.0 M4（REQ-144）：笔记版本快照链 + AI 成本记录（幂等建表）
    crate::db_notes_versions::init(conn)?;
    crate::db_ai_usage::init(conn)?;
    Ok(())
}

/// 幂等列迁移：表已含该列则跳过，否则执行 add_sql（兼容旧库升级）。
///
/// @ai-context: CREATE TABLE IF NOT EXISTS 只对新库生效——既有数据库缺列时必须
///              ALTER 补齐（v0.5.0 M1：sessions.profile）；列存在性经 PRAGMA
///              table_info 检查，重复启动幂等。
fn ensure_column(conn: &Connection, table: &str, column: &str, add_sql: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .iter()
        .any(|name| name == column);
    if !exists {
        conn.execute_batch(add_sql)?;
    }
    Ok(())
}
