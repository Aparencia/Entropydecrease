//! SQLite 数据层：连接与锁管理 + 核心通用方法（REQ-004）。
//!
//! @ai-context: 本地优先——所有数据存本地 SQLite，绝不上云。使用 rusqlite bundled 免系统依赖。
//! @ai-context: Connection 非 Sync，故用 Mutex 包裹以作为 Tauri managed state 跨 command 共享。
//! @ai-context: H3 硬拆（原 678 行 > 600）——schema 建表/列迁移见 db_migrations.rs；
//!              notes 读写见 db_notes.rs（测试 db_notes_tests.rs）；本文件只保留
//!              Db 结构体定义、连接/锁管理与核心通用方法，公共 API 签名不变。

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::error::Result;

/// 笔记数据仓库（线程安全，可廉价克隆——Arc 共享连接）。
#[derive(Clone)]
pub struct Db {
    /// 连接由 Mutex 包裹：Connection 非 Sync，跨 command 共享需串行化。
    /// @ai-context: pub(crate) 供 db_sessions.rs 等跨模块 impl（同一 crate 内部共享）。
    pub(crate) conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// 打开（或创建）数据库并初始化 schema。
    ///
    /// @ai-context: path 传 ":memory:" 可用于测试隔离（不触碰真实文件）。
    /// @ai-context: PRAGMA foreign_keys=ON 必须每个连接开启（rusqlite 默认关闭）；
    ///              删除会话时靠外键级联清理子表（ADR-004）。
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "foreign_keys", true)?;
        // H3 拆分：建表 + 旧库列迁移 + 子模块表全部收敛到 db_migrations
        crate::db_migrations::init_schema(&conn)?;
        // v0.8.0 F2（2026-08-21）：AI 任务中心持久化（任务记录/恢复/保留）
        let db = Self { conn: Arc::new(Mutex::new(conn)) };
        db.init_ai_tasks()?;
        // v0.16.0（REQ-224）：AI 对话持久化（会话/消息双表）
        db.init_ai_chat()?;
        Ok(db)
    }

    /// 连接访问统一入口（M3 修复：锁中毒恢复）。
    ///
    /// @ai-context: Why——原 11 处 `lock().expect` 在任一持锁线程 panic 后全部
    ///              连锁 panic（毒锁传播）；本方法改为 into_inner 恢复：
    ///              Connection 串行使用且 SQLite 事务保证数据一致性，毒锁后
    ///              连接本身仍可安全复用（恢复后先 ROLLBACK 清理孤儿事务）；
    ///              打印警告保持可观测（不静默）。
    /// @ai-context: 本次只迁移原 db.rs 范围内的锁点（db_notes.rs）；
    ///              db_sessions/db_ai_tasks 等其他文件的锁点迁移登记为技术债
    ///              TD-2026-08-21-C（docs/archive/2026-08-21/tech-debt.md）。
    pub(crate) fn with_conn<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(&Connection) -> Result<R>,
    {
        let guard = self.conn.lock().unwrap_or_else(|poisoned| {
            eprintln!("[Db] 连接锁中毒，已用 into_inner 恢复（此前持锁线程可能 panic）");
            let conn = poisoned.into_inner();
            // 孤儿事务兜底（三维复审 #6）：panic 的持锁线程可能停在未提交事务中，
            // 恢复出的连接若携带孤儿事务会阻塞/隐式回滚后续读写。
            // 无未决事务时 SQLite 报"no transaction is active"，忽略即可
            // （仅当确有未决事务时本句才有意义）。
            let _ = conn.execute_batch("ROLLBACK");
            conn
        });
        f(&guard)
    }
}

/// 当前 Unix 秒。
/// @ai-context: pub(crate) 供 db_notes.rs 跨模块复用（时间戳口径统一）。
pub(crate) fn unix_seconds() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// 转义 LIKE 通配符，防止用户输入的 %/_ 被当作通配符。
/// @ai-context: pub(crate) 供 db_sessions.rs / db_notes.rs / db_ocr_search.rs 复用
///              （审查 L7：消除重复实现；M2 修复口径一致性的单点）。
pub(crate) fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}
