//! 图内文字检索（REQ-133 IMG-1 / v0.7.0 M3）。
//!
//! @ai-context: "搜 PPT 上的词 → 命中图"——session_ocr_blocks 的 OCR 块检索。
//!              M2 修复（审查）：原实现逐会话循环 list_ocr_blocks（最多 500 次
//!              查询 + 每次抢全局锁）→ 重写为单条参数化 SQL（会话筛选子查询 +
//!              屏区间聚合 LEFT JOIN），一次锁一次查询；返回结构与排序语义不变
//!              （会话 started_at DESC, id DESC；会话内 timestamp_ms ASC）。
//! @ai-context: 与 REQ-089（已定位图的跳转，V1.0）互补——本命令只返回命中
//!              图与 OCR 文本，跳转由前端按时间戳定位会话详情。

use std::path::Path;

use rusqlite::params;

use crate::db::{escape_like, Db};
use crate::error::Result;

/// 图内文字检索命中。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrBlockHit {
    pub session_id: i64,
    pub session_title: String,
    pub ocr_block_id: i64,
    /// 关键帧相对会话起点时间戳（图定位基准）
    pub timestamp_ms: u64,
    /// 命中 OCR 文本（含关键词，前端高亮）
    pub text: String,
    /// 命中区域（subtitle=字幕 / full=画面要点）
    pub region: String,
    /// 命中图相对路径（full/xxx.webp；无图 None——纯 OCR 块无归档）
    pub image_path: Option<String>,
    /// v0.7.3（REQ-160）：命中块所属屏（None=旧数据无屏）
    #[serde(default)]
    pub screen_id: Option<i64>,
    /// 屏时间区间（first/last_seen；屏定位基准）
    #[serde(default)]
    pub screen_first_ms: Option<u64>,
    #[serde(default)]
    pub screen_last_ms: Option<u64>,
}

/// 会话检索范围上限（与旧实现 list_sessions(None, 500, 0) 同口径）。
const SESSION_SCOPE: i64 = 500;

/// 检索会话 OCR 块（REQ-133）：关键词 → 命中块 + 会话标题 + 图路径 + 屏区间。
///
/// @ai-context: 只搜画面要点（region=full——字幕区是转写冗余，搜字幕用段搜索）；
///              大小写不敏感（LIKE 对 ASCII 天然忽略大小写，CJK 无大小写概念）；
///              结果有界（100 条防超大 payload）。
/// @ai-context: M2 修复——单条 SQL 语义等价于旧逐会话循环：
///              ① 会话范围 = 最近 500 会话（started_at DESC, id DESC 子查询）；
///              ② 屏区间 = 同会话同屏全部块（含字幕块，旧实现不过滤 region）
///              的 min/max 时间戳（LEFT JOIN 聚合子查询）；
///              ③ 排序 = 会话倒序 + 块时间升序（与旧双层循环一致）。
/// @param data_dir - 应用数据目录（图存在性校验；None 时 image_path 恒 None）
pub fn search_ocr_blocks(
    db: &Db,
    data_dir: Option<&Path>,
    keyword: &str,
    limit: usize,
) -> Result<Vec<OcrBlockHit>> {
    let kw = keyword.trim();
    if kw.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 100);
    // 文本匹配走 LIKE 参数绑定 + ESCAPE（与项目 escape_like 口径一致——
    // 用户输入的 %/_/\ 作字面量，杜绝通配符注入）
    let pattern = format!("%{}%", escape_like(kw));
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT b.id, b.session_id, s.title, b.timestamp_ms, b.text, b.region,
                    b.screen_id, sr.first_ms, sr.last_ms
             FROM session_ocr_blocks b
             JOIN sessions s ON s.id = b.session_id
             LEFT JOIN (
                 SELECT session_id, screen_id,
                        MIN(timestamp_ms) AS first_ms, MAX(timestamp_ms) AS last_ms
                 FROM session_ocr_blocks
                 WHERE screen_id IS NOT NULL
                 GROUP BY session_id, screen_id
             ) sr ON sr.session_id = b.session_id AND sr.screen_id = b.screen_id
             WHERE b.region = 'full'
               AND b.text LIKE ?1 ESCAPE '\\'
               AND b.session_id IN (
                   SELECT id FROM sessions ORDER BY started_at DESC, id DESC LIMIT ?2
               )
             ORDER BY s.started_at DESC, s.id DESC, b.timestamp_ms ASC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![pattern, SESSION_SCOPE, limit as i64], |row| {
            Ok(OcrBlockHit {
                ocr_block_id: row.get(0)?,
                session_id: row.get(1)?,
                session_title: row.get(2)?,
                timestamp_ms: row.get::<_, i64>(3)? as u64,
                text: row.get(4)?,
                region: row.get(5)?,
                screen_id: row.get(6)?,
                screen_first_ms: row.get::<_, Option<i64>>(7)?.map(|v| v as u64),
                screen_last_ms: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
                // 先占位 None——存在性校验需要文件系统，出 SQL 后统一补
                image_path: None,
            })
        })?;
        let mut hits: Vec<OcrBlockHit> = rows
            .collect::<rusqlite::Result<Vec<_>>>()
            // 闭包内 ? 的目标错误类型需显式标注（Into::into 多实现歧义）
            .map_err(crate::error::AppError::from)?;
        // M4 修复：图路径真实解析（文件系统存在性校验，见 image_path_for）
        for hit in &mut hits {
            hit.image_path = image_path_for(data_dir, hit.session_id, hit.timestamp_ms);
        }
        Ok(hits)
    })
}

/// 命中图相对路径真实解析（M4 修复：替代恒 Some 的占位实现）。
///
/// @ai-context: 存储约定（image_store.rs）：`data_dir/session-images/<sid>/full/<ts>.webp`。
///              Why 校验存在性——① OCR 块可能无归档图（预算耗尽/编码失败降级）；
///              ② image_store 双指纹去重会让帧复用更早时间戳的文件，块时间戳对应
///              文件可能根本不存在；③ 旧库/清理后文件已删。文件不在 → None
///              （前端无图降级，与 screens::attach_images 同口径）。
fn image_path_for(data_dir: Option<&Path>, session_id: i64, timestamp_ms: u64) -> Option<String> {
    let base = data_dir?;
    let rel = format!("full/{}.webp", timestamp_ms);
    let abs = base
        .join("session-images")
        .join(session_id.to_string())
        .join(&rel);
    abs.is_file().then_some(rel)
}

/// 检索入口（command 包装；关键词经 escape_like 参数绑定，无拼接注入面）。
pub fn search_command(db: &Db, data_dir: Option<&Path>, keyword: &str) -> Result<Vec<OcrBlockHit>> {
    search_ocr_blocks(db, data_dir, keyword, 100)
}

/// 单测（内存库；图路径测试用 tempfile 隔离）。
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{NewSession, NewSessionOcrBlock};

    fn add_block(db: &Db, sid: i64, ts: u64, text: &str, region: &str, screen_id: Option<i64>) {
        db.add_ocr_block(&NewSessionOcrBlock {
            session_id: sid, timestamp_ms: ts, text: text.into(),
            score: 0.9, region: region.into(), region_kind: None,
            bbox: None, screen_id,
        }).unwrap();
    }

    #[test]
    fn search_finds_full_region_only() {
        // Arrange：full 区含关键词 + subtitle 区含关键词（不应命中）
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "PPT 课".into(), source_window: None, profile: None, kind: None,
        }).unwrap();
        add_block(&db, s.id, 1000, "梯度下降算法详解", "full", None);
        add_block(&db, s.id, 2000, "梯度下降（字幕）", "subtitle", None);
        // Act
        let hits = search_ocr_blocks(&db, None, "梯度", 10).unwrap();
        // Assert：只命中 full 区
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].region, "full");
        assert_eq!(hits[0].session_title, "PPT 课");
        assert_eq!(hits[0].timestamp_ms, 1000);
    }

    #[test]
    fn search_empty_keyword_no_hits() {
        let db = Db::open(":memory:").unwrap();
        assert!(search_ocr_blocks(&db, None, "  ", 10).unwrap().is_empty());
    }

    #[test]
    fn search_case_insensitive() {
        // Arrange：英文关键词大小写不敏感（LIKE ASCII 口径）
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "t".into(), source_window: None, profile: None, kind: None,
        }).unwrap();
        add_block(&db, s.id, 500, "Python 教程", "full", None);
        // Act & Assert
        assert_eq!(search_ocr_blocks(&db, None, "python", 10).unwrap().len(), 1);
        assert_eq!(search_ocr_blocks(&db, None, "PYTHON", 10).unwrap().len(), 1);
    }

    #[test]
    fn search_escapes_like_wildcards() {
        // Arrange：关键词含 % 应作字面量（escape_like 口径）
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "t".into(), source_window: None, profile: None, kind: None,
        }).unwrap();
        add_block(&db, s.id, 100, "50%off 促销", "full", None);
        add_block(&db, s.id, 200, "普通内容", "full", None);
        // Act & Assert：只命中字面含 "%off" 的块
        let hits = search_ocr_blocks(&db, None, "%off", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].timestamp_ms, 100);
    }

    #[test]
    fn search_limit_bounded() {
        // Arrange：多命中 → 结果有界
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "t".into(), source_window: None, profile: None, kind: None,
        }).unwrap();
        for i in 0..5 {
            add_block(&db, s.id, i * 100, &format!("关键词{}", i), "full", None);
        }
        // Act & Assert：limit=3
        assert_eq!(search_ocr_blocks(&db, None, "关键词", 3).unwrap().len(), 3);
    }

    #[test]
    fn search_returns_screen_range_across_regions() {
        // Arrange：同屏含 full 块(2000) 与 subtitle 块(500/3000)——
        // 屏区间应取全部块的 min/max（与旧实现口径一致）
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "t".into(), source_window: None, profile: None, kind: None,
        }).unwrap();
        add_block(&db, s.id, 500, "字幕行一", "subtitle", Some(7));
        add_block(&db, s.id, 2000, "画面要点目标", "full", Some(7));
        add_block(&db, s.id, 3000, "字幕行二", "subtitle", Some(7));
        // Act
        let hits = search_ocr_blocks(&db, None, "目标", 10).unwrap();
        // Assert：命中 full 块且屏区间含字幕块时间
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].screen_id, Some(7));
        assert_eq!(hits[0].screen_first_ms, Some(500));
        assert_eq!(hits[0].screen_last_ms, Some(3000));
    }

    #[test]
    fn image_path_resolves_only_when_file_exists() {
        // Arrange：临时数据目录——会话 1 有归档图，命中块时间戳对应文件不存在
        let db = Db::open(":memory:").unwrap();
        let dir = tempfile::tempdir().unwrap();
        let s = db.create_session(&NewSession {
            title: "t".into(), source_window: None, profile: None, kind: None,
        }).unwrap();
        add_block(&db, s.id, 1000, "有图画面", "full", None);
        add_block(&db, s.id, 2000, "无图画面", "full", None);
        let full_dir = dir.path().join("session-images").join(s.id.to_string()).join("full");
        std::fs::create_dir_all(&full_dir).unwrap();
        std::fs::write(full_dir.join("1000.webp"), b"img").unwrap();
        // Act
        let hits = search_ocr_blocks(&db, Some(dir.path()), "画面", 10).unwrap();
        // Assert：文件存在 → Some(相对路径)；不存在 → None（不再假数据）
        assert_eq!(hits.len(), 2);
        let with_img = hits.iter().find(|h| h.timestamp_ms == 1000).unwrap();
        let without_img = hits.iter().find(|h| h.timestamp_ms == 2000).unwrap();
        assert_eq!(with_img.image_path.as_deref(), Some("full/1000.webp"));
        assert_eq!(without_img.image_path, None);
    }
}
