//! AI 任务持久化（F2 任务中心，2026-08-21；REQ-145 扩展）。
//!
//! @ai-context: 任务注册表在 AppState 内存（HashMap）——重启即失、未采纳
//!              结果无法恢复。本模块把任务记录落 SQLite（ai_tasks 表）：
//!              状态/结果 JSON/成本/耗时/模型/错误全量可查；应用启动时
//!              恢复未采纳的成功结果到注册表（重启不丢，任务面板可见历史）；
//!              采纳落库时标记 adopted（防重启后重复采纳产生重复笔记）。
//! @ai-context: 保留策略：每类型保留最近 50 条终态任务，超限清理最旧
//!              （防表膨胀；进行中任务不清理）。
//! @ai-context: 本模块纯数据读写（rusqlite）；业务编排在 command 层。

use rusqlite::params;

use crate::db::Db;
use crate::error::Result;

/// 每类型保留的终态任务上限（防表膨胀；V1.0 可调）。
pub const TASKS_KEEP_PER_TYPE: u32 = 50;

/// 任务记录（与内存注册表同构 + 持久化字段）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskRecord {
    pub task_id: u64,
    /// 操作类型（refine | enrich）
    pub op_type: String,
    /// 关联 id（精修=session_id、补充=note_id）
    pub ref_id: i64,
    /// 状态（pending|running|succeeded|failed|partial_failed）
    pub state: String,
    /// 成功结果 JSON（AiRefineResult/AiEnrichResult；失败/进行中 NULL）
    pub result_json: Option<String>,
    /// 成本（元；采纳落库后回填）
    pub cost_yuan: Option<f64>,
    /// 耗时（ms；终态后回填）
    pub elapsed_ms: Option<i64>,
    pub model: Option<String>,
    /// 失败原因（四类标签 + 原文；成功 NULL）
    pub error: Option<String>,
    pub slices: Option<usize>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    /// 是否已采纳落库（精修/补充采纳后置 1——防重启后重复采纳）
    pub adopted: bool,
}

impl Db {
    /// 建表（幂等；db.rs open 时调用）。
    pub fn init_ai_tasks(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS ai_tasks (
                task_id INTEGER PRIMARY KEY,
                op_type TEXT NOT NULL,
                ref_id INTEGER NOT NULL,
                state TEXT NOT NULL,
                result_json TEXT,
                cost_yuan REAL,
                elapsed_ms INTEGER,
                model TEXT,
                error TEXT,
                slices INTEGER,
                created_at INTEGER NOT NULL,
                finished_at INTEGER,
                adopted INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_ai_tasks_op ON ai_tasks(op_type, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_ai_tasks_ref ON ai_tasks(op_type, ref_id, created_at DESC);",
        )?;
        Ok(())
    }

    /// 插入任务记录（启动时写入 pending；幂等——同 task_id 覆盖）。
    pub fn insert_ai_task(&self, rec: &AiTaskRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT OR REPLACE INTO ai_tasks
                (task_id, op_type, ref_id, state, result_json, cost_yuan, elapsed_ms,
                 model, error, slices, created_at, finished_at, adopted)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                rec.task_id as i64,
                rec.op_type,
                rec.ref_id,
                rec.state,
                rec.result_json,
                rec.cost_yuan,
                rec.elapsed_ms,
                rec.model,
                rec.error,
                rec.slices.map(|s| s as i64),
                rec.created_at,
                rec.finished_at,
                rec.adopted as i64,
            ],
        )?;
        Ok(())
    }

    /// 更新任务终态（state/result/error/elapsed/finished_at——进行中字段不动）。
    pub fn finish_ai_task(
        &self,
        task_id: u64,
        state: &str,
        result_json: Option<&str>,
        error: Option<&str>,
        elapsed_ms: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE ai_tasks SET state=?1, result_json=?2, error=?3, elapsed_ms=?4, finished_at=?5
             WHERE task_id=?6",
            params![state, result_json, error, elapsed_ms, now_unix(), task_id as i64],
        )?;
        Ok(())
    }

    /// 标记采纳（apply 成功后调用——防重启后重复采纳）。
    pub fn mark_ai_task_adopted(&self, task_id: u64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE ai_tasks SET adopted=1 WHERE task_id=?1",
            params![task_id as i64],
        )?;
        Ok(())
    }

    /// 查询任务是否已采纳（apply 前置校验——服务端防重复采纳兜底；
    /// 任务不存在/查询失败视为未采纳——旧任务无记录时放行，防御方向保守）。
    pub fn is_ai_task_adopted(&self, task_id: u64) -> bool {
        let conn = match self.conn.lock() {
            Ok(c) => c,
            Err(e) => e.into_inner(),
        };
        conn.query_row(
            "SELECT adopted FROM ai_tasks WHERE task_id=?1",
            params![task_id as i64],
            |row| row.get::<_, i64>(0),
        )
        .map(|v| v != 0)
        .unwrap_or(false)
    }

    /// 回填成本（apply 落库成本后；task_id 由前端回传——result 携带）。
    pub fn update_ai_task_cost(&self, task_id: u64, cost_yuan: f64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE ai_tasks SET cost_yuan=?1 WHERE task_id=?2",
            params![cost_yuan, task_id as i64],
        )?;
        Ok(())
    }

    /// 恢复未采纳的成功结果（应用启动时；供任务面板 + 结果重取）。
    pub fn list_restorable_succeeded(&self, limit: usize) -> Result<Vec<AiTaskRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT task_id, op_type, ref_id, state, result_json, cost_yuan, elapsed_ms,
                    model, error, slices, created_at, finished_at, adopted
             FROM ai_tasks
             WHERE state='succeeded' AND adopted=0 AND result_json IS NOT NULL
             ORDER BY created_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], map_record)?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| e.into())
    }

    /// 任务历史（任务面板数据源；op_type 过滤 + 时间倒序 + 上限）。
    pub fn list_ai_tasks(&self, op_type: &str, limit: usize) -> Result<Vec<AiTaskRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT task_id, op_type, ref_id, state, result_json, cost_yuan, elapsed_ms,
                    model, error, slices, created_at, finished_at, adopted
             FROM ai_tasks
             WHERE op_type=?1
             ORDER BY created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![op_type, limit as i64], map_record)?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| e.into())
    }

    /// 保留策略：每类型清理超出上限的最旧终态任务（进行中不清理）。
    pub fn trim_ai_tasks(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        for op in ["refine", "enrich"] {
            conn.execute(
                "DELETE FROM ai_tasks WHERE task_id IN (
                    SELECT task_id FROM ai_tasks
                    WHERE op_type=?1 AND state NOT IN ('pending','running')
                    ORDER BY created_at DESC
                    LIMIT -1 OFFSET ?2
                )",
                params![op, TASKS_KEEP_PER_TYPE as i64],
            )?;
        }
        Ok(())
    }
}

/// 行 → 记录（私有映射；字段顺序与 SQL 一致）。
fn map_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiTaskRecord> {
    Ok(AiTaskRecord {
        task_id: row.get::<_, i64>(0)? as u64,
        op_type: row.get(1)?,
        ref_id: row.get(2)?,
        state: row.get(3)?,
        result_json: row.get(4)?,
        cost_yuan: row.get(5)?,
        elapsed_ms: row.get(6)?,
        model: row.get(7)?,
        error: row.get(8)?,
        slices: row.get::<_, Option<i64>>(9)?.map(|v| v as usize),
        created_at: row.get(10)?,
        finished_at: row.get(11)?,
        adopted: row.get::<_, i64>(12)? != 0,
    })
}

/// 当前 Unix 秒（记录时间戳）。
fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_ai_tasks_tests.rs"]
mod tests;
