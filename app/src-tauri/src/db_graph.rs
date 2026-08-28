//! 知识图谱快照数据层（v0.14 C2 graph_snapshot；db_* 拆分模式同款）。
//!
//! @ai-context: 三类边聚合（spec §3.2/§4.2，单次拉取完整图谱）：
//!              - link 引用：knowledge_links 体系实体（concept/model）→ 内容
//!                （note/note_group）。node_id 引用跳过——问题节点不在图谱节点
//!                类型（note/concept/model/group），体系内结构由体系画布覆盖；
//!                flashcard/fragment 目标同理无节点类型。
//!              - trace 溯源：notes.session_id 同源会话（artifact_to_note 落库的
//!                溯源字段，v0.7.1）。图谱无会话节点——以「同源笔记互连」表达
//!                血统；>TRACE_MAX_PER_SESSION 张跳过（防毛线球，A' 分层纪律）。
//!              - belong 归属：notes.group_id → 组。
//! @ai-context: 节点全量（笔记/概念/模型/组四表）；color 沿用 B 子项目四级色系
//!              （笔记 properties.color / 组 color；概念/模型 None → 前端类型色）。

use crate::db::Db;
use crate::error::Result;
use crate::types::{GraphEdge, GraphNode, GraphSnapshot};

/// 同源会话笔记互连上限（超过则跳过该会话 trace 边——防毛线球）
const TRACE_MAX_PER_SESSION: usize = 6;

impl Db {
    /// 图谱快照：四表节点 + 三类边单次聚合（无参数——全局视图）。
    pub fn graph_snapshot(&self) -> Result<GraphSnapshot> {
        let nodes = self.graph_nodes()?;
        let mut edges = Vec::new();
        edges.extend(self.graph_link_edges()?);
        edges.extend(self.graph_trace_edges()?);
        edges.extend(self.graph_belong_edges()?);
        Ok(GraphSnapshot { nodes, edges })
    }

    /// 四类节点全量（笔记/概念/模型/组——entityId 为各表原始 id）。
    fn graph_nodes(&self) -> Result<Vec<GraphNode>> {
        self.with_conn(|conn| {
            let mut nodes = Vec::new();
            // 笔记：label=title；color=properties.color（显式色，B 子项目四级体系第一级）
            {
                let mut stmt = conn.prepare(
                    "SELECT id, title, properties FROM notes ORDER BY id ASC",
                )?;
                let rows = stmt.query_map([], |row| {
                    let id: i64 = row.get(0)?;
                    let props: Option<String> = row.get(2)?;
                    let color = props
                        .as_deref()
                        .and_then(|p| serde_json::from_str::<serde_json::Value>(p).ok())
                        .and_then(|v| v.get("color").and_then(|c| c.as_str()).map(String::from));
                    Ok(GraphNode {
                        id: format!("note:{id}"),
                        kind: "note".into(),
                        label: row.get(1)?,
                        color,
                        entity_id: id,
                        system_id: None,
                    })
                })?;
                nodes.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
            }
            // 概念/模型：label=name；system_id 供跳转体系页
            {
                let mut stmt =
                    conn.prepare("SELECT id, system_id, name FROM knowledge_concepts ORDER BY id ASC")?;
                let rows = stmt.query_map([], |row| {
                    let id: i64 = row.get(0)?;
                    Ok(GraphNode {
                        id: format!("concept:{id}"),
                        kind: "concept".into(),
                        label: row.get(2)?,
                        color: None,
                        entity_id: id,
                        system_id: row.get(1)?,
                    })
                })?;
                nodes.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
            }
            {
                let mut stmt =
                    conn.prepare("SELECT id, system_id, name FROM knowledge_models ORDER BY id ASC")?;
                let rows = stmt.query_map([], |row| {
                    let id: i64 = row.get(0)?;
                    Ok(GraphNode {
                        id: format!("model:{id}"),
                        kind: "model".into(),
                        label: row.get(2)?,
                        color: None,
                        entity_id: id,
                        system_id: row.get(1)?,
                    })
                })?;
                nodes.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
            }
            // 组：color=note_groups.color（四级体系第二级）
            {
                let mut stmt =
                    conn.prepare("SELECT id, name, color FROM note_groups ORDER BY id ASC")?;
                let rows = stmt.query_map([], |row| {
                    let id: i64 = row.get(0)?;
                    Ok(GraphNode {
                        id: format!("group:{id}"),
                        kind: "group".into(),
                        label: row.get(1)?,
                        color: row.get(2)?,
                        entity_id: id,
                        system_id: None,
                    })
                })?;
                nodes.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
            }
            Ok(nodes)
        })
    }

    /// 引用边：体系实体（concept/model）→ 内容（note/note_group）。
    fn graph_link_edges(&self) -> Result<Vec<GraphEdge>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, concept_id, model_id, target_type, target_id
                 FROM knowledge_links
                 WHERE (concept_id IS NOT NULL OR model_id IS NOT NULL)
                   AND target_type IN ('note', 'note_group')
                 ORDER BY id ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                let id: i64 = row.get(0)?;
                let concept_id: Option<i64> = row.get(1)?;
                let model_id: Option<i64> = row.get(2)?;
                let target_type: String = row.get(3)?;
                let target_id: i64 = row.get(4)?;
                let target = format!("{}:{target_id}", if target_type == "note" { "note" } else { "group" });
                let mut out = Vec::with_capacity(2);
                if let Some(cid) = concept_id {
                    out.push(GraphEdge {
                        id: format!("link:{id}:c"),
                        source: format!("concept:{cid}"),
                        target: target.clone(),
                        edge_type: "link".into(),
                    });
                }
                if let Some(mid) = model_id {
                    out.push(GraphEdge {
                        id: format!("link:{id}:m"),
                        source: format!("model:{mid}"),
                        target,
                        edge_type: "link".into(),
                    });
                }
                Ok(out)
            })?;
            Ok(rows.collect::<rusqlite::Result<Vec<Vec<_>>>>()?.into_iter().flatten().collect())
        })
    }

    /// 溯源边：同源会话笔记两两互连（2~TRACE_MAX_PER_SESSION 张才建边）。
    fn graph_trace_edges(&self) -> Result<Vec<GraphEdge>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT session_id, id FROM notes
                 WHERE session_id IS NOT NULL
                 ORDER BY session_id ASC, id ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })?;
            let pairs: Vec<(i64, i64)> = rows.collect::<rusqlite::Result<_>>()?;
            // 按会话分组（id 升序保证组内有序）
            let mut edges = Vec::new();
            let mut i = 0;
            while i < pairs.len() {
                let sid = pairs[i].0;
                let mut group = Vec::new();
                while i < pairs.len() && pairs[i].0 == sid {
                    group.push(pairs[i].1);
                    i += 1;
                }
                if group.len() < 2 || group.len() > TRACE_MAX_PER_SESSION {
                    continue; // 单张无同源可言；超上限防毛线球
                }
                for a in 0..group.len() {
                    for b in (a + 1)..group.len() {
                        edges.push(GraphEdge {
                            id: format!("trace:{sid}:{}:{}", group[a], group[b]),
                            source: format!("note:{}", group[a]),
                            target: format!("note:{}", group[b]),
                            edge_type: "trace".into(),
                        });
                    }
                }
            }
            Ok(edges)
        })
    }

    /// 归属边：笔记 → 组（notes.group_id）。
    fn graph_belong_edges(&self) -> Result<Vec<GraphEdge>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, group_id FROM notes WHERE group_id IS NOT NULL ORDER BY id ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                let id: i64 = row.get(0)?;
                let group_id: i64 = row.get(1)?;
                Ok(GraphEdge {
                    id: format!("belong:{id}"),
                    source: format!("note:{id}"),
                    target: format!("group:{group_id}"),
                    edge_type: "belong".into(),
                })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_graph_tests.rs"]
mod tests;
