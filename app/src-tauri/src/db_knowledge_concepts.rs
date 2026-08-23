//! 知识概念数据层（v0.13.1 REQ-202；db_* 拆分模式同款）。
//!
//! @ai-context: knowledge_concepts 表 CRUD + 按名查找。概念是全库唯一身份的
//!              知识单元（三问本质/边界/联系），name UNIQUE（spec §二 不可变约束）
//!              是交叉点判定的前提——重复名冲突由 rusqlite 约束错误上抛（不过滤）。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic）。
//!
//! @ai-context: M1 数据层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{KnowledgeConcept, NewKnowledgeConcept};

/// knowledge_concepts 表统一查询列（列顺序与 row_to_concept 严格对应）。
const CONCEPT_COLUMNS: &str =
    "id, system_id, name, essence, boundary, relation, status, last_applied_at, created_at, updated_at";

impl Db {
    /// 新建概念，返回完整记录。
    ///
    /// @ai-context: name 全局 UNIQUE——同名概念重复创建时 rusqlite 约束错误自然上抛
    ///              （command 层预查给友好错误；名称归一化在 command 层执行后落库）。
    pub fn add_knowledge_concept(&self, new: &NewKnowledgeConcept) -> Result<KnowledgeConcept> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_concepts (system_id, name, essence, boundary, relation, status, last_applied_at, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'core', NULL, ?6, ?6)",
                params![new.system_id, new.name, new.essence, new.boundary, new.relation, now],
            )?;
            let id = conn.last_insert_rowid();
            Ok(KnowledgeConcept {
                id,
                system_id: new.system_id,
                name: new.name.clone(),
                essence: new.essence.clone(),
                boundary: new.boundary.clone(),
                relation: new.relation.clone(),
                status: "core".to_string(),
                last_applied_at: None,
                created_at: now,
                updated_at: now,
            })
        })
    }

    /// 按 id 读取概念；不存在返回 None。
    pub fn get_knowledge_concept(&self, id: i64) -> Result<Option<KnowledgeConcept>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_concepts WHERE id = ?1",
                CONCEPT_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![id], row_to_concept)?;
            match rows.next() {
                Some(Ok(c)) => Ok(Some(c)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 按名称查找概念（全局唯一——命中至多一条；名称已归一化由调用方保证）。
    pub fn find_concept_by_name(&self, name: &str) -> Result<Option<KnowledgeConcept>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_concepts WHERE name = ?1 LIMIT 1",
                CONCEPT_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![name], row_to_concept)?;
            match rows.next() {
                Some(Ok(c)) => Ok(Some(c)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 更新概念可选字段。
    ///
    /// @ai-context: 三问 essence/boundary/relation 为可空列（两层 Option：外层 None=不改，
    ///              内层 None=清空为 NULL）；name 为 NOT NULL（单层 Option：None=不改）。
    pub fn update_knowledge_concept(
        &self,
        id: i64,
        name: Option<&str>,
        essence: Option<Option<&str>>,
        boundary: Option<Option<&str>>,
        relation: Option<Option<&str>>,
        status: Option<&str>,
    ) -> Result<bool> {
        self.with_conn(|conn| {
            let mut sets: Vec<String> = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(v) = name {
                sets.push(format!("name = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if let Some(v) = essence {
                sets.push(format!("essence = ?{}", params.len() + 1));
                params.push(Box::new(v.map(str::to_string)));
            }
            if let Some(v) = boundary {
                sets.push(format!("boundary = ?{}", params.len() + 1));
                params.push(Box::new(v.map(str::to_string)));
            }
            if let Some(v) = relation {
                sets.push(format!("relation = ?{}", params.len() + 1));
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
                "UPDATE knowledge_concepts SET {} WHERE id = ?{}",
                sets.join(", "),
                params.len() + 1
            );
            params.push(Box::new(id));
            let affected = conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())))?;
            Ok(affected > 0)
        })
    }

    /// 列出概念（体系过滤可选、状态过滤可选；动态 WHERE）。
    pub fn list_knowledge_concepts(
        &self,
        system_id: Option<i64>,
        status: Option<&str>,
    ) -> Result<Vec<KnowledgeConcept>> {
        self.with_conn(|conn| {
            let mut clauses: Vec<String> = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(sid) = system_id {
                clauses.push(format!("system_id = ?{}", params.len() + 1));
                params.push(Box::new(sid));
            }
            if let Some(st) = status {
                clauses.push(format!("status = ?{}", params.len() + 1));
                params.push(Box::new(st.to_string()));
            }
            let where_sql = if clauses.is_empty() {
                String::new()
            } else {
                format!("WHERE {}", clauses.join(" AND "))
            };
            let sql = format!(
                "SELECT {} FROM knowledge_concepts {} ORDER BY id ASC",
                CONCEPT_COLUMNS, where_sql
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())), row_to_concept)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
}

/// 把 rusqlite 行映射为 KnowledgeConcept。
fn row_to_concept(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeConcept> {
    Ok(KnowledgeConcept {
        id: row.get(0)?,
        system_id: row.get(1)?,
        name: row.get(2)?,
        essence: row.get(3)?,
        boundary: row.get(4)?,
        relation: row.get(5)?,
        status: row.get(6)?,
        last_applied_at: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_knowledge_concepts_tests.rs"]
mod tests;
