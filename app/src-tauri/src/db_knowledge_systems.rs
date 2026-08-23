//! 知识体系数据层（v0.13.1 REQ-202；db_* 拆分模式同款）。
//!
//! @ai-context: knowledge_systems 表 CRUD + global 唯一体系查找。体系是问题的容器
//!              （引用/节点/概念/模型都挂体系上）；本层只管读写，kind 白名单与
//!              core_question 非空校验在 command 层（M2）。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic，db_notes 同口径）。
//!
//! @ai-context: M1 数据层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{KnowledgeSystem, NewKnowledgeSystem};

/// knowledge_systems 表统一查询列（列顺序与 row_to_system 严格对应；不含计数列）。
const SYSTEM_COLUMNS: &str = "id, parent_system_id, name, kind, core_question, status, created_at, updated_at";

impl Db {
    /// 按 id 读取单个体系；不存在返回 None（不填充计数列——单查不消费）。
    pub fn get_knowledge_system(&self, id: i64) -> Result<Option<KnowledgeSystem>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_systems WHERE id = ?1",
                SYSTEM_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![id], row_to_system)?;
            match rows.next() {
                Some(Ok(s)) => Ok(Some(s)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 列出全部体系（含节点/概念/模型三计数子查询；global 置顶）。
    ///
    /// @ai-context: 子查询 COUNT——体系计数随子表实时变化，不冗余存储；
    ///              global 体系经 (kind='global') DESC 置顶（UI"全局置顶固定"）。
    pub fn list_knowledge_systems(&self) -> Result<Vec<KnowledgeSystem>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {c},
                 (SELECT COUNT(*) FROM knowledge_nodes n WHERE n.system_id = s.id) AS node_count,
                 (SELECT COUNT(*) FROM knowledge_concepts c WHERE c.system_id = s.id) AS concept_count,
                 (SELECT COUNT(*) FROM knowledge_models m WHERE m.system_id = s.id) AS model_count
                 FROM knowledge_systems s
                 ORDER BY (kind = 'global') DESC, s.id ASC",
                c = prefix_columns()
            ))?;
            let rows = stmt.query_map([], row_to_system_with_counts)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 新建体系，返回含 id 与时间戳的完整记录。
    ///
    /// @ai-context: global 唯一由 idx_knowledge_systems_global 唯一索引兜底——重复
    ///              global 插入时 rusqlite 约束错误自然上抛（command 层预查给友好错误）。
    pub fn create_knowledge_system(&self, new: &NewKnowledgeSystem) -> Result<KnowledgeSystem> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_systems (parent_system_id, name, kind, core_question, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)",
                params![new.parent_system_id, new.name, new.kind, new.core_question, now],
            )?;
            let id = conn.last_insert_rowid();
            Ok(KnowledgeSystem {
                id,
                parent_system_id: new.parent_system_id,
                name: new.name.clone(),
                kind: new.kind.clone(),
                core_question: new.core_question.clone(),
                status: "active".to_string(),
                node_count: 0,
                concept_count: 0,
                model_count: 0,
                created_at: now,
                updated_at: now,
            })
        })
    }

    /// 更新体系可选字段（None=不改；core_question 两层 Option 可置 NULL）。
    ///
    /// @ai-context: core_question 用两层 Option（外层 None=不改，内层 None=清空为 NULL，
    ///              Some(v)=置值）——因该列可空，单层 Option 无法区分"不改"与"清空"。
    pub fn update_knowledge_system(
        &self,
        id: i64,
        name: Option<&str>,
        core_question: Option<Option<&str>>,
        status: Option<&str>,
    ) -> Result<bool> {
        self.with_conn(|conn| {
            let mut sets: Vec<String> = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(v) = name {
                sets.push(format!("name = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if let Some(v) = core_question {
                sets.push(format!("core_question = ?{}", params.len() + 1));
                params.push(Box::new(v.map(str::to_string)));
            }
            if let Some(v) = status {
                sets.push(format!("status = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if sets.is_empty() {
                return Ok(false); // 无字段可改——不触碰数据库
            }
            sets.push(format!("updated_at = ?{}", params.len() + 1));
            params.push(Box::new(unix_seconds()));
            let sql = format!(
                "UPDATE knowledge_systems SET {} WHERE id = ?{}",
                sets.join(", "),
                params.len() + 1
            );
            params.push(Box::new(id));
            let affected = conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())))?;
            Ok(affected > 0)
        })
    }

    /// 幂等归档（status=archived；已归档再归档仍返回 true）。
    pub fn archive_knowledge_system(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE knowledge_systems SET status = 'archived', updated_at = ?1 WHERE id = ?2",
                params![unix_seconds(), id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 查找全局体系（kind='global'；唯一索引保证至多一条，取首条即可）。
    pub fn find_global_system(&self) -> Result<Option<KnowledgeSystem>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_systems WHERE kind = 'global' LIMIT 1",
                SYSTEM_COLUMNS
            ))?;
            let mut rows = stmt.query_map([], row_to_system)?;
            match rows.next() {
                Some(Ok(s)) => Ok(Some(s)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }
}

/// JOIN 查询时列名加 s. 前缀（list_knowledge_systems 专用）。
fn prefix_columns() -> String {
    SYSTEM_COLUMNS.split(", ").map(|c| format!("s.{}", c)).collect::<Vec<_>>().join(", ")
}

/// 把 rusqlite 行映射为 KnowledgeSystem（无计数列；计数置 0）。
fn row_to_system(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeSystem> {
    Ok(KnowledgeSystem {
        id: row.get(0)?,
        parent_system_id: row.get(1)?,
        name: row.get(2)?,
        kind: row.get(3)?,
        core_question: row.get(4)?,
        status: row.get(5)?,
        node_count: 0,
        concept_count: 0,
        model_count: 0,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

/// 把 rusqlite 行映射为 KnowledgeSystem（含子查询三计数列）。
fn row_to_system_with_counts(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeSystem> {
    let mut s = row_to_system(row)?;
    s.node_count = row.get(8)?;
    s.concept_count = row.get(9)?;
    s.model_count = row.get(10)?;
    Ok(s)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_knowledge_systems_tests.rs"]
mod tests;
