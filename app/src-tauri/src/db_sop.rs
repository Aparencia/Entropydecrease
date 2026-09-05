//! SOP 功能区数据层（v0.20.3 / REQ-296/297）。
//!
//! @ai-context: 模板=段落行范围引用（note_id+start_line/end_line，G6 裁决——
//!              无双写：编辑段落即编辑模板；版本化=复用 notes 版本链）。run 启动
//!              时按当前正文行范围快照步骤文本（正文保持可复跑——步骤为副本）。
//!              run 轨迹/失败点/证据落 sop_runs + sop_run_steps；run 完成写
//!              completion_history（sop_run 事件——完成即证据）。
//! @ai-context: 双模式（readdo=逐步引导 / confirm=总览核对）仅模板字段标记；
//!              执行面=前端 Overlay（commands_sop.rs 出口）。证据路径白名单
//!              `notes-images/` 前缀在命令层校验（G3）。

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::db::Db;
use crate::error::Result;

pub const MODE_READDO: &str = "readdo";
pub const MODE_CONFIRM: &str = "confirm";
#[allow(dead_code)] // 与命令层字面量同值——保留为常量（防双处漂移），接入点登记
pub const RUN_ACTIVE: &str = "active";
pub const RUN_DONE: &str = "done";
pub const RUN_ABORTED: &str = "aborted";
/// 模板步骤数上限（防误选整篇大笔记当 SOP）。
pub const MAX_SOP_STEPS: usize = 50;
/// 证据路径前缀白名单（notes-images/——图片三入口落盘目录，G3 裁决）。
pub const EVIDENCE_PREFIX: &str = "notes-images/";

/// SOP 模板（段落行范围引用；无双写）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SopTemplate {
    pub id: i64,
    pub note_id: i64,
    pub name: String,
    pub start_line: i64,
    pub end_line: i64,
    /// readdo | confirm
    pub mode: String,
    pub note_title: String,
}

/// run 步骤行。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SopRunStep {
    pub id: i64,
    pub run_id: i64,
    pub step_no: i64,
    pub text_snapshot: String,
    /// todo | done | skipped | failed
    pub status: String,
    pub evidence_path: Option<String>,
    pub failure_note: Option<String>,
    pub checked_at: Option<i64>,
}

/// run 头。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SopRun {
    pub id: i64,
    pub template_id: i64,
    pub note_id: i64,
    pub template_name: String,
    /// readdo | confirm
    pub mode: String,
    /// active | done | aborted
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

/// run 详情（头部 + 步骤轨迹）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SopRunDetail {
    pub run: SopRun,
    pub steps: Vec<SopRunStep>,
    /// 完成统计（结算/演进原料）
    pub stats: RunStats,
    /// 保鲜 diff：模板当前正文行范围 vs 启动快照是否有出入（执行即保鲜，G 裁决 7）
    pub freshness_changed: bool,
}

/// 结算统计。
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStats {
    pub done: usize,
    pub skipped: usize,
    pub failed: usize,
    pub total: usize,
}

/// 建表（幂等；migrations 尾链）。
pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sop_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            mode TEXT NOT NULL DEFAULT 'readdo',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sop_templates_note ON sop_templates(note_id);
        CREATE TABLE IF NOT EXISTS sop_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
            note_id INTEGER NOT NULL,
            mode TEXT NOT NULL DEFAULT 'readdo',
            status TEXT NOT NULL DEFAULT 'active',
            started_at INTEGER NOT NULL,
            finished_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_sop_runs_template ON sop_runs(template_id, started_at DESC);
        CREATE TABLE IF NOT EXISTS sop_run_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL REFERENCES sop_runs(id) ON DELETE CASCADE,
            step_no INTEGER NOT NULL,
            text_snapshot TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'todo',
            evidence_path TEXT,
            failure_note TEXT,
            checked_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_sop_steps_run ON sop_run_steps(run_id, step_no);
        ",
    )?;
    Ok(())
}

/// 行范围 → 步骤文本（纯函数）：取 [start..=end] 非空行（trim 副本），≤50 步。
pub fn lines_to_steps(content: &str, start_line: i64, end_line: i64) -> Vec<String> {
    let lines: Vec<&str> = content.split('\n').collect();
    let mut out = Vec::new();
    for i in start_line..=end_line {
        if let Some(line) = lines.get(i as usize) {
            let t = line.trim();
            if !t.is_empty() {
                out.push(t.to_string());
            }
        }
    }
    out.truncate(MAX_SOP_STEPS);
    out
}

impl Db {
    /// 建/校准模板（审查中-5：同名存在=原地 UPDATE——覆盖校准不得级联销毁
    /// run 档案链/失败聚合，REQ-297 演进原料必须保留）。
    pub fn create_sop_template(
        &self,
        note_id: i64,
        name: &str,
        start_line: i64,
        end_line: i64,
        mode: &str,
    ) -> Result<i64> {
        let mode = if mode == MODE_CONFIRM { MODE_CONFIRM } else { MODE_READDO };
        let now = crate::db::unix_seconds();
        self.with_conn(|conn| {
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT id FROM sop_templates WHERE note_id = ?1 AND name = ?2",
                    params![note_id, name],
                    |r| r.get(0),
                )
                .optional()?;
            match existing {
                Some(id) => {
                    conn.execute(
                        "UPDATE sop_templates SET start_line = ?1, end_line = ?2, mode = ?3, updated_at = ?4 WHERE id = ?5",
                        params![start_line, end_line, mode, now, id],
                    )?;
                    Ok(id)
                }
                None => {
                    conn.execute(
                        "INSERT INTO sop_templates (note_id, name, start_line, end_line, mode, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                        params![note_id, name, start_line, end_line, mode, now],
                    )?;
                    Ok(conn.last_insert_rowid())
                }
            }
        })
    }

    /// 行范围步骤数（不截断——命令层 ≤50 校验用；审查中-6：先判后建，
    /// truncate 只作 DB 层兜底）。
    pub fn count_template_steps(content: &str, start_line: i64, end_line: i64) -> usize {
        let lines: Vec<&str> = content.split('\n').collect();
        (start_line..=end_line)
            .filter_map(|i| lines.get(i as usize))
            .filter(|l| !l.trim().is_empty())
            .count()
    }

    pub fn list_sop_templates(&self, note_id: Option<i64>) -> Result<Vec<SopTemplate>> {
        self.with_conn(|conn| {
            let base = "SELECT t.id, t.note_id, t.name, t.start_line, t.end_line, t.mode, n.title
                        FROM sop_templates t JOIN notes n ON n.id = t.note_id";
            let rows = match note_id {
                Some(nid) => {
                    let mut stmt = conn.prepare(&format!("{} WHERE t.note_id = ?1 ORDER BY t.updated_at DESC", base))?;
                    let mapped = stmt.query_map(params![nid], row_to_template)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
                None => {
                    let mut stmt = conn.prepare(&format!("{} ORDER BY t.updated_at DESC", base))?;
                    let mapped = stmt.query_map([], row_to_template)?;
                    mapped.collect::<rusqlite::Result<Vec<_>>>()?
                }
            };
            Ok(rows)
        })
    }

    pub fn delete_sop_template(&self, template_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected =
                conn.execute("DELETE FROM sop_templates WHERE id = ?1", params![template_id])?;
            Ok(affected > 0)
        })
    }

    pub fn get_sop_template(&self, template_id: i64) -> Result<Option<SopTemplate>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT t.id, t.note_id, t.name, t.start_line, t.end_line, t.mode, n.title
                 FROM sop_templates t JOIN notes n ON n.id = t.note_id WHERE t.id = ?1",
            )?;
            let mut mapped = stmt.query_map(params![template_id], row_to_template)?;
            match mapped.next() {
                Some(r) => r.map(Some).map_err(Into::into),
                None => Ok(None),
            }
        })
    }

    /// 启动 run：模板行范围快照步骤（非空行）→ run+steps 单事务。
    pub fn start_sop_run(&self, template: &SopTemplate) -> Result<i64> {
        let note = self
            .get_note(template.note_id)?
            .ok_or_else(|| crate::error::AppError::Io("模板笔记不存在".to_string()))?;
        let steps = lines_to_steps(&note.content, template.start_line, template.end_line);
        if steps.is_empty() {
            return Err(crate::error::AppError::Io("模板范围内无步骤内容".to_string()));
        }
        let now = crate::db::unix_seconds();
        self.with_conn(|conn| {
            conn.execute("BEGIN TRANSACTION", [])?;
            let result = (|| -> rusqlite::Result<i64> {
                conn.execute(
                    "INSERT INTO sop_runs (template_id, note_id, mode, status, started_at)
                     VALUES (?1, ?2, ?3, 'active', ?4)",
                    params![template.id, template.note_id, template.mode, now],
                )?;
                let run_id = conn.last_insert_rowid();
                let mut stmt = conn.prepare(
                    "INSERT INTO sop_run_steps (run_id, step_no, text_snapshot, status)
                     VALUES (?1, ?2, ?3, 'todo')",
                )?;
                for (i, text) in steps.iter().enumerate() {
                    stmt.execute(params![run_id, (i + 1) as i64, text])?;
                }
                Ok(run_id)
            })();
            match result {
                Ok(id) => {
                    conn.execute("COMMIT", [])?;
                    Ok(id)
                }
                Err(e) => {
                    let _ = conn.execute("ROLLBACK", []);
                    Err(e.into())
                }
            }
        })
    }

    pub fn get_sop_run(&self, run_id: i64) -> Result<Option<SopRun>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT r.id, r.template_id, r.note_id, t.name, r.mode, r.status, r.started_at, r.finished_at
                 FROM sop_runs r JOIN sop_templates t ON t.id = r.template_id WHERE r.id = ?1",
            )?;
            let mut mapped = stmt.query_map(params![run_id], row_to_run)?;
            match mapped.next() {
                Some(r) => r.map(Some).map_err(Into::into),
                None => Ok(None),
            }
        })
    }

    /// run 详情（头+步骤+统计+保鲜 diff）。
    pub fn sop_run_detail(&self, run_id: i64) -> Result<Option<SopRunDetail>> {
        let Some(run) = self.get_sop_run(run_id)? else { return Ok(None) };
        let steps = self.sop_run_steps(run_id)?;
        let mut stats = RunStats::default();
        for s in &steps {
            match s.status.as_str() {
                "done" => stats.done += 1,
                "skipped" => stats.skipped += 1,
                "failed" => stats.failed += 1,
                _ => {}
            }
            stats.total += 1;
        }
        // 保鲜 diff：模板当前行范围 vs 首步快照有无出入（执行即保鲜——提示修订）
        let note = match self.get_note(run.note_id)? {
            Some(n) => n,
            None => return Ok(Some(SopRunDetail { run, steps, stats, freshness_changed: false })),
        };
        let tmpl = self.get_sop_template(run.template_id)?;
        let current_first = tmpl.as_ref().map(|t| {
            lines_to_steps(&note.content, t.start_line, t.end_line)
                .first()
                .map(|s| s.clone())
        });
        let snapshot_first = steps.first().map(|s| s.text_snapshot.clone());
        let freshness_changed = current_first.flatten() != snapshot_first;
        Ok(Some(SopRunDetail { run, steps, stats, freshness_changed }))
    }

    pub fn sop_run_steps(&self, run_id: i64) -> Result<Vec<SopRunStep>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, run_id, step_no, text_snapshot, status, evidence_path, failure_note, checked_at
                 FROM sop_run_steps WHERE run_id = ?1 ORDER BY step_no",
            )?;
            let mapped = stmt.query_map(params![run_id], row_to_step)?;
            mapped.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 步状态更新（done|skipped|failed；审查中-7：DB 层守卫 run active——
    /// 已收尾 run 拒写，防层间复用裸奔）。
    pub fn update_sop_step(
        &self,
        run_id: i64,
        step_no: i64,
        status: &str,
        evidence_path: Option<&str>,
        failure_note: Option<&str>,
    ) -> Result<bool> {
        if !matches!(status, "done" | "skipped" | "failed") {
            return Err(crate::error::AppError::Asr(format!(
                "非法步状态: {status}"
            )));
        }
        self.with_conn(|conn| {
            let run_status: Option<String> = conn
                .query_row(
                    "SELECT status FROM sop_runs WHERE id = ?1",
                    params![run_id],
                    |r| r.get(0),
                )
                .optional()?;
            if run_status.as_deref() != Some(RUN_ACTIVE) {
                return Ok(false); // 不存在或已收尾——统一不可写语义
            }
            let affected = conn.execute(
                "UPDATE sop_run_steps SET status = ?1, evidence_path = ?2, failure_note = ?3, checked_at = ?4
                 WHERE run_id = ?5 AND step_no = ?6",
                params![status, evidence_path, failure_note, crate::db::unix_seconds(), run_id, step_no],
            )?;
            Ok(affected > 0)
        })
    }

    /// 结束 run（done/aborted）→ 结算统计写史（sop_run 事件；meta=统计 JSON）。
    /// 审查中-7：幂等守卫——仅 active run 可收尾（重复 finish 报错且不重复入史）。
    pub fn finish_sop_run(&self, run_id: i64, status: &str) -> Result<SopRunDetail> {
        if !matches!(status, RUN_DONE | RUN_ABORTED) {
            return Err(crate::error::AppError::Asr("仅支持 done/aborted 收尾".to_string()));
        }
        let Some(detail) = self.sop_run_detail(run_id)? else {
            return Err(crate::error::AppError::Io("run 不存在".to_string()));
        };
        if detail.run.status != RUN_ACTIVE {
            return Err(crate::error::AppError::Asr(format!(
                "run 已收尾（{}）——不可重复结算",
                detail.run.status
            )));
        }
        self.with_conn(|conn| {
            conn.execute(
                "UPDATE sop_runs SET status = ?1, finished_at = ?2 WHERE id = ?3 AND status = 'active'",
                params![status, crate::db::unix_seconds(), run_id],
            )?;
            Ok(())
        })?;
        let stats_json = serde_json::json!({
            "done": detail.stats.done, "skipped": detail.stats.skipped,
            "failed": detail.stats.failed, "total": detail.stats.total,
        })
        .to_string();
        let _ = self.add_completion_event(
            crate::db_completion::EV_SOP_RUN,
            "sop_run",
            Some(run_id),
            Some(detail.run.note_id),
            &format!("{}（{}）", detail.run.template_name, status),
            None,
            Some(&stats_json),
        );
        Ok(detail)
    }

    /// 最近 run（模板失败频次聚合源）。
    pub fn list_sop_runs(&self, template_id: i64, limit: usize) -> Result<Vec<SopRun>> {
        let limit = limit.min(100) as i64;
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT r.id, r.template_id, r.note_id, t.name, r.mode, r.status, r.started_at, r.finished_at
                 FROM sop_runs r JOIN sop_templates t ON t.id = r.template_id
                 WHERE r.template_id = ?1 ORDER BY r.started_at DESC LIMIT ?2",
            )?;
            let mapped = stmt.query_map(params![template_id, limit], row_to_run)?;
            mapped.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 修订建议聚合（纯本地 v1）：模板全部 run 失败频次按步骤统计。
    pub fn sop_failure_aggregate(&self, template_id: i64) -> Result<Vec<(i64, String, usize)>> {
        let runs = self.list_sop_runs(template_id, 100)?;
        let mut counts: Vec<(i64, String, usize)> = Vec::new();
        for run in runs {
            let steps = self.sop_run_steps(run.id)?;
            for s in steps {
                if s.status == "failed" {
                    if let Some(slot) = counts.iter_mut().find(|(no, _, _)| *no == s.step_no) {
                        slot.2 += 1;
                    } else {
                        counts.push((s.step_no, s.text_snapshot.clone(), 1));
                    }
                }
            }
        }
        counts.sort_by_key(|(_, _, c)| std::cmp::Reverse(*c));
        Ok(counts)
    }
}

fn row_to_template(row: &rusqlite::Row<'_>) -> rusqlite::Result<SopTemplate> {
    Ok(SopTemplate {
        id: row.get(0)?,
        note_id: row.get(1)?,
        name: row.get(2)?,
        start_line: row.get(3)?,
        end_line: row.get(4)?,
        mode: row.get(5)?,
        note_title: row.get(6)?,
    })
}

fn row_to_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<SopRun> {
    Ok(SopRun {
        id: row.get(0)?,
        template_id: row.get(1)?,
        note_id: row.get(2)?,
        template_name: row.get(3)?,
        mode: row.get(4)?,
        status: row.get(5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
    })
}

fn row_to_step(row: &rusqlite::Row<'_>) -> rusqlite::Result<SopRunStep> {
    Ok(SopRunStep {
        id: row.get(0)?,
        run_id: row.get(1)?,
        step_no: row.get(2)?,
        text_snapshot: row.get(3)?,
        status: row.get(4)?,
        evidence_path: row.get(5)?,
        failure_note: row.get(6)?,
        checked_at: row.get(7)?,
    })
}

#[cfg(test)]
#[path = "db_sop_tests.rs"]
mod tests;
