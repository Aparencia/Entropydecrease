//! 标签颜色数据层（v0.14 B 视觉系统）。
//!
//! @ai-context: tag_colors 表读写（tag 文本主键——tags 无独立表，规格 tag_id
//!              前提不存在，按最小合理偏差用 tag 名称作键）。命令层薄壳调用
//!              本层；内存库单测覆盖往返/覆盖/幂等（环境隔离）。

use rusqlite::params;

use crate::db::Db;
use crate::error::Result;

/// 标签颜色条目（tag → 色板 id）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagColor {
    pub tag: String,
    pub color: String,
}

impl Db {
    /// 全部标签颜色（空表返回空数组，非错误）。
    pub fn list_tag_colors(&self) -> Result<Vec<TagColor>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT tag, color FROM tag_colors ORDER BY tag")?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(TagColor {
                        tag: row.get(0)?,
                        color: row.get(1)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
    }

    /// 单标签颜色（无 → None；前端渲染回退默认灰用）。
    ///
    /// @ai-context: lib 内暂无生产调用方（前端 list 全量拉取，单查 API 保留为
    ///              诊断/未来增量渲染用）；测试目标已覆盖，登记 dead_code
    ///              豁免（机制先行模式，watermark_cluster 先例）。
    #[allow(dead_code)]
    pub fn get_tag_color(&self, tag: &str) -> Result<Option<String>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT color FROM tag_colors WHERE tag = ?1")?;
            let mut rows = stmt.query_map(params![tag], |row| row.get::<_, String>(0))?;
            match rows.next() {
                Some(Ok(c)) => Ok(Some(c)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 设置标签颜色（upsert：已存在覆盖；重复调用幂等）。
    pub fn set_tag_color(&self, tag: &str, color: &str) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO tag_colors (tag, color) VALUES (?1, ?2)
                 ON CONFLICT(tag) DO UPDATE SET color = excluded.color",
                params![tag, color],
            )?;
            Ok(())
        })
    }

    /// 重置标签颜色（删除条目；不存在时静默成功——幂等）。
    pub fn reset_tag_color(&self, tag: &str) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM tag_colors WHERE tag = ?1", params![tag])?;
            Ok(())
        })
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；同 db_notes 模式）。
#[cfg(test)]
#[path = "db_colors_tests.rs"]
mod tests;
