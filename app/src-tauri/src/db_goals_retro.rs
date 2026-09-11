//! 回顾/毕业取数域：结算快照 · 复习统计 · 成果物清单（只读聚合）。
//!
//! @ai-context: 由 db_goals.rs 按域拆出（AGENTS.md §3 单文件 ≤300 行）。本文件全是
//!              只读聚合；写路径在 db_goals_goal.rs / db_goals_binding.rs。
//! @ai-context: goal_settlements_snapshot 的 group_ids 必须**在 with_conn 之前**
//!              预取——list_goal_group_ids 自身也取锁，搬进闭包即运行期自锁死。
//! @ai-context: 90 天窗口在本文件与 db_goals_progress.rs 各自硬编码（既有口径）；
//!              组名读取失败降级为 `组#<id>` 属既有防御性设计，不是空 catch。

use rusqlite::params;

use crate::db::Db;
use crate::error::Result;

impl Db {
    /// 组结算快照（绑定组维度：名称/历史计数/最近一次——毕业报告与时间线）。
    /// @ai-context: group_ids 先于 with_conn 取（闭包内严禁再调 self.*——锁不可重入，
    ///              见 db_goals_progress.rs 同款注释与修复先例）。
    pub fn goal_settlements_snapshot(
        &self,
        goal_id: i64,
    ) -> Result<Vec<crate::goal_retro::GroupSettlementSnapshot>> {
        let group_ids = self.list_goal_group_ids(goal_id)?;
        self.with_conn(|conn| {
            let mut out = Vec::new();
            for gid in &group_ids {
                let name: Option<String> = conn
                    .query_row("SELECT name FROM note_groups WHERE id = ?1", params![gid], |r| r.get(0))
                    .ok();
                let (count, last): (i64, Option<i64>) = conn.query_row(
                    "SELECT COUNT(*), MAX(created_at) FROM settlements WHERE group_id = ?1",
                    params![gid],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )?;
                out.push(crate::goal_retro::GroupSettlementSnapshot {
                    group_id: *gid,
                    group_name: name.unwrap_or_else(|| format!("组#{}", gid)),
                    settlement_count: count as usize,
                    last_settled_at: last,
                });
            }
            Ok(out)
        })
    }

    /// 复习统计（毕业报告口径：卡数/复习次数/90 天活跃日/低稳定性卡数——现算）。
    pub fn goal_review_stats(&self, goal_id: i64, now_secs: i64) -> Result<crate::goal_retro::ReviewStats> {
        let window_ms = (now_secs - 90 * 86_400) * 1000;
        self.with_conn(|conn| {
            let (cards, logs, days90, weak): (i64, i64, i64, i64) = conn.query_row(
                "SELECT
                   (SELECT COUNT(*) FROM flashcards WHERE group_id IN
                     (SELECT group_id FROM goal_groups WHERE goal_id = ?1)),
                   (SELECT COUNT(*) FROM review_logs l JOIN flashcards c ON c.id = l.card_id
                     WHERE c.group_id IN (SELECT group_id FROM goal_groups WHERE goal_id = ?1)),
                   (SELECT COUNT(DISTINCT l.reviewed_at / 86400000) FROM review_logs l
                     JOIN flashcards c ON c.id = l.card_id
                     WHERE c.group_id IN (SELECT group_id FROM goal_groups WHERE goal_id = ?1)
                       AND l.reviewed_at >= ?2),
                   (SELECT COUNT(*) FROM flashcards WHERE group_id IN
                     (SELECT group_id FROM goal_groups WHERE goal_id = ?1)
                     AND json_valid(state_json) = 1
                     AND json_extract(state_json, '$.stability') < ?3)",
                params![goal_id, window_ms, crate::goal_progress::LOW_STABILITY_DAYS],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;
            Ok(crate::goal_retro::ReviewStats {
                card_total: cards as usize,
                review_logs_total: logs as usize,
                review_days_90: days90 as usize,
                weak_cards: weak as usize,
            })
        })
    }

    /// 成果物清单（组/笔记/卡/概念——「我留下了什么」；概念经体系引用跨链）。
    pub fn goal_artifacts(&self, goal_id: i64) -> Result<crate::goal_retro::ArtifactsInventory> {
        self.with_conn(|conn| {
            let (groups, notes, cards, concepts): (i64, i64, i64, i64) = conn.query_row(
                "SELECT
                   (SELECT COUNT(*) FROM goal_groups WHERE goal_id = ?1),
                   (SELECT COUNT(*) FROM notes WHERE group_id IN
                     (SELECT group_id FROM goal_groups WHERE goal_id = ?1)),
                   (SELECT COUNT(*) FROM flashcards WHERE group_id IN
                     (SELECT group_id FROM goal_groups WHERE goal_id = ?1)),
                   (SELECT COUNT(DISTINCT l.concept_id) FROM knowledge_links l
                     WHERE l.target_type = 'note_group'
                       AND l.target_id IN (SELECT group_id FROM goal_groups WHERE goal_id = ?1)
                       AND l.concept_id IS NOT NULL)",
                params![goal_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;
            Ok(crate::goal_retro::ArtifactsInventory {
                groups: groups as usize,
                notes: notes as usize,
                cards: cards as usize,
                concepts: concepts as usize,
            })
        })
    }
}
