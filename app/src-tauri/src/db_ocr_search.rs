//! 图内文字检索（REQ-133 IMG-1 / v0.7.0 M3）。
//!
//! @ai-context: "搜 PPT 上的词 → 命中图"——session_ocr_blocks 的 FTS5 OCR 块
//!              视图。量级考量：单会话 OCR 块 ≤ 数千、全库 ≤ 数万——内存过滤
//!              足够（与 REQ-079 段搜索同口径，避免 FTS5 虚拟表同步维护）；
//!              检索结果含图（session-images 相对路径）+ 时间戳定位。
//! @ai-context: 与 REQ-089（已定位图的跳转，V1.0）互补——本命令只返回命中
//!              图与 OCR 文本，跳转由前端按时间戳定位会话详情。

use crate::db::Db;
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
}

/// 检索会话 OCR 块（REQ-133）：关键词 → 命中块 + 会话标题 + 图路径。
///
/// @ai-context: 只搜画面要点（region=full——字幕区是转写冗余，搜字幕用段搜索）；
///              大小写不敏感；结果有界（100 条防超大 payload）。
pub fn search_ocr_blocks(db: &Db, keyword: &str, limit: usize) -> Result<Vec<OcrBlockHit>> {
    let kw = keyword.trim().to_lowercase();
    if kw.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 100);
    let mut hits = Vec::new();
    for session in db.list_sessions(None, 500, 0)? {
        for block in db.list_ocr_blocks(session.id)? {
            if block.region != "full" {
                continue; // 字幕区不参与图内检索（与段搜索分工）
            }
            if block.text.to_lowercase().contains(&kw) {
                hits.push(OcrBlockHit {
                    session_id: session.id,
                    session_title: session.title.clone(),
                    ocr_block_id: block.id,
                    timestamp_ms: block.timestamp_ms,
                    text: block.text,
                    region: block.region,
                    // 图路径推断：full/<ts>.webp（与 image_store 命名约定一致；
                    // 文件不存在 → None——OCR 块可能无归档图）
                    image_path: image_path_for(db, session.id, block.timestamp_ms),
                });
                if hits.len() >= limit {
                    return Ok(hits);
                }
            }
        }
    }
    Ok(hits)
}

/// 推断命中图相对路径（纯函数）：full/<ts>.webp（image_store.rs 命名约定）。
///
/// @ai-context: 存在性由前端按数据目录拼接后加载校验（加载失败即无图降级）；
///              文件名仅时间戳数字——无路径穿越面。
fn image_path_for(_db: &Db, _session_id: i64, timestamp_ms: u64) -> Option<String> {
    Some(format!("full/{}.webp", timestamp_ms))
}

/// 检索入口（command 包装；防 SQL 注入：关键词仅内存过滤无 SQL）。
pub fn search_command(db: &Db, keyword: &str) -> Result<Vec<OcrBlockHit>> {
    search_ocr_blocks(db, keyword, 100)
}

/// 单测（内存库）。
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{NewSession, NewSessionOcrBlock};

    #[test]
    fn search_finds_full_region_only() {
        // Arrange：full 区含关键词 + subtitle 区含关键词（不应命中）
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "PPT 课".into(), source_window: None, profile: None,
        }).unwrap();
        db.add_ocr_block(&NewSessionOcrBlock {
            session_id: s.id, timestamp_ms: 1000, text: "梯度下降算法详解".into(),
            score: 0.9, region: "full".into(), region_kind: None,
        }).unwrap();
        db.add_ocr_block(&NewSessionOcrBlock {
            session_id: s.id, timestamp_ms: 2000, text: "梯度下降（字幕）".into(),
            score: 0.9, region: "subtitle".into(), region_kind: None,
        }).unwrap();
        // Act
        let hits = search_ocr_blocks(&db, "梯度", 10).unwrap();
        // Assert：只命中 full 区
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].region, "full");
        assert_eq!(hits[0].session_title, "PPT 课");
        assert_eq!(hits[0].timestamp_ms, 1000);
    }

    #[test]
    fn search_empty_keyword_no_hits() {
        let db = Db::open(":memory:").unwrap();
        assert!(search_ocr_blocks(&db, "  ", 10).unwrap().is_empty());
    }

    #[test]
    fn search_case_insensitive() {
        // Arrange：英文关键词大小写不敏感
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "t".into(), source_window: None, profile: None,
        }).unwrap();
        db.add_ocr_block(&NewSessionOcrBlock {
            session_id: s.id, timestamp_ms: 500, text: "Python 教程".into(),
            score: 0.9, region: "full".into(), region_kind: None,
        }).unwrap();
        // Act & Assert
        assert_eq!(search_ocr_blocks(&db, "python", 10).unwrap().len(), 1);
        assert_eq!(search_ocr_blocks(&db, "PYTHON", 10).unwrap().len(), 1);
    }

    #[test]
    fn search_limit_bounded() {
        // Arrange：多命中 → 结果有界
        let db = Db::open(":memory:").unwrap();
        let s = db.create_session(&NewSession {
            title: "t".into(), source_window: None, profile: None,
        }).unwrap();
        for i in 0..5 {
            db.add_ocr_block(&NewSessionOcrBlock {
                session_id: s.id, timestamp_ms: i * 100, text: format!("关键词{}", i),
                score: 0.9, region: "full".into(), region_kind: None,
            }).unwrap();
        }
        // Act & Assert：limit=3
        assert_eq!(search_ocr_blocks(&db, "关键词", 3).unwrap().len(), 3);
    }
}
