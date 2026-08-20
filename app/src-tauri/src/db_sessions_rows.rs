//! 会话数据行映射（db_sessions.rs 拆分，保持主文件 ≤300 行——AGENTS.md §3）。
//!
//! @ai-context: row_to_* 为 rusqlite 行 → 领域类型映射纯函数；unix_seconds 为时间工具。

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Row;

use crate::types::{Session, SessionListItem, SessionOcrBlock, SessionSegment};

/// 把 rusqlite 行映射为 Session。
pub fn row_to_session(row: &Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        source_window: row.get(2)?,
        started_at: row.get(3)?,
        ended_at: row.get(4)?,
        status: row.get(5)?,
        profile: row.get(6)?,
    })
}

/// 把 rusqlite 行映射为 SessionListItem（v0.7.1 列表标记，10 列）。
///
/// @ai-context: 列序与 list_sessions SQL 对齐：前 7 列 = sessions 原列，
///              8 = has_content（EXISTS 子查询）、9 = note_id、10 = note_title。
pub fn row_to_session_list_item(row: &Row<'_>) -> rusqlite::Result<SessionListItem> {
    let session = Session {
        id: row.get(0)?,
        title: row.get(1)?,
        source_window: row.get(2)?,
        started_at: row.get(3)?,
        ended_at: row.get(4)?,
        status: row.get(5)?,
        profile: row.get(6)?,
    };
    let has_content = row.get::<_, i64>(7)? != 0;
    let note_id: Option<i64> = row.get(8)?;
    let note_title: Option<String> = row.get(9)?;
    Ok(SessionListItem {
        session,
        has_note: note_id.is_some(),
        note_id,
        note_title,
        has_content,
    })
}

/// 把 rusqlite 行映射为 SessionSegment。
pub fn row_to_segment(row: &Row<'_>) -> rusqlite::Result<SessionSegment> {
    Ok(SessionSegment {
        id: row.get(0)?,
        session_id: row.get(1)?,
        start_ms: row.get::<_, i64>(2)? as u64,
        end_ms: row.get::<_, i64>(3)? as u64,
        text: row.get(4)?,
        source: row.get(5)?,
        confidence: row.get(6)?,
        // REQ-103：段内平均音量（旧库无列时迁移补 NULL → None）
        volume: row.get(7)?,
        // REQ-109：语速/停顿/speaker 影子列（旧库迁移补 NULL → None）
        speech_rate: row.get(8)?,
        pause_ms: row.get::<_, Option<i64>>(9)?.map(|v| v as u64),
        speaker: row.get(10)?,
    })
}

/// 把 rusqlite 行映射为 SessionOcrBlock（9 列：原 7 列 + bbox JSON + screen_id）。
///
/// @ai-context: v0.7.3（REQ-156）：bbox 为 JSON {x,y,w,h}（帧坐标系，null=旧数据）；
///              screen_id 为屏号（null=旧数据无屏——视图层聚类兜底）。
pub fn row_to_ocr_block(row: &Row<'_>) -> rusqlite::Result<SessionOcrBlock> {
    let bbox_json: Option<String> = row.get(7)?;
    let bbox = match bbox_json.as_deref() {
        Some(json) => serde_json::from_str(json).unwrap_or(None), // 解析失败诚实降级 None
        None => None,
    };
    Ok(SessionOcrBlock {
        id: row.get(0)?,
        session_id: row.get(1)?,
        timestamp_ms: row.get::<_, i64>(2)? as u64,
        text: row.get(3)?,
        score: row.get(4)?,
        region: row.get(5)?,
        region_kind: row.get(6)?,
        bbox,
        screen_id: row.get(8)?,
    })
}

/// 当前 Unix 秒。
pub fn unix_seconds() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}
