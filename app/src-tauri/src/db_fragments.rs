//! 碎片数据层（v0.11.1；fragments 原料层 CRUD）。
//!
//! @ai-context: 碎片与笔记分表是 v4 契约明确要求（不与课程笔记混装）；
//!              本层只管读写——DomainTag 归组判定在 commands_fragments.rs
//!              （复用 detect_domain 纯函数），组 CRUD 在 db_note_groups.rs。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::kb_index::{soft_clear_fragment, soft_index_fragment};
use crate::types::{Fragment, Note};

/// fragments 表统一查询列（列顺序与 row_to_fragment 严格对应）。
const FRAGMENT_COLUMNS: &str =
    "id, text, image_path, domain_tag, group_id, source, status, created_at";

/// 新建碎片入参（id/created_at 由数据层填充）。
pub struct NewFragment {
    pub text: String,
    pub image_path: Option<String>,
    pub domain_tag: Option<String>,
    pub group_id: Option<i64>,
    pub source: String,
}

impl Db {
    /// 新建碎片，返回完整记录。
    pub fn create_fragment(&self, new: &NewFragment) -> Result<Fragment> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO fragments (text, image_path, domain_tag, group_id, source, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)",
                params![new.text, new.image_path, new.domain_tag, new.group_id, new.source, now],
            )?;
            let id = conn.last_insert_rowid();
            // v0.19.0（REQ-258）碎片一次性索引钩子（碎片不可变——无更新路径；
            // 纯图碎片 text 为空不入块；失败软记录不阻断捕获）
            if !new.text.trim().is_empty() {
                soft_index_fragment(conn, id, &new.text);
            }
            Ok(Fragment {
                id,
                text: new.text.clone(),
                image_path: new.image_path.clone(),
                domain_tag: new.domain_tag.clone(),
                group_id: new.group_id,
                source: new.source.clone(),
                status: "active".to_string(),
                created_at: now,
            })
        })
    }

    /// 列出碎片（status 过滤：active/archived/None=全部；按创建时间倒序，
    /// 同秒按 id 倒序——id 单调递增，后者更新，排序稳定）。
    pub fn list_fragments(&self, status: Option<&str>, limit: usize) -> Result<Vec<Fragment>> {
        self.with_conn(|conn| {
            let sql = match status {
                Some(_) => format!(
                    "SELECT {} FROM fragments WHERE status = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2",
                    FRAGMENT_COLUMNS
                ),
                None => format!(
                    "SELECT {} FROM fragments ORDER BY created_at DESC, id DESC LIMIT ?1",
                    FRAGMENT_COLUMNS
                ),
            };
            let mut stmt = conn.prepare(&sql)?;
            let rows = match status {
                Some(s) => stmt.query_map(params![s, limit as i64], row_to_fragment)?,
                None => stmt.query_map(params![limit as i64], row_to_fragment)?,
            };
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 按组列出碎片（组详情/结算消费；仅 active——归档项不进学习循环）。
    pub fn list_fragments_by_group(&self, group_id: i64) -> Result<Vec<Fragment>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM fragments
                 WHERE group_id = ?1 AND status = 'active'
                 ORDER BY created_at DESC, id DESC",
                FRAGMENT_COLUMNS
            ))?;
            let rows = stmt.query_map(params![group_id], row_to_fragment)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 碎片计数（组结算触发信号；按组+status 统计）。
    /// 登记豁免 dead_code：结算触发器当前用 list 长度折算，计数接口留
    /// 给 v0.11.3+ 阈值埋点面板消费。
    #[allow(dead_code)]
    pub fn count_fragments(&self, group_id: Option<i64>, status: Option<&str>) -> Result<i64> {
        self.with_conn(|conn| {
            let mut sql = "SELECT COUNT(*) FROM fragments WHERE 1=1".to_string();
            if group_id.is_some() {
                sql.push_str(" AND group_id = ?1");
            }
            if status.is_some() {
                sql.push_str(if group_id.is_some() { " AND status = ?2" } else { " AND status = ?1" });
            }
            let mut stmt = conn.prepare(&sql)?;
            let count = match (group_id, status) {
                (Some(g), Some(s)) => stmt.query_row(params![g, s], |r| r.get(0))?,
                (Some(g), None) => stmt.query_row(params![g], |r| r.get(0))?,
                (None, Some(s)) => stmt.query_row(params![s], |r| r.get(0))?,
                (None, None) => stmt.query_row([], |r| r.get(0))?,
            };
            Ok(count)
        })
    }

    /// 移动碎片到组（None=移出；用户纠错/结算归组共用；v0.11.4 命令接线）。
    pub fn update_fragment_group(&self, id: i64, group_id: Option<i64>) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE fragments SET group_id = ?1 WHERE id = ?2",
                params![group_id, id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 按 id 读取碎片；不存在返回 None（delete/移组命令的存在性校验）。
    pub fn get_fragment(&self, id: i64) -> Result<Option<Fragment>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {} FROM fragments WHERE id = ?1",
                FRAGMENT_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![id], row_to_fragment)?;
            match rows.next() {
                Some(Ok(f)) => Ok(Some(f)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 删除碎片（v0.11.4 REQ-201 用户主动删除——真删非归档）。
    ///
    /// @ai-context: 绑定闪卡经 flashcards.fragment_id ON DELETE SET NULL 自动
    ///              解绑保留（学习循环资产不被碎片删除连带——身份诚实：
    ///              卡已生成即独立资产）；结算归档走 set_fragment_status 不删。
    pub fn delete_fragment(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            // v0.19.0（REQ-258）：先清派生索引（kb_fts 影子表 FK 级联不负责——
            // 显式清理为主路径；失败软记录不阻断删除）
            soft_clear_fragment(conn, id);
            let affected = conn.execute("DELETE FROM fragments WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }

    /// 标记碎片状态（v0.11.3 结算归档：active↔archived）。
    pub fn set_fragment_status(&self, id: i64, status: &str) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE fragments SET status = ?1 WHERE id = ?2",
                params![status, id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 碎片升为笔记（v0.12.2：REQ-201 补升级出口——碎片是原料，升笔记=沉淀）。
    ///
    /// @ai-context: 单事务（建笔记 + 删碎片）——任一步失败整链回滚，不留
    ///              "笔记已建但碎片还在"的半态；图片搬运是事务内副作用
    ///              （复制失败降级纯文本笔记，碎片文本不丢——与
    ///              capture_fragment 图片降级同纪律，最坏遗留孤儿文件）。
    /// @ai-context: 图引用写 `notes-images/{note_id}/{name}`（resolve_note_image
    ///              规则 2 可解析）；source=manual、rule_version=None（手动沉淀
    ///              路径诚实降级）；碎片删除后绑定卡经外键 SET NULL 自动解绑
    ///              保留（卡是独立资产——升笔记不等于消卡）。
    pub fn promote_fragment_to_note(
        &self,
        data_dir: &std::path::Path,
        fragment_id: i64,
        title: &str,
        group_id: Option<i64>,
    ) -> Result<Note> {
        let now = unix_seconds();
        // 显式事务（审查修复）：with_conn 只给 &Connection 无法开事务，而
        // rusqlite 默认 autocommit——多语句各自提交，④ 失败会留下"笔记已建/
        // 碎片未删"半态。与 versioned_save 同模式：直接锁 + conn.transaction()。
        let mut conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let tx = conn.transaction()?;
        // ① 读碎片（事务内读取——存在性校验与删除同锁，防竞态双升）
        let fragment = {
            let mut stmt = tx.prepare(&format!(
                "SELECT {} FROM fragments WHERE id = ?1",
                FRAGMENT_COLUMNS
            ))?;
            let mut rows = stmt.query_map(params![fragment_id], row_to_fragment)?;
            match rows.next() {
                Some(Ok(f)) => f,
                Some(Err(e)) => return Err(e.into()),
                None => {
                    return Err(crate::error::AppError::Db(format!(
                        "碎片不存在: {}",
                        fragment_id
                    )))
                }
            }
        };
        // ② 建笔记（正文先落碎片文本；图片在 ③ 补写）
        tx.execute(
            "INSERT INTO notes (title, content, source, session_id, rule_version, purify_stats, tags, properties, group_id, created_at, updated_at)
             VALUES (?1, ?2, 'manual', NULL, NULL, NULL, '[]', NULL, ?3, ?4, ?4)",
            params![title, fragment.text, group_id, now],
        )?;
        let note_id = tx.last_insert_rowid();
        // ③ 图片搬运 fragments/ → notes-images/{note_id}/（失败降级纯文本）
        let mut content = fragment.text.clone();
        if let Some(rel) = fragment.image_path.as_deref() {
            match copy_fragment_image(data_dir, note_id, rel) {
                Some(img_ref) => {
                    content = format!("{}\n\n![]({})\n", content, img_ref);
                }
                None => {
                    eprintln!(
                        "[db_fragments] 碎片 {} 图片搬运失败（降级纯文本笔记）: {}",
                        fragment_id, rel
                    );
                }
            }
        }
        if content != fragment.text {
            tx.execute(
                "UPDATE notes SET content = ?1 WHERE id = ?2",
                params![content, note_id],
            )?;
        }
        // ④ 删碎片（绑定卡自动解绑保留）——与 ② 同事务：任一步失败整链回滚；
        //    v0.19.0：先清碎片派生索引（影子表级联不负责——同事务显式清理）
        soft_clear_fragment(&tx, fragment_id);
        tx.execute("DELETE FROM fragments WHERE id = ?1", params![fragment_id])?;
        // v0.19.0：升笔记 = 建笔记分支（promote 若绕过 versioned_save 保存收口
        // 则在此建笔记分支索引最终正文——事务内软失败记录不阻断）
        if !content.trim().is_empty() {
            crate::kb_index::soft_rebuild_note(&tx, note_id, &content);
        }
        tx.commit()?;
        // ⑤ 组装返回（与库内一致）
        Ok(Note {
            id: note_id,
            title: title.to_string(),
            content,
            source: "manual".to_string(),
            session_id: None,
            rule_version: None,
            purify_stats: None,
            tags: "[]".to_string(),
            properties: None,
            pin: 0,
            group_id,
            created_at: now,
            updated_at: now,
        })
    }
}

/// 搬运碎片图进笔记图目录（返回 notes-images 相对引用；失败返回 None 降级）。
///
/// @ai-context: 只放行 fragments/ 前缀 + 防 `..` 穿越（与 resolve_fragment_image
///              落盘口径一致）；源文件缺失/IO 失败 → None（调用方降级纯文本）。
fn copy_fragment_image(data_dir: &std::path::Path, note_id: i64, rel: &str) -> Option<String> {
    let rel_trim = rel.trim_start_matches(['/', '\\']);
    if !rel_trim.starts_with("fragments/") || rel_trim.split(['/', '\\']).any(|seg| seg == "..") {
        return None;
    }
    let src = data_dir.join(rel_trim);
    if !src.is_file() {
        return None;
    }
    // 文件名沿用碎片存储名（毫秒+随机后缀已防碰撞；同笔记内无冲突）
    let name = std::path::Path::new(rel_trim).file_name()?.to_str()?.to_string();
    let target_dir = data_dir.join("notes-images").join(note_id.to_string());
    std::fs::create_dir_all(&target_dir).ok()?;
    std::fs::copy(&src, target_dir.join(&name)).ok()?;
    Some(format!("notes-images/{}/{}", note_id, name))
}

/// 把 rusqlite 行映射为 Fragment。
fn row_to_fragment(row: &rusqlite::Row<'_>) -> rusqlite::Result<Fragment> {
    Ok(Fragment {
        id: row.get(0)?,
        text: row.get(1)?,
        image_path: row.get(2)?,
        domain_tag: row.get(3)?,
        group_id: row.get(4)?,
        source: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get(7)?,
    })
}

/// 单测独立文件。
#[cfg(test)]
#[path = "db_fragments_tests.rs"]
mod tests;
