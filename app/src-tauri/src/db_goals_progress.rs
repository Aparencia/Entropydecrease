//! 学习目标进度聚合查询（v0.18.0 REQ-250；跨表现算信号——一致性契约）。
//!
//! @ai-context: 全部信号**现算**（进度页每次打开聚合，与库一致；目标层零进度
//!              副本/零缓存——优化评审 #1 同哲学，聚合皆毫秒级 SQLite 查询）。
//!              纯函数组装在 goal_progress.rs；本模块只做取数口径（单一落点）。
//! @ai-context: 信号口径：结算=settlements 历史计数（归档组仍计入，防判据蒸发）；
//!              周契约=本周（week_start_secs）跨组聚合，完成=天数与卡数双达标；
//!              复习活跃=近 90 天自然日去重；应用=knowledge_decisions
//!              kind=application 且 used_refs.groupId 在目标绑定组内；
//!              弱项=FSRS state_json 低稳定性（<2 天）卡占比 Top 5。
//! @ai-context: 本模块内部**严禁**再调用 self.* 数据层方法——with_conn 闭包
//!              已持有连接锁（std Mutex 不可重入，见 db.rs 毒锁恢复先例），
//!              全部取数走闭包内的 &Connection。

use rusqlite::{params, Connection};

use crate::db::Db;
use crate::error::Result;
use crate::goal_progress::{weakness_ratio, GoalSignals, LOW_STABILITY_DAYS};
use crate::goal_schema::GroupWeakness;
use crate::week_contract::{aggregate_week, week_start_secs, WeekAggregate, WEEK_SECS};

/// 近 90 天时间窗（复习活跃信号口径）。
const REVIEW_WINDOW_DAYS: i64 = 90;
/// 弱项块展示上限（Top 组——「最弱一块」聚焦不刷屏）。
const WEAK_TOP_N: usize = 5;

impl Db {
    /// 目标进度信号（全部现算；now_secs 显式入参——周界/90 天窗口径可测）。
    pub fn goal_progress_signals(&self, goal_id: i64, now_secs: i64) -> Result<GoalSignals> {
        // 绑定组先取（独立锁窗口——闭包内不可再进锁）
        let group_ids = self.list_goal_group_ids(goal_id)?;
        self.with_conn(|conn| {
            // 里程碑计数（判据①）：skipped=废弃计划项——不计入分母与分子，
            // 防「跳过」拖死毕业判据（里程碑全部 done 的语义=活跃计划全完成）
            let (m_total, m_done): (i64, i64) = conn.query_row(
                "SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0)
                 FROM goal_milestones WHERE goal_id = ?1 AND status != 'skipped'",
                params![goal_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            // 组结算历史计数（含归档组——历史计数口径）
            let st_count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM settlements s
                 JOIN goal_groups g ON g.group_id = s.group_id
                 WHERE g.goal_id = ?1",
                params![goal_id],
                |r| r.get(0),
            )?;
            let review_days_90 = query_review_days_90(conn, goal_id, now_secs)?;

            // 本周契约完成 N/M（跨绑定组；未立约组不计入——弹性承诺不追债）
            let ws = week_start_secs(now_secs);
            let (c_done, c_total) = query_week_contract_aggregate(conn, goal_id, &group_ids, ws)?;

            // 应用记录（判据③：kind=application 且使用引用命中目标绑定组）
            let applications = query_applications(conn, goal_id, &group_ids)?;
            // 弱项信号（M1：FSRS 低稳定性卡占比 Top 组）
            let weak_groups = query_weak_groups(conn, &group_ids)?;

            Ok(GoalSignals {
                milestone_total: m_total as usize,
                milestone_done: m_done as usize,
                settlements_count: st_count as usize,
                contract_done: c_done,
                contract_total: c_total,
                review_days_90: review_days_90 as usize,
                applications_count: applications as usize,
                // M1/M2 无自测链路——占位 None（M3 真实化后取数）
                self_test_passed_rate: None,
                weak_groups,
            })
        })
    }
}

/// 近 90 天复习活跃天数（自然日去重；reviewed_at 毫秒——周界同口径 ÷86400000）。
fn query_review_days_90(conn: &Connection, goal_id: i64, now_secs: i64) -> Result<i64> {
    let window_start_ms = (now_secs - REVIEW_WINDOW_DAYS * 86_400) * 1000;
    let days = conn.query_row(
        "SELECT COUNT(DISTINCT l.reviewed_at / 86400000) FROM review_logs l
         JOIN flashcards c ON c.id = l.card_id
         WHERE c.group_id IN (SELECT group_id FROM goal_groups WHERE goal_id = ?1)
           AND l.reviewed_at >= ?2",
        params![goal_id, window_start_ms],
        |r| r.get::<_, i64>(0),
    )?;
    Ok(days)
}

/// 本周契约跨组聚合（completed = 天数与卡数双达标；未立约组 0/0 不计）。
fn query_week_contract_aggregate(
    conn: &Connection,
    goal_id: i64,
    group_ids: &[i64],
    week_start: i64,
) -> Result<(usize, usize)> {
    if group_ids.is_empty() {
        return Ok((0, 0));
    }
    let mut stmt = conn.prepare(
        "SELECT group_id, target_days, target_cards FROM contracts
         WHERE week_start = ?1 AND group_id IN (
             SELECT group_id FROM goal_groups WHERE goal_id = ?2
         )",
    )?;
    let rows = stmt.query_map(params![week_start, goal_id], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
    })?;
    let mut done = 0usize;
    let mut total = 0usize;
    for row in rows {
        let (gid, target_days, target_cards) = row?;
        // 卡数聚合（周界与 week_contract.rs 口径一致：周一零点起 7 天）
        let mut review = conn.prepare(
            "SELECT l.reviewed_at FROM review_logs l
             JOIN flashcards c ON c.id = l.card_id
             WHERE c.group_id = ?1 AND l.reviewed_at >= ?2 AND l.reviewed_at < ?3
             ORDER BY l.reviewed_at ASC",
        )?;
        let start_ms = week_start * 1000;
        let end_ms = (week_start + WEEK_SECS) * 1000;
        let ats = review
            .query_map(params![gid, start_ms, end_ms], |r| r.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let agg: WeekAggregate = aggregate_week(&ats);
        total += 1;
        if agg.review_days >= target_days as usize && agg.review_cards >= target_cards as usize {
            done += 1;
        }
    }
    Ok((done, total))
}

/// 应用记录计数（used_refs 为 JSON 文本——json_valid 防历史坏数据阻断查询）。
fn query_applications(conn: &Connection, goal_id: i64, group_ids: &[i64]) -> Result<i64> {
    if group_ids.is_empty() {
        return Ok(0);
    }
    let count = conn.query_row(
        "SELECT COUNT(*) FROM knowledge_decisions d
         WHERE d.kind = 'application'
           AND json_valid(d.used_refs) = 1
           AND json_extract(d.used_refs, '$.groupId') IN (
               SELECT group_id FROM goal_groups WHERE goal_id = ?1
           )",
        params![goal_id],
        |r| r.get::<_, i64>(0),
    )?;
    Ok(count)
}

/// 弱项（低稳定性卡占比 Top 组；无卡组占比 0——空组不是弱项，自然垫底）。
fn query_weak_groups(conn: &Connection, group_ids: &[i64]) -> Result<Vec<GroupWeakness>> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut out: Vec<GroupWeakness> = Vec::new();
    for gid in group_ids {
        // 组名（缺行=查询窗口内被删除——跳过该组诚实降级）
        let group_name: Option<String> = conn
            .query_row("SELECT name FROM note_groups WHERE id = ?1", params![gid], |r| r.get(0))
            .ok();
        let Some(group_name) = group_name else { continue };
        let (total, weak): (i64, i64) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(CASE
                 WHEN json_valid(state_json) = 1
                  AND json_extract(state_json, '$.stability') < ?1 THEN 1 ELSE 0 END), 0)
             FROM flashcards WHERE group_id = ?2",
            params![LOW_STABILITY_DAYS, gid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        out.push(GroupWeakness {
            group_id: *gid,
            group_name,
            card_total: total as usize,
            weak_cards: weak as usize,
            weak_ratio: weakness_ratio(total as usize, weak as usize),
        });
    }
    // 排序口径单一（goal_progress.rs 纯函数）——占比降序，「最弱一块」排最前
    Ok(crate::goal_progress::rank_weakness(out).into_iter().take(WEAK_TOP_N).collect())
}

#[cfg(test)]
#[path = "db_goals_progress_tests.rs"]
mod tests;
