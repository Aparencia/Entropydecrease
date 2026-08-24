//! 决策/应用数据层（v0.13.3 REQ-208；db_* 拆分模式同款）。
//!
//! @ai-context: knowledge_decisions 表一表两面 CRUD——kind 区分 decision（思辨面）/
//!              application（学习面·记一次使用），**不双表双记**（最小红环）。本层
//!              只做读写，used_refs 结构契约在 knowledge_pure::validate_decision_input
//!              （纯函数），实体/证据存在性校验与指标落在 command 层（commands_knowledge_decisions）。
//! @ai-context: 时间口径统一 Unix 秒（unix_seconds），与全库 db 层一致；纯函数层
//!              StaleSignal 需毫秒时由调用方 ×1000 换算（见 set_concept_applied 注释）。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic，db_notes 同口径）。

//! @ai-context: M1 数据层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{KnowledgeDecision, NewKnowledgeDecision};

/// knowledge_decisions 表统一查询列（列顺序与 row_to_decision 严格对应）。
const DECISION_COLUMNS: &str =
    "id, kind, system_id, question_id, used_refs, content, expectation, actual, reflection, decided_at, created_at";

impl Db {
    /// 新建决策/应用记录，返回完整记录（decided_at/created_at 由数据层填充为 Unix 秒）。
    ///
    /// @ai-context: kind 由调用方传入（command 层白名单校验）；used_refs 原样落库
    ///              （调用方须先经 validate_decision_input 规范化）。question_id 可空
    ///              （决策可挂问题树节点；应用本版不挂节点）。
    pub fn create_decision(&self, new: &NewKnowledgeDecision) -> Result<KnowledgeDecision> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_decisions
                 (kind, system_id, question_id, used_refs, content, expectation, actual, reflection, decided_at, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![
                    new.kind, new.system_id, new.question_id, new.used_refs, new.content,
                    new.expectation, new.actual, new.reflection, now
                ],
            )?;
            let id = conn.last_insert_rowid();
            Ok(KnowledgeDecision {
                id,
                kind: new.kind.clone(),
                system_id: new.system_id,
                question_id: new.question_id,
                used_refs: new.used_refs.clone(),
                content: new.content.clone(),
                expectation: new.expectation.clone(),
                actual: new.actual.clone(),
                reflection: new.reflection.clone(),
                decided_at: now,
                created_at: now,
            })
        })
    }

    /// 按 id 读取单条记录；不存在返回 None。
    ///
    /// @ai-context: 单查场景——命令层 get_decision 供前端详情读取；不存在返回 None
    ///              （不报错），与 db_* 数据层惯例一致（Option 承载"无"）。
    pub fn get_decision(&self, id: i64) -> Result<Option<KnowledgeDecision>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_decisions WHERE id = ?1",
                DECISION_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![id], row_to_decision)?;
            match rows.next() {
                Some(Ok(d)) => Ok(Some(d)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 列出决策/应用（system_id/kind 可选过滤；按 id 倒序——新在前；LIMIT 限条数）。
    ///
    /// @ai-context: 一表两面合表返回，前端分 tab 呈现；过滤参数动态拼接（与
    ///              list_knowledge_concepts 同款）。id DESC 保证最新决策/应用置顶。
    pub fn list_decisions(
        &self,
        system_id: Option<i64>,
        kind: Option<&str>,
        limit: usize,
    ) -> Result<Vec<KnowledgeDecision>> {
        self.with_conn(|conn| {
            let mut clauses: Vec<String> = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(sid) = system_id {
                clauses.push(format!("system_id = ?{}", params.len() + 1));
                params.push(Box::new(sid));
            }
            if let Some(k) = kind {
                clauses.push(format!("kind = ?{}", params.len() + 1));
                params.push(Box::new(k.to_string()));
            }
            let where_sql = if clauses.is_empty() {
                String::new()
            } else {
                format!("WHERE {}", clauses.join(" AND "))
            };
            let sql = format!(
                "SELECT {} FROM knowledge_decisions {} ORDER BY id DESC LIMIT ?{}",
                DECISION_COLUMNS, where_sql, params.len() + 1
            );
            params.push(Box::new(limit as i64));
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(
                rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())),
                row_to_decision,
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 删除记录（用户记账允许删）；幂等——不存在返回 false 不报错。
    ///
    /// @ai-context: 只记我的决策、人工记账允许删（无审计强制保留）；不存在返回 false
    ///              而非报错——删除前置不校验存在性，命令层可放心幂等调用。
    pub fn delete_decision(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM knowledge_decisions WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }

    /// 原子创建应用记录（事务：插 application 行 + 可选 set_concept_applied 同步）。
    ///
    /// @ai-context: **Why 事务**——概念模式需"插应用行 + 更新概念 last_applied_at"同步成功，
    ///              任一步失败整体回滚。with_conn 只给 &Connection 无法开事务，rusqlite 默认
    ///              autocommit 多语句各自提交会留下"应用行已建/概念未记使用"半态，故照
    ///              promote_fragment_to_note 手法：直接锁 conn + conn.transaction()（显式事务）。
    /// @ai-context: 体系模式（concept_id=None）只插行、不更新概念（体系级应用按体系聚合，
    ///              不推进任何概念 last_applied_at）。指标事件由 command 层在事务成功后追加
    ///              （复用 add_metric_event，best-effort 审计计数，不强绑定原子性——审计丢失
    ///              不损记录/概念使用的核心一致性）。
    /// @param concept_id - 概念模式传 Some（须为已校验存在的概念）；体系模式 None
    /// @param applied_at_secs - 概念最近应用时刻（Unix 秒；数据层不换算）
    pub fn create_application_tx(
        &self,
        new: &NewKnowledgeDecision,
        concept_id: Option<i64>,
        applied_at_secs: i64,
    ) -> Result<KnowledgeDecision> {
        let now = unix_seconds();
        let mut conn = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO knowledge_decisions
             (kind, system_id, question_id, used_refs, content, expectation, actual, reflection, decided_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![
                new.kind, new.system_id, new.question_id, new.used_refs, new.content,
                new.expectation, new.actual, new.reflection, now
            ],
        )?;
        let id = tx.last_insert_rowid();
        if let Some(cid) = concept_id {
            tx.execute(
                "UPDATE knowledge_concepts SET last_applied_at = ?1, updated_at = ?2 WHERE id = ?3",
                params![applied_at_secs, now, cid],
            )?;
        }
        tx.commit()?;
        Ok(KnowledgeDecision {
            id,
            kind: new.kind.clone(),
            system_id: new.system_id,
            question_id: new.question_id,
            used_refs: new.used_refs.clone(),
            content: new.content.clone(),
            expectation: new.expectation.clone(),
            actual: new.actual.clone(),
            reflection: new.reflection.clone(),
            decided_at: now,
            created_at: now,
        })
    }
}

/// 把 rusqlite 行映射为 KnowledgeDecision。
fn row_to_decision(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeDecision> {
    Ok(KnowledgeDecision {
        id: row.get(0)?,
        kind: row.get(1)?,
        system_id: row.get(2)?,
        question_id: row.get(3)?,
        used_refs: row.get(4)?,
        content: row.get(5)?,
        expectation: row.get(6)?,
        actual: row.get(7)?,
        reflection: row.get(8)?,
        decided_at: row.get(9)?,
        created_at: row.get(10)?,
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；TDD golden 先行）。
#[cfg(test)]
#[path = "db_knowledge_decisions_tests.rs"]
mod tests;
