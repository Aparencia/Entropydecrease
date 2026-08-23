//! 知识模型数据层（v0.13.1 REQ-202；db_* 拆分模式同款）。
//!
//! @ai-context: knowledge_models 表 CRUD。模型是跨学科命题陈述（claim/valid_when/
//!              invalid_when 三要素），disciplines 为 JSON 数组文本（≥1 学科，
//!              解析由调用方——存储态保持 JSON 文本，避免 DB 层耦合领域解析）；
//!              cross_checks 为 v0.13.1 预埋 JSON（可空）。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic）。
//!
//! @ai-context: M1 数据层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{KnowledgeModel, NewKnowledgeModel};

/// knowledge_models 表统一查询列（列顺序与 row_to_model 严格对应）。
const MODEL_COLUMNS: &str =
    "id, system_id, name, disciplines, claim, valid_when, invalid_when, cross_checks, status, created_at, updated_at";

impl Db {
    /// 新建模型，返回完整记录（disciplines/cross_checks 存 JSON 文本）。
    pub fn add_knowledge_model(&self, new: &NewKnowledgeModel) -> Result<KnowledgeModel> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_models (system_id, name, disciplines, claim, valid_when, invalid_when, cross_checks, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?8)",
                params![
                    new.system_id, new.name, new.disciplines, new.claim, new.valid_when,
                    new.invalid_when, new.cross_checks, now
                ],
            )?;
            let id = conn.last_insert_rowid();
            Ok(KnowledgeModel {
                id,
                system_id: new.system_id,
                name: new.name.clone(),
                disciplines: new.disciplines.clone(),
                claim: new.claim.clone(),
                valid_when: new.valid_when.clone(),
                invalid_when: new.invalid_when.clone(),
                cross_checks: new.cross_checks.clone(),
                status: "active".to_string(),
                created_at: now,
                updated_at: now,
            })
        })
    }

    /// 按 id 读取模型；不存在返回 None。
    pub fn get_knowledge_model(&self, id: i64) -> Result<Option<KnowledgeModel>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare(&format!("SELECT {} FROM knowledge_models WHERE id = ?1", MODEL_COLUMNS))?;
            let mut rows = stmt.query_map(params![id], row_to_model)?;
            match rows.next() {
                Some(Ok(m)) => Ok(Some(m)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 更新模型可选字段。
    ///
    /// @ai-context: disciplines/name 为 NOT NULL（单层 Option：None=不改）；
    ///              claim/valid_when/invalid_when/cross_checks 可空（两层 Option：
    ///              外层 None=不改，内层 None=清空为 NULL）。
    // 字段多 = 模型可改字段齐全（与 commands 契约一致）；与 import.rs 同惯例豁免
    #[allow(clippy::too_many_arguments)]
    pub fn update_knowledge_model(
        &self,
        id: i64,
        name: Option<&str>,
        disciplines: Option<&str>,
        claim: Option<Option<&str>>,
        valid_when: Option<Option<&str>>,
        invalid_when: Option<Option<&str>>,
        cross_checks: Option<Option<&str>>,
        status: Option<&str>,
    ) -> Result<bool> {
        self.with_conn(|conn| {
            let mut sets: Vec<String> = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(v) = name {
                sets.push(format!("name = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if let Some(v) = disciplines {
                sets.push(format!("disciplines = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if let Some(v) = claim {
                sets.push(format!("claim = ?{}", params.len() + 1));
                params.push(Box::new(v.map(str::to_string)));
            }
            if let Some(v) = valid_when {
                sets.push(format!("valid_when = ?{}", params.len() + 1));
                params.push(Box::new(v.map(str::to_string)));
            }
            if let Some(v) = invalid_when {
                sets.push(format!("invalid_when = ?{}", params.len() + 1));
                params.push(Box::new(v.map(str::to_string)));
            }
            if let Some(v) = cross_checks {
                sets.push(format!("cross_checks = ?{}", params.len() + 1));
                params.push(Box::new(v.map(str::to_string)));
            }
            if let Some(v) = status {
                sets.push(format!("status = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if sets.is_empty() {
                return Ok(false);
            }
            sets.push(format!("updated_at = ?{}", params.len() + 1));
            params.push(Box::new(unix_seconds()));
            let sql = format!(
                "UPDATE knowledge_models SET {} WHERE id = ?{}",
                sets.join(", "),
                params.len() + 1
            );
            params.push(Box::new(id));
            let affected = conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())))?;
            Ok(affected > 0)
        })
    }

    /// 列出体系内模型。
    pub fn list_knowledge_models(&self, system_id: i64) -> Result<Vec<KnowledgeModel>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_models WHERE system_id = ?1 ORDER BY id ASC",
                MODEL_COLUMNS
            ))?;
            let rows = stmt.query_map(params![system_id], row_to_model)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
}

/// 把 rusqlite 行映射为 KnowledgeModel。
fn row_to_model(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeModel> {
    Ok(KnowledgeModel {
        id: row.get(0)?,
        system_id: row.get(1)?,
        name: row.get(2)?,
        disciplines: row.get(3)?,
        claim: row.get(4)?,
        valid_when: row.get(5)?,
        invalid_when: row.get(6)?,
        cross_checks: row.get(7)?,
        status: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_knowledge_models_tests.rs"]
mod tests;
