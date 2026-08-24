//! 知识问题树数据层（v0.13.1 REQ-202；db_* 拆分模式同款）。
//!
//! @ai-context: knowledge_nodes 表 CRUD + 扁平全树。节点是体系内的问题/场景/领域入口，
//!              parent 自引用构成同级树（前端组树渲染）；删除经 ON DELETE CASCADE 级联
//!              清子树，引用删除节点时 knowledge_links.node_id 自动 SET NULL（DB 兜底）。
//! @ai-context: 锁访问统一走 Db::with_conn（中毒锁恢复而非 panic）。
//!
//! @ai-context: M1 数据层 API 供 M2 command 层接入用（机制先行）；接入后移除本 allow。
#![allow(dead_code)]

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::types::{KnowledgeNode, NewKnowledgeNode};

/// knowledge_nodes 表统一查询列（列顺序与 row_to_node 严格对应）。
/// @ai-context: v0.13.8 追加 canvas_x/canvas_y（画布位置；list 随行返回供画布直接读取）。
const NODE_COLUMNS: &str =
    "id, system_id, parent_id, type, text, order_idx, status, created_at, canvas_x, canvas_y";

impl Db {
    /// 新建节点，返回完整记录。
    ///
    /// @ai-context: parent_id 跨体系校验在 command 层（M2）——数据层只落库，
    ///              `list_knowledge_nodes(system_id)` 天然按体系过滤。
    pub fn add_knowledge_node(&self, new: &NewKnowledgeNode) -> Result<KnowledgeNode> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO knowledge_nodes (system_id, parent_id, type, text, order_idx, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)",
                params![new.system_id, new.parent_id, new.r#type, new.text, new.order_idx, now],
            )?;
            let id = conn.last_insert_rowid();
            Ok(KnowledgeNode {
                id,
                system_id: new.system_id,
                parent_id: new.parent_id,
                r#type: new.r#type.clone(),
                text: new.text.clone(),
                order_idx: new.order_idx,
                status: "active".to_string(),
                created_at: now,
                // 新节点无画布位置（NULL=未布局——首次打开画布由前端辐射布局初始化）
                canvas_x: None,
                canvas_y: None,
            })
        })
    }

    /// 按 id 读取单节点；不存在返回 None。
    pub fn get_knowledge_node(&self, id: i64) -> Result<Option<KnowledgeNode>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare(&format!("SELECT {} FROM knowledge_nodes WHERE id = ?1", NODE_COLUMNS))?;
            let mut rows = stmt.query_map(params![id], row_to_node)?;
            match rows.next() {
                Some(Ok(n)) => Ok(Some(n)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 更新节点可选字段（None=不改；order_idx 单层 Option——该列非空不可置 NULL）。
    pub fn update_knowledge_node(
        &self,
        id: i64,
        text: Option<&str>,
        order_idx: Option<i64>,
        status: Option<&str>,
    ) -> Result<bool> {
        self.with_conn(|conn| {
            let mut sets: Vec<String> = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(v) = text {
                sets.push(format!("text = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if let Some(v) = order_idx {
                sets.push(format!("order_idx = ?{}", params.len() + 1));
                params.push(Box::new(v));
            }
            if let Some(v) = status {
                sets.push(format!("status = ?{}", params.len() + 1));
                params.push(Box::new(v.to_string()));
            }
            if sets.is_empty() {
                return Ok(false);
            }
            let sql = format!(
                "UPDATE knowledge_nodes SET {} WHERE id = ?{}",
                sets.join(", "),
                params.len() + 1
            );
            params.push(Box::new(id));
            let affected = conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())))?;
            Ok(affected > 0)
        })
    }

    /// 删除节点。
    ///
    /// @ai-context: 子树经 knowledge_nodes.parent ON DELETE CASCADE 自动级联清空，
    ///              引用该节点的 knowledge_links.node_id 自动 SET NULL（DB 兜底），
    ///              本方法只删根节点——防误删由前端二次确认（command 层）。
    pub fn delete_knowledge_node(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM knowledge_nodes WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }

    /// 列出体系内全部节点（扁平全树；按 order_idx, id 排序——前端按 parent_id 组树）。
    pub fn list_knowledge_nodes(&self, system_id: i64) -> Result<Vec<KnowledgeNode>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM knowledge_nodes WHERE system_id = ?1
                 ORDER BY order_idx ASC, id ASC",
                NODE_COLUMNS
            ))?;
            let rows = stmt.query_map(params![system_id], row_to_node)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
}

/// 把 rusqlite 行映射为 KnowledgeNode。
fn row_to_node(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeNode> {
    Ok(KnowledgeNode {
        id: row.get(0)?,
        system_id: row.get(1)?,
        parent_id: row.get(2)?,
        r#type: row.get(3)?,
        text: row.get(4)?,
        order_idx: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get(7)?,
        canvas_x: row.get(8)?,
        canvas_y: row.get(9)?,
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_knowledge_nodes_tests.rs"]
mod tests;
