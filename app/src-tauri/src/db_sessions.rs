//! SQLite 会话数据层（REQ-010，ADR-004）。
//!
//! @ai-context: sessions / session_segments / session_ocr_blocks 三表的读写，
//!              与 db.rs 的 notes 数据层同构（同一 Db 连接，跨文件 impl）。
//! @ai-context: 会话是实时捕获链路的主产物——转写段与 OCR 块按时间轴对齐落库，
//!              应用崩溃不丢已识别内容（实时落库策略，ADR-004 §4）。
//! @ai-context: 本模块只做数据读写，无业务规则；会话→笔记的编排在 commands_session.rs。
//! @ai-context: 行映射/时间工具在 db_sessions_rows.rs（保持本文件 ≤300 行，AGENTS.md §3）。

use rusqlite::{params};

use crate::db::Db;
use crate::db_sessions_rows::{row_to_ocr_block, row_to_segment, row_to_session, row_to_session_list_item, unix_seconds};
use crate::error::Result;
use crate::types::{
    NewSession, NewSessionOcrBlock, NewSessionSegment, Session, SessionListItem,
    SessionOcrBlock, SessionSegment,
};

/// 会话状态常量（与 schema 注释保持一致，禁止魔法字符串散落）。
pub const SESSION_STATUS_RECORDING: &str = "recording";
pub const SESSION_STATUS_FINISHED: &str = "finished";
pub const SESSION_STATUS_FAILED: &str = "failed";

impl Db {
    /// 新建会话（status=recording，started_at=now），返回完整记录。
    pub fn create_session(&self, new: &NewSession) -> Result<Session> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO sessions (title, source_window, started_at, status, profile, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![new.title, new.source_window, now, SESSION_STATUS_RECORDING, new.profile, new.kind],
            )?;
            let id = conn.last_insert_rowid();
            // REQ-277：新会话生成对外 uid（同事务；旧 schema 测试缺列静默跳过）
            crate::db_uid::ensure_uid(conn, crate::db_uid::TAB_SESSIONS, crate::db_uid::KIND_SESSION, id, now)?;
            Ok(Session {
                id,
                title: new.title.clone(),
                source_window: new.source_window.clone(),
                started_at: now,
                ended_at: None,
                status: SESSION_STATUS_RECORDING.to_string(),
                profile: new.profile.clone(),
                kind: new.kind.clone(),
            })
        })
    }

    /// 结束会话（status=finished，ended_at=now）；对已结束会话为幂等（不覆盖）。
    pub fn finish_session(&self, id: i64) -> Result<bool> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE sessions SET status = ?1, ended_at = ?2 WHERE id = ?3 AND status = ?4",
                params![SESSION_STATUS_FINISHED, now, id, SESSION_STATUS_RECORDING],
            )?;
            Ok(affected > 0)
        })
    }

    /// 按关键词（标题/窗口名，可空）+ 分页列出会话（新→旧），带转化状态标记。
    ///
    /// @ai-context: keyword 经 LIKE ESCAPE 转义防注入（与 search_notes 同口径）；
    ///              占位符用顺序 ? 而非编号 ?1（keyword 缺失时编号会错位）。
    /// @ai-context: v0.7.1：has_content（有段/有 OCR）与最新关联笔记（id/标题）子查询
    ///              一并取回——列表筛选与"待转化"判定零额外往返；量级 ≤200 条可忽略。
    pub fn list_sessions(
        &self,
        keyword: Option<&str>,
        limit: u64,
        offset: u64,
    ) -> Result<Vec<SessionListItem>> {
        self.with_conn(|conn| {
            let mut sql = String::from(
                "SELECT s.id, s.title, s.source_window, s.started_at, s.ended_at, s.status, s.profile, s.kind,
                        (EXISTS(SELECT 1 FROM session_segments ss WHERE ss.session_id = s.id)
                         OR EXISTS(SELECT 1 FROM session_ocr_blocks so WHERE so.session_id = s.id)) AS has_content,
                        (SELECT n.id FROM notes n WHERE n.session_id = s.id
                         ORDER BY n.created_at DESC, n.id DESC LIMIT 1) AS note_id,
                        (SELECT n.title FROM notes n WHERE n.session_id = s.id
                         ORDER BY n.created_at DESC, n.id DESC LIMIT 1) AS note_title
                 FROM sessions s",
            );
            let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(kw) = keyword {
                if !kw.trim().is_empty() {
                    let escaped = escape_like(kw);
                    sql.push_str(
                        " WHERE s.title LIKE ? ESCAPE '\\' OR s.source_window LIKE ? ESCAPE '\\'",
                    );
                    // 同一关键词绑定到两个 LIKE 占位符（各一次）
                    let pattern = format!("%{}%", escaped);
                    args.push(Box::new(pattern.clone()));
                    args.push(Box::new(pattern));
                }
            }
            sql.push_str(" ORDER BY s.started_at DESC, s.id DESC LIMIT ? OFFSET ?");
            args.push(Box::new(limit));
            args.push(Box::new(offset));

            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(
                rusqlite::params_from_iter(args.iter().map(|b| b.as_ref())),
                row_to_session_list_item,
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 按 id 读取会话；不存在返回 None。
    pub fn get_session(&self, id: i64) -> Result<Option<Session>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, source_window, started_at, ended_at, status, profile, kind FROM sessions WHERE id = ?1",
            )?;
            let mut rows = stmt.query_map(params![id], row_to_session)?;
            match rows.next() {
                Some(Ok(session)) => Ok(Some(session)),
                Some(Err(e)) => Err(e.into()),
                None => Ok(None),
            }
        })
    }

    /// 删除会话（外键级联清理子表，依赖 open 时 PRAGMA foreign_keys=ON）。
    pub fn delete_session(&self, id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
            Ok(affected > 0)
        })
    }

    // ── REQ-282（v0.19.6）：标题内容化 A 层 ──

    /// 近 N 天非失败会话的标题（同源去重候选；录制/已结束都算，失败排除）。
    pub fn recent_session_titles(&self, days: i64) -> Result<Vec<String>> {
        let since = unix_seconds() - days.saturating_mul(86_400);
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT title FROM sessions WHERE status <> ?1 AND started_at >= ?2
                 ORDER BY started_at DESC, id DESC LIMIT 200",
            )?;
            let rows = stmt.query_map(params![SESSION_STATUS_FAILED, since], |row| {
                row.get::<_, String>(0)
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 人工改名（title_kind=manual——此后首句/AI 自动升级永不覆写）。
    pub fn update_session_title(&self, id: i64, title: &str) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE sessions SET title = ?1, title_kind = 'manual' WHERE id = ?2",
                params![title, id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 首句自动升级（REQ-282）：取首个可用转写句（8–40 字）为标题——
    /// 仅当 title_kind='source' 且标题确有变化时写（manual 永不被覆写）。
    pub fn auto_title_upgrade(&self, session_id: i64) -> Result<bool> {
        let segments = self.list_segments(session_id)?;
        let Some(candidate) =
            crate::title_rules::first_line_title(segments.iter().map(|seg| seg.text.as_str()))
        else {
            return Ok(false);
        };
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE sessions SET title = ?1 WHERE id = ?2 AND title_kind = 'source' AND title <> ?1",
                params![candidate, session_id],
            )?;
            Ok(affected > 0)
        })
    }

    /// 追加一条转写段（实时落库）。
    pub fn add_segment(&self, new: &NewSessionSegment) -> Result<SessionSegment> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO session_segments (session_id, start_ms, end_ms, text, source, confidence, volume, speech_rate, pause_ms, speaker)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![new.session_id, new.start_ms, new.end_ms, new.text, new.source, new.confidence, new.volume, new.speech_rate, new.pause_ms, new.speaker],
            )?;
            Ok(SessionSegment {
                id: conn.last_insert_rowid(),
                session_id: new.session_id,
                start_ms: new.start_ms,
                end_ms: new.end_ms,
                text: new.text.clone(),
                source: new.source.clone(),
                confidence: new.confidence,
                volume: new.volume,
                speech_rate: new.speech_rate,
                pause_ms: new.pause_ms,
                speaker: new.speaker.clone(),
            })
        })
    }

    /// 批量追加转写段（单事务全量插入——TD-013 修正：注释曾写"100 段/批"，与实际单事务全量不符）。
    ///
    /// @ai-context: 供 M7 实时捕获链路使用（当前阶段尚无调用方，登记豁免 dead_code）；
    ///              批次大小由调用方控制，本函数不自动分片。
    #[allow(dead_code)]
    pub fn add_segments_batch(&self, items: &[NewSessionSegment]) -> Result<usize> {
        if items.is_empty() {
            return Ok(0);
        }
        self.with_conn(|conn| {
            conn.execute("BEGIN TRANSACTION", [])?;
            let result = (|| -> rusqlite::Result<usize> {
                let mut inserted = 0;
                {
                    let mut stmt = conn.prepare(
                        "INSERT INTO session_segments (session_id, start_ms, end_ms, text, source, confidence, volume, speech_rate, pause_ms, speaker)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    )?;
                    for item in items {
                        stmt.execute(params![
                            item.session_id, item.start_ms, item.end_ms, item.text, item.source, item.confidence, item.volume, item.speech_rate, item.pause_ms, item.speaker
                        ])?;
                        inserted += 1;
                    }
                }
                Ok(inserted)
            })();
            match result {
                Ok(n) => {
                    conn.execute("COMMIT", [])?;
                    Ok(n)
                }
                Err(e) => {
                    let _ = conn.execute("ROLLBACK", []);
                    Err(e)
                }
            }
            .map_err(Into::into)
        })
    }

    /// 追加一条 OCR 块（实时落库；v0.7.3 起双写 bbox/screen_id——REQ-156）。
    pub fn add_ocr_block(&self, new: &NewSessionOcrBlock) -> Result<SessionOcrBlock> {
        self.with_conn(|conn| {
            // bbox 序列化为 JSON {x,y,w,h}（帧坐标系；None → NULL=旧口径）
            let bbox_json = new.bbox.map(|b| {
                serde_json::json!({ "x": b.x, "y": b.y, "w": b.w, "h": b.h }).to_string()
            });
            conn.execute(
                "INSERT INTO session_ocr_blocks (session_id, timestamp_ms, text, score, region, region_kind, bbox, screen_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![new.session_id, new.timestamp_ms, new.text, new.score, new.region, new.region_kind, bbox_json, new.screen_id],
            )?;
            Ok(SessionOcrBlock {
                id: conn.last_insert_rowid(),
                session_id: new.session_id,
                timestamp_ms: new.timestamp_ms,
                text: new.text.clone(),
                score: new.score,
                region: new.region.clone(),
                region_kind: new.region_kind.clone(),
                bbox: new.bbox,
                screen_id: new.screen_id,
            })
        })
    }

    /// 列出会话全部转写段（按时间轴升序）。
    pub fn list_segments(&self, session_id: i64) -> Result<Vec<SessionSegment>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, start_ms, end_ms, text, source, confidence, volume, speech_rate, pause_ms, speaker
                 FROM session_segments WHERE session_id = ?1 ORDER BY start_ms ASC",
            )?;
            let rows = stmt.query_map(params![session_id], row_to_segment)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 清空会话全部转写段（融合重写前调用——ADR-005 §3）。
    ///
    /// @ai-context: 供实时会话停止时的融合重写链路使用（live_session.rs）。
    #[allow(dead_code)]
    pub fn delete_segments(&self, session_id: i64) -> Result<usize> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "DELETE FROM session_segments WHERE session_id = ?1",
                params![session_id],
            )?;
            Ok(affected)
        })
    }

    /// 原子替换会话转写段：单事务内先删旧段再插融合段（ADR-005 §3，审查 M1 修复）。
    ///
    /// @ai-context: 删除与插入在同一事务——任一步失败整体回滚，不丢原段
    ///              （live_session_frame::rewrite_with_fusion 使用，替代 delete+insert 两步）。
    pub fn replace_segments(&self, session_id: i64, items: &[NewSessionSegment]) -> Result<usize> {
        self.with_conn(|conn| {
            conn.execute("BEGIN TRANSACTION", [])?;
            let result = (|| -> rusqlite::Result<usize> {
                conn.execute("DELETE FROM session_segments WHERE session_id = ?1", params![session_id])?;
                let mut inserted = 0;
                if !items.is_empty() {
                    let mut stmt = conn.prepare(
                        "INSERT INTO session_segments (session_id, start_ms, end_ms, text, source, confidence, volume, speech_rate, pause_ms, speaker)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    )?;
                    for item in items {
                        stmt.execute(params![
                            item.session_id, item.start_ms, item.end_ms, item.text, item.source, item.confidence, item.volume, item.speech_rate, item.pause_ms, item.speaker
                        ])?;
                        inserted += 1;
                    }
                }
                Ok(inserted)
            })();
            match result {
                Ok(n) => {
                    conn.execute("COMMIT", [])?;
                    Ok(n)
                }
                Err(e) => {
                    let _ = conn.execute("ROLLBACK", []);
                    Err(e)
                }
            }
            .map_err(Into::into)
        })
    }

    /// 标记会话 failed（实时链路启动失败的恢复路径）。
    pub fn mark_session_failed(&self, session_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE sessions SET status = ?1, ended_at = COALESCE(ended_at, ?2) WHERE id = ?3",
                params![SESSION_STATUS_FAILED, unix_seconds(), session_id],
            )?;
            Ok(affected > 0)
        })
    }

    /// v0.11.7（图文会话，ADR-020）：清扫崩溃残留的图文会话。
    ///
    /// @ai-context: 图文采集无后台线程（命令式动线），应用崩溃会残留
    ///              recording 会话；kind=photo + recording + started_at 超时
    ///              → failed（ended_at 补记）。24h 阈值保证不误伤进行中的采集。
    /// @ai-context: 返回清扫条数（幂等；非 photo / 未超时会话零影响）。
    pub fn sweep_stale_photo_sessions(&self, stale_secs: i64) -> Result<usize> {
        let cutoff = unix_seconds() - stale_secs;
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE sessions SET status = ?1, ended_at = COALESCE(ended_at, ?2) \
                 WHERE kind = 'photo' AND status = ?3 AND started_at < ?4",
                params![SESSION_STATUS_FAILED, unix_seconds(), SESSION_STATUS_RECORDING, cutoff],
            )?;
            Ok(affected)
        })
    }

    /// 列出会话全部 OCR 块（按时间轴升序；v0.7.3 起含 bbox/screen_id 列）。
    pub fn list_ocr_blocks(&self, session_id: i64) -> Result<Vec<SessionOcrBlock>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, timestamp_ms, text, score, region, region_kind, bbox, screen_id
                 FROM session_ocr_blocks WHERE session_id = ?1 ORDER BY timestamp_ms ASC",
            )?;
            let rows = stmt.query_map(params![session_id], row_to_ocr_block)?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 最近 N 个会话的 OCR 文本（M5/REQ-040 OCR→ASR 闭环建议源）。
    ///
    /// @ai-context: 返回 (session_id, text) 对——建议侧按会话去重计数
    ///              （同一会话多块同文不刷提名，审查修复）；
    ///              排序按会话倒序 + 会话内时间升序（绝对时间语义明确）。
    pub fn recent_ocr_texts(&self, sessions: i64) -> Result<Vec<(i64, String)>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT b.session_id, b.text FROM session_ocr_blocks b
                 WHERE b.session_id IN (
                     SELECT id FROM sessions ORDER BY started_at DESC, id DESC LIMIT ?1
                 )
                 ORDER BY b.session_id DESC, b.timestamp_ms ASC",
            )?;
            let rows = stmt.query_map(params![sessions], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 崩溃恢复：把所有 status=recording 的残留会话标记为 failed。
    ///
    /// @ai-context: 应用启动时调用（ADR-004 风险缓解）——上次异常退出留下的
    ///              recording 会话已不可继续，标记后详情页可正常展示已落库内容。
    pub fn mark_interrupted_sessions(&self) -> Result<usize> {
        self.with_conn(|conn| {
            let affected = conn.execute(
                "UPDATE sessions SET status = ?1, ended_at = COALESCE(ended_at, ?2) WHERE status = ?3",
                params![SESSION_STATUS_FAILED, unix_seconds(), SESSION_STATUS_RECORDING],
            )?;
            Ok(affected)
        })
    }

    /// 残留 recording 会话兜底标记（REQ-176 v0.7.5）：跳过进行中的会话 id。
    ///
    /// @ai-context: 与 mark_interrupted_sessions 同语义，但**无需重启**——列表
    ///              拉取即翻案。会话31 实证：停止链路异常（audio.stop join 无
    ///              超时卡死）时线程未走完 finish_session，DB 停留 recording、
    ///              前端"采集中"残留，此前只能等下次启动兜底。running_id 为
    ///              真正运行中的会话 id（live_session.running_session_id），
    ///              进行中会话绝不误标。
    pub fn mark_stale_recording(&self, running_id: Option<i64>) -> Result<usize> {
        self.with_conn(|conn| {
            let affected = match running_id {
                Some(id) => conn.execute(
                    "UPDATE sessions SET status = ?1, ended_at = COALESCE(ended_at, ?2)
                     WHERE status = ?3 AND id != ?4",
                    params![SESSION_STATUS_FAILED, unix_seconds(), SESSION_STATUS_RECORDING, id],
                )?,
                None => conn.execute(
                    "UPDATE sessions SET status = ?1, ended_at = COALESCE(ended_at, ?2) WHERE status = ?3",
                    params![SESSION_STATUS_FAILED, unix_seconds(), SESSION_STATUS_RECORDING],
                )?,
            };
            Ok(affected)
        })
    }
}

/// 转义 LIKE 通配符（复用 db.rs 实现，审查 L7 收敛）。
use crate::db::escape_like;

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "db_sessions_tests.rs"]
mod tests;
