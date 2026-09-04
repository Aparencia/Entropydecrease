//! 检索索引·混合检索命令数据层（REQ-258，v0.19.0；设计 §5.4）。
//!
//! @ai-context: kb_search = FTS5 BM25 主链（中文经 kb_fts.rs 规划转 trigram
//!              短语/2 字 LIKE 补充）；RRF 融合函数已就绪但 embedding 未接入
//!              （v0.19.3）——当前单列直通；LIKE 旧链（search_notes 等）保留
//!              不动零破坏。命中携带源引用（note_id/fragment_id + 标题 + 组名
//!              + 节标题）→ 引用溯源/跳转高亮天然成立。
//! @ai-context: 结果仅读派生索引（kb_* 表），绝不反向写事实源（铁律 1）。
//! @ai-context: 两引擎组合口径（审查 O1 登记说明）：纯 LIKE 通道（仅 2 字词）
//!              词间为 **OR 宽松召回**（like_hits SQL）；fts+like 并存时 like 词
//!              为 **AND 精修过滤**（fts 主链精排后逐词必中）——前者保召回
//!              后者防 OR 噪声淹没精排，口径差异为有意设计。

use rusqlite::Connection;

use crate::db::Db;
use crate::error::Result;
use crate::kb_embed::EmbeddingEngine;
use crate::kb_fts::{build_snippet, like_pattern, plan_query};
use crate::kb_search_semantic::semantic_merge;

/// 默认/上限命中数（命令层 clamp——防超大 payload）。
pub const KB_SEARCH_DEFAULT_LIMIT: usize = 10;
pub const KB_SEARCH_MAX_LIMIT: usize = 50;
/// FTS 候选再经 LIKE 补充词过滤时的放大系数（AND 语义会裁掉部分候选——
/// 多取再裁，保证最终仍能凑满 limit；个人库量级安全）。
const FTS_CANDIDATE_FACTOR: usize = 8;

/// 单条命中（前端引用卡片/聊天 citations 的契约单位——camelCase）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KbHit {
    pub chunk_id: i64,
    /// note | fragment
    pub source_kind: String,
    pub note_id: Option<i64>,
    pub fragment_id: Option<i64>,
    /// 笔记标题（note 恒有；fragment 无标题——前端诚实降级文案）
    pub note_title: Option<String>,
    /// 源所属组名（引用卡片展示语境；未归组 → None）
    pub group_name: Option<String>,
    /// 命中所在节标题（无标题节 → None）
    pub heading: Option<String>,
    /// 节级 snippet（`==命中==` 高亮标记——全站渲染协议同构）
    pub snippet: String,
    /// 命中通道（fts | like；embedding 合流后补 rrf）
    pub score_kind: String,
}

/// 查询行（snippet 后处理前置结构）。
#[derive(Clone)]
struct HitRow {
    chunk_id: i64,
    source_kind: String,
    note_id: Option<i64>,
    fragment_id: Option<i64>,
    note_title: Option<String>,
    group_name: Option<String>,
    heading: Option<String>,
    text: String,
    score_kind: String,
}

impl Db {
    /// 命中块全文批量取回（v0.19.1 学习库问答上下文打包用——snippet 之外
    /// 的完整片段；chunk 已删/不存在 → 该 id 缺席，调用方按空文本降级）。
    pub fn kb_chunk_texts(&self, ids: &[i64]) -> Result<std::collections::HashMap<i64, String>> {
        let mut out = std::collections::HashMap::new();
        if ids.is_empty() {
            return Ok(out);
        }
        // 动态 IN 占位符（ids ≤ 50 调用方已钳制；个人库安全）
        let placeholders = (0..ids.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("SELECT id, text FROM kb_chunks WHERE id IN ({})", placeholders);
        let ids_vec: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(rusqlite::params_from_iter(ids_vec.iter().copied()), |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
            })?;
            for row in rows {
                let (id, text) = row?;
                out.insert(id, text);
            }
            Ok(out)
        })
    }

    /// 全库混合检索 FTS-only 等价入口（仅测试保留——生产走 *_hybrid）。
    #[cfg(test)]
    pub fn kb_search(&self, query: &str, limit: usize) -> Result<Vec<KbHit>> {
        self.kb_search_hybrid(None, query, limit)
    }

    /// 混合检索入口（REQ-259）：调用方持引擎时传 Some（命令层经状态槽取）。
    ///
    /// @ai-context: 融合口径（设计 §5.4）：FTS 候选（保词法精度）∪ 向量余弦
    ///              top-K（保语义召回）→ rrf_merge（k=60）→ limit 截断；向量
    ///              仅当 kb_meta.embedding_dim 与引擎 dim 一致时参与（模型更换
    ///              未重建 → 降级 + 日志提示重建，不产出维度错乱结果）。
    pub fn kb_search_hybrid(
        &self,
        engine: Option<&dyn EmbeddingEngine>,
        query: &str,
        limit: usize,
    ) -> Result<Vec<KbHit>> {
        let limit = limit.clamp(1, KB_SEARCH_MAX_LIMIT);
        let plan = plan_query(query);
        if plan.fts.is_none() && plan.like_terms.is_empty() {
            return Ok(Vec::new());
        }
        self.with_conn(|conn| {
            let mut rows: Vec<HitRow> = match &plan.fts {
                Some(expr) => match fts_hits(conn, expr, limit * FTS_CANDIDATE_FACTOR) {
                    Ok(rows) => {
                        // fts + like 双引擎 AND：补充词内存过滤（like 词为查询
                        // 字面无通配符——ASCII 大小写不敏感 contains 即 LIKE 等价）
                        if !plan.like_terms.is_empty() {
                            let lower_texts: Vec<String> = rows
                                .iter()
                                .map(|r| r.text.to_lowercase())
                                .collect();
                            rows.into_iter()
                                .zip(lower_texts)
                                .filter(|(_, lower)| {
                                    plan.like_terms
                                        .iter()
                                        .all(|t| lower.contains(&t.to_lowercase()))
                                })
                                .map(|(r, _)| r)
                                .collect()
                        } else {
                            rows
                        }
                    }
                    Err(e) => {
                        // FTS 语法意外 → 整句 LIKE 兜底（防御红线：检索可用性
                        // 不因单个查询语法被击穿）
                        eprintln!("[kb-search] FTS MATCH 失败降级 LIKE: {}", e);
                        like_hits_raw(conn, query, limit)?
                    }
                },
                None => like_hits(conn, &plan.like_terms, limit)?,
            };
            // 语义合流（可选）：向量候选 + RRF 融合（任何失败/不一致 → 降级直通）
            let hybrid = if let Some(eng) = engine {
                let fts_ids: Vec<i64> = rows.iter().map(|r| r.chunk_id).collect();
                semantic_merge(conn, eng, query, &fts_ids, limit)?
            } else {
                None
            };
            if let Some((merged, used_semantic)) = hybrid {
                let merged_ids: Vec<i64> = merged;
                // 补齐向量独有命中（FTS 未召回但语义召回的 chunk 行）
                let have: std::collections::HashSet<i64> =
                    rows.iter().map(|r| r.chunk_id).collect();
                let missing: Vec<i64> = merged_ids
                    .iter()
                    .copied()
                    .filter(|id| !have.contains(id))
                    .collect();
                if !missing.is_empty() {
                    rows.extend(rows_by_ids(conn, &missing)?);
                }
                let by_id: std::collections::HashMap<i64, HitRow> =
                    rows.into_iter().map(|r| (r.chunk_id, r)).collect();
                rows = merged_ids
                    .iter()
                    .filter_map(|id| by_id.get(id).cloned())
                    .collect();
                if used_semantic {
                    for r in rows.iter_mut() {
                        r.score_kind = "rrf".to_string();
                    }
                }
            }
            // limit 契约统一收口（fts 候选按 8× 放大取回——过滤后必须裁回；
            // 审查 H1：此前仅在 like 过滤分支内截断，fts-only 常态超发 8 倍）
            rows.truncate(limit);
            let hits = rows
                .into_iter()
                .map(|r| KbHit {
                    snippet: build_snippet(&r.text, &plan.highlight_terms).unwrap_or_default(),
                    chunk_id: r.chunk_id,
                    source_kind: r.source_kind,
                    note_id: r.note_id,
                    fragment_id: r.fragment_id,
                    note_title: r.note_title,
                    group_name: r.group_name,
                    heading: r.heading,
                    score_kind: r.score_kind,
                })
                .collect();
            Ok(hits)
        })
    }
}

/// 按 id 列表批量取命中行（语义独有候选补齐——HIT_COLUMNS 同口径）。
fn rows_by_ids(conn: &Connection, ids: &[i64]) -> Result<Vec<HitRow>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = (0..ids.len()).map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT {} FROM kb_chunks c {} WHERE c.id IN ({})",
        HIT_COLUMNS, HIT_JOINS, placeholders
    );
    let ids_vec: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let mut stmt = conn.prepare(&sql)?;
    let hit_rows = stmt
        .query_map(rusqlite::params_from_iter(ids_vec.iter().copied()), map_hit_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut rows = hit_rows;
    rows.iter_mut().for_each(|r| r.score_kind = "rrf".to_string());
    Ok(rows)
}

/// 命中列（三通道共用；c.id 恒有——fts 通道经影子表 join 原 chunk 行）。
const HIT_COLUMNS: &str = "c.id, c.source_kind, c.note_id, c.fragment_id,
    n.title, g.name, c.heading, c.text";

/// 源元信息 join 段（笔记标题 + 碎片行 + 归属组名——note/fragment 双源共用）。
const HIT_JOINS: &str = "LEFT JOIN notes n ON n.id = c.note_id
 LEFT JOIN fragments fr ON fr.id = c.fragment_id
 LEFT JOIN note_groups g ON g.id = COALESCE(n.group_id, fr.group_id)";

/// FTS5 主链（BM25 排序 top-N）。
fn fts_hits(conn: &Connection, expr: &str, fetch: usize) -> rusqlite::Result<Vec<HitRow>> {
    let sql = format!(
        "SELECT {} FROM kb_fts f JOIN kb_chunks c ON c.id = f.chunk_id
         {} WHERE kb_fts MATCH ?1 ORDER BY bm25(kb_fts) LIMIT ?2",
        HIT_COLUMNS, HIT_JOINS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params![expr, fetch as i64], map_hit_row)?;
    let mut rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    rows.iter_mut().for_each(|r| r.score_kind = "fts".to_string());
    Ok(rows)
}

/// 纯 LIKE 通道（仅 2 字词/无 fts 候选——子串语义，短文近优先）。
fn like_hits(conn: &Connection, terms: &[String], limit: usize) -> rusqlite::Result<Vec<HitRow>> {
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let ors: Vec<&str> = (0..terms.len()).map(|_| "c.text LIKE ? ESCAPE '\\'").collect();
    let sql = format!(
        "SELECT {} FROM kb_chunks c {} WHERE ({}) ORDER BY length(c.text) ASC, c.id ASC LIMIT ?{}",
        HIT_COLUMNS,
        HIT_JOINS,
        ors.join(" OR "),
        terms.len() + 1
    );
    let patterns: Vec<String> = terms.iter().map(|t| like_pattern(t)).collect();
    let mut params: Vec<&dyn rusqlite::ToSql> =
        patterns.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let limit_i64: i64 = limit as i64;
    params.push(&limit_i64);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params), map_hit_row)?;
    let mut rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    rows.iter_mut().for_each(|r| r.score_kind = "like".to_string());
    Ok(rows)
}

/// FTS 语法兜底（整句单 LIKE——防御链末端，正常路径不触发）。
fn like_hits_raw(conn: &Connection, query: &str, limit: usize) -> rusqlite::Result<Vec<HitRow>> {
    let sql = format!(
        "SELECT {} FROM kb_chunks c {}
         WHERE c.text LIKE ?1 ESCAPE '\\' ORDER BY length(c.text) ASC LIMIT ?2",
        HIT_COLUMNS, HIT_JOINS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params![crate::kb_fts::raw_like_pattern(query.trim()), limit as i64],
        map_hit_row,
    )?;
    let mut rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    rows.iter_mut().for_each(|r| r.score_kind = "like".to_string());
    Ok(rows)
}

/// 行映射（score_kind 由调用通道事后注入——fn item 满足 HRTB，免闭包生命周期
/// 纠缠：MappedRows 的 map 回调须对任意行生命周期可用）。
fn map_hit_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<HitRow> {
    Ok(HitRow {
        chunk_id: r.get(0)?,
        source_kind: r.get(1)?,
        note_id: r.get(2)?,
        fragment_id: r.get(3)?,
        note_title: r.get(4)?,
        group_name: r.get(5)?,
        heading: r.get(6)?,
        text: r.get(7)?,
        score_kind: String::new(),
    })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；与 kb_* 同款 #[path] 挂载）。
#[cfg(test)]
#[path = "kb_search_tests.rs"]
mod tests;
