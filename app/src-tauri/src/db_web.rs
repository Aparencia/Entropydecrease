//! web 会话页面表（v0.20.4 / REQ-303 内核数据层）。
//!
//! @ai-context: kind='web' 会话 + 本表（会话 1:1 页面）——正文 MD（整篇初稿+
//!              标题层级）与元数据（URL/站点/作者/抓取时间）落此，转笔记复用
//!              既有会话↔笔记关联（notes.session_id）与列表/检索通道；
//!              正文抽取失败降级原 HTML 附件（raw_html 保留，extracted_ok=0——
//!              Foresight 兜底链：宁可存原文可再切块，不产生半成品）。

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::Db;
use crate::error::Result;

/// web 页面行（session_id 主键——kind=web 会话 1:1）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebPage {
    pub session_id: i64,
    pub url: String,
    pub site: Option<String>,
    pub author: Option<String>,
    pub published: Option<String>,
    pub markdown: String,
    /// 正文抽取失败时保留的原始 HTML（可再处理；成功时可为空省空间）
    pub raw_html: Option<String>,
    pub extracted_ok: bool,
    pub fetched_at: i64,
}

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS web_session_pages (
            session_id INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            site TEXT,
            author TEXT,
            published TEXT,
            markdown TEXT NOT NULL,
            raw_html TEXT,
            extracted_ok INTEGER NOT NULL DEFAULT 1,
            fetched_at INTEGER NOT NULL
        );
        ",
    )?;
    Ok(())
}

impl Db {
    pub fn insert_web_page(&self, page: &WebPage) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO web_session_pages
                    (session_id, url, site, author, published, markdown, raw_html, extracted_ok, fetched_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    page.session_id,
                    page.url,
                    page.site,
                    page.author,
                    page.published,
                    page.markdown,
                    page.raw_html,
                    page.extracted_ok as i64,
                    page.fetched_at
                ],
            )?;
            Ok(())
        })
    }

    pub fn get_web_page(&self, session_id: i64) -> Result<Option<WebPage>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT session_id, url, site, author, published, markdown, raw_html, extracted_ok, fetched_at
                 FROM web_session_pages WHERE session_id = ?1",
            )?;
            let mut mapped = stmt.query_map(params![session_id], row_to_page)?;
            match mapped.next() {
                Some(r) => r.map(Some).map_err(Into::into),
                None => Ok(None),
            }
        })
    }
}

fn row_to_page(row: &rusqlite::Row<'_>) -> rusqlite::Result<WebPage> {
    Ok(WebPage {
        session_id: row.get(0)?,
        url: row.get(1)?,
        site: row.get(2)?,
        author: row.get(3)?,
        published: row.get(4)?,
        markdown: row.get(5)?,
        raw_html: row.get(6)?,
        extracted_ok: row.get::<_, i64>(7)? != 0,
        fetched_at: row.get(8)?,
    })
}

#[cfg(test)]
#[path = "db_web_tests.rs"]
mod tests;
