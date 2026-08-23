//! 知识引用数据层（v0.13.1 REQ-202；db_* 拆分模式同款）。
//!
//! @ai-context: knowledge_links 表——体系↔外部内容的唯一引用通道（体系只引用、不收纳）。
//!              node/concept/model 三向可空（至少一，command 层校验），target 为四类
//!              外部内容（组/笔记/闪卡/碎片）；target 存在性由 link_target_exists 校验。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic）。
//!
//! @ai-context: M1 数据层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{KnowledgeLink, NewKnowledgeLink};

/// 引用目标类型（对应 knowledge_links.target_type 白名单）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkTarget {
    NoteGroup,
    Note,
    Flashcard,
    Fragment,
}

impl LinkTarget {
    /// 目标类型 kebab-case 标识（落库值）。
    pub fn as_str(self) -> &'static str {
        match self {
            LinkTarget::NoteGroup => "note_group",
            LinkTarget::Note => "note",
            LinkTarget::Flashcard => "flashcard",
            LinkTarget::Fragment => "fragment",
        }
    }

    /// 目标所属表名（link_target_exists 查询用；固定映射，非用户输入——无注入面）。
    fn table(self) -> &'static str {
        match self {
            LinkTarget::NoteGroup => "note_groups",
            LinkTarget::Note => "notes",
            LinkTarget::Flashcard => "flashcards",
            LinkTarget::Fragment => "fragments",
        }
    }
}

/// knowledge_links 表统一查询列（列顺序与 row_to_link 严格对应）。
const LINK_COLUMNS: &str =
    "id, system_id, node_id, concept_id, model_id, target_type, target_id, created_at";

impl Db {
    /// 新建引用，返回完整记录。
    ///
    /// @ai-context: target 存在性由 command 层经 link_target_exists 校验——数据层不重复
    ///              校验（避免每条引用多一次查询，且 command 层给友好错误）。
    pub fn add_knowledge_link(&self, new: &NewKnowledgeLink) -> Result<KnowledgeLink> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_links (system_id, node_id, concept_id, model_id, target_type, target_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![new.system_id, new.node_id, new.concept_id, new.model_id, new.target_type, new.target_id, now],
            )?;
            let id = conn.last_insert_rowid();
            Ok(KnowledgeLink {
                id,
                system_id: new.system_id,
                node_id: new.node_id,
                concept_id: new.concept_id,
                model_id: new.model_id,
                target_type: new.target_type.clone(),
                target_id: new.target_id,
                created_at: now,
            })
        })
    }

    /// 删除引用（撤销外部内容→体系的指向；幂等——不存在返回 false）。
    pub fn delete_knowledge_link(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM knowledge_links WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }

    /// 列出引用（体系必选；node/concept/model 三向过滤可选——动态 WHERE）。
    pub fn list_knowledge_links(
        &self,
        system_id: i64,
        node_id: Option<i64>,
        concept_id: Option<i64>,
        model_id: Option<i64>,
    ) -> Result<Vec<KnowledgeLink>> {
        self.with_conn(|conn| {
            let mut clauses: Vec<String> = vec!["system_id = ?1".to_string()];
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(system_id)];
            if let Some(v) = node_id {
                clauses.push(format!("node_id = ?{}", params.len() + 1));
                params.push(Box::new(v));
            }
            if let Some(v) = concept_id {
                clauses.push(format!("concept_id = ?{}", params.len() + 1));
                params.push(Box::new(v));
            }
            if let Some(v) = model_id {
                clauses.push(format!("model_id = ?{}", params.len() + 1));
                params.push(Box::new(v));
            }
            let sql = format!(
                "SELECT {} FROM knowledge_links WHERE {} ORDER BY id ASC",
                LINK_COLUMNS,
                clauses.join(" AND ")
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())), row_to_link)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 校验 target 存在（四类外部内容对应表查 id——link 前 command 层调用）。
    pub fn link_target_exists(&self, target_type: LinkTarget, target_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let sql = format!("SELECT COUNT(*) FROM {} WHERE id = ?1", target_type.table());
            let count: i64 = conn.query_row(&sql, params![target_id], |r| r.get(0))?;
            Ok(count > 0)
        })
    }
}

/// 把 rusqlite 行映射为 KnowledgeLink。
fn row_to_link(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeLink> {
    Ok(KnowledgeLink {
        id: row.get(0)?,
        system_id: row.get(1)?,
        node_id: row.get(2)?,
        concept_id: row.get(3)?,
        model_id: row.get(4)?,
        target_type: row.get(5)?,
        target_id: row.get(6)?,
        created_at: row.get(7)?,
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_knowledge_links_tests.rs"]
mod tests;
