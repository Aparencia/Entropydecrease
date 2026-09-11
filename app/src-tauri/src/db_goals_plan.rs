//! AI 规划域：规划确认流落库事务 / 目标↔体系链接 / 概念活动信号 / 规划上下文。
//!
//! @ai-context: 由 db_goals.rs 按域拆出（AGENTS.md §3 单文件 ≤300 行）。
//!              apply_plan_core 是目标层第二个（也是最后一个）显式事务，与
//!              db_goals_goal.rs 的 create_goal 同为「恢复路径带 ROLLBACK」的事务点。
//! @ai-context: 周契约 upsert 的 ON CONFLICT(group_id, week_start) 依赖
//!              db_migrations.rs 的 idx_contracts_group_week 唯一索引（跨文件 schema
//!              契约）；knowledge_links **无 UNIQUE**，link_goal_to_system 的幂等靠
//!              「先查后插 + 连接锁串行」——两者都不得改动。
//! @ai-context: goal_plan_context 的 group_ids 必须**在 with_conn 之前**预取
//!              （锁不可重入）；_now_secs 是签名占位、当前取数不含时间窗。
//!              goal_concept_activities 把 application 行拉到 Rust 侧解析 UsedRefs，
//!              不用 json_each 是防坏 JSON 中断查询（既有防御性设计）。

use rusqlite::params;

use crate::db::{unix_seconds, Db};
use crate::error::Result;
use crate::goal_schema::NewMilestone;

use super::milestone::add_milestone_row;

impl Db {
    // ─────────────────────── v0.18.2 AI 规划（REQ-251/253） ───────────────────────

    /// 规划确认流落库核心（v0.18.2 REQ-251——事务：里程碑/绑定/周契约）；
    /// 体系骨架创建在命令层逐条执行（create/link 独立事务——部分失败不污染
    /// 目标层，设计 §四）。周契约落到目标主组（第一个绑定组——弹性承诺
    /// 纪律不变：仍是用户可改的自设目标）。
    /// @ai-context: replace_milestones=true（创建向导：AI 草案替换规则草案；
    ///              详情页重规划=false 增量追加——语义差异可预期可追溯）。
    pub fn apply_plan_core(
        &self,
        goal_id: i64,
        milestones: &[NewMilestone],
        group_ids: &[i64],
        contract: Option<(i64, i64, i64, i64)>, // (group_id, target_days, target_cards, week_start)
        replace_milestones: bool,
    ) -> Result<()> {
        let now = unix_seconds();
        self.with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;
            if replace_milestones {
                tx.execute("DELETE FROM goal_milestones WHERE goal_id = ?1", params![goal_id])?;
            }
            for (idx, m) in milestones.iter().enumerate() {
                add_milestone_row(&tx, goal_id, m, idx as i64, now)?;
            }
            for gid in group_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO goal_groups (goal_id, group_id, added_at) VALUES (?1, ?2, ?3)",
                    params![goal_id, gid, now],
                )?;
            }
            if let Some((gid, days, cards, week_start)) = contract {
                tx.execute(
                    "INSERT INTO contracts (group_id, week_start, target_days, target_cards, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT(group_id, week_start) DO UPDATE SET
                         target_days = excluded.target_days,
                         target_cards = excluded.target_cards,
                         created_at = excluded.created_at",
                    params![gid, week_start, days, cards, now],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
    }

    /// 目标↔体系引用（knowledge_links target_type='goal'——确认流落库用；
    /// 幂等：同 (system_id, goal) 已存在返回 false——防双击双链（与
    /// link_knowledge_target 幂等语义一致；knowledge_links 无 UNIQUE 约束，
    /// 查重先于插入）。
    pub fn link_goal_to_system(&self, goal_id: i64, system_id: i64) -> Result<bool> {
        self.with_conn(|conn| {
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM knowledge_links
                 WHERE system_id = ?1 AND target_type = 'goal' AND target_id = ?2",
                params![system_id, goal_id],
                |r| r.get(0),
            )?;
            if exists > 0 {
                return Ok(false);
            }
            conn.execute(
                "INSERT INTO knowledge_links (system_id, target_type, target_id, created_at)
                 VALUES (?1, 'goal', ?2, ?3)",
                params![system_id, goal_id, unix_seconds()],
            )?;
            Ok(true)
        })
    }

    /// 目标绑定体系列表（体系页「服务于目标 X」反查数据源）。
    /// 登记豁免 dead_code：确认流 apply（link 动作）+ 反查 UI 接线后续批次启用。
    #[allow(dead_code)]
    pub fn goal_systems(&self, goal_id: i64) -> Result<Vec<(i64, String)>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT s.id, s.name FROM knowledge_systems s
                 JOIN knowledge_links l ON l.system_id = s.id
                 WHERE l.target_type = 'goal' AND l.target_id = ?1
                 ORDER BY s.id ASC",
            )?;
            let rows = stmt.query_map(params![goal_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
        })
    }

    /// 目标内概念活动信号（绑定组挂接体系概念 + 应用/引用计数——M3 真实化）。
    ///
    /// @ai-context: 应用时刻不依赖 SQLite json_each（历史 used_refs 非法会中断
    ///              查询——防注入面同款防御）：application 行拉到 Rust 解析
    ///              （应用记录数少，单价可忽略；UsedRefs serde 契约 camelCase）。
    pub fn goal_concept_activities(&self, goal_id: i64) -> Result<Vec<crate::concept_weakness::ConceptActivity>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT c.id, c.name,
                   (SELECT COUNT(*) FROM knowledge_links l2 WHERE l2.concept_id = c.id),
                   (SELECT MAX(l3.created_at) FROM knowledge_links l3 WHERE l3.concept_id = c.id)
                 FROM knowledge_concepts c
                 WHERE c.id IN (
                   SELECT DISTINCT l.concept_id FROM knowledge_links l
                   WHERE l.target_type = 'note_group'
                     AND l.target_id IN (SELECT group_id FROM goal_groups WHERE goal_id = ?1)
                     AND l.concept_id IS NOT NULL
                 ) ORDER BY c.name ASC",
            )?;
            let mut acts: Vec<crate::concept_weakness::ConceptActivity> = stmt
                .query_map(params![goal_id], |r| {
                    Ok(crate::concept_weakness::ConceptActivity {
                        concept_id: r.get(0)?,
                        name: r.get(1)?,
                        ref_count: r.get::<_, i64>(2)? as usize,
                        last_applied_at: None,
                        last_referenced_at: r.get(3)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            // 应用记录（Rust 判定概念命中——防坏 JSON 中断）
            let mut app_stmt = conn.prepare(
                "SELECT used_refs, decided_at FROM knowledge_decisions WHERE kind = 'application'",
            )?;
            let apps = app_stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            for (used_refs, decided_at) in apps {
                let Ok(parsed) = serde_json::from_str::<crate::types::UsedRefs>(&used_refs) else { continue };
                for c in &mut acts {
                    if parsed.concept_ids.contains(&c.concept_id) {
                        c.last_applied_at = Some(c.last_applied_at.map_or(decided_at, |cur| cur.max(decided_at)));
                    }
                }
            }
            Ok(acts)
        })
    }

    /// 目标规划上下文（AI 输入——库即记忆最小面：目标/组/体系/概念/弱项/
    /// 最近笔记标题；返回 JSON 文本——prompt 用户侧）。
    /// @ai-context: now_secs 预留给未来信号窗口（当前取数不含时间窗——保持
    ///              签名单一（调用方不受影响）；90 天口径在摘要/弱项纯函数侧。
    pub fn goal_plan_context(&self, goal_id: i64, _now_secs: i64) -> Result<String> {
        let group_ids = self.list_goal_group_ids(goal_id)?;
        self.with_conn(|conn| {
            // 组简报（名称/领域/笔记数/卡数）
            let mut group_rows = Vec::new();
            for gid in &group_ids {
                let row: Option<(String, Option<String>, i64, i64)> = conn
                    .query_row(
                        "SELECT g.name, g.domain_tag,
                          (SELECT COUNT(*) FROM notes WHERE group_id = g.id),
                          (SELECT COUNT(*) FROM flashcards WHERE group_id = g.id)
                         FROM note_groups g WHERE g.id = ?1",
                        params![gid],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                    )
                    .ok();
                if let Some((name, domain, notes, cards)) = row {
                    group_rows.push(serde_json::json!({
                        "id": gid, "name": name, "domain": domain, "notes": notes, "cards": cards,
                    }));
                }
            }
            // 体系/概念清单（绑定组→体系链接）
            let mut systems = Vec::new();
            let mut concepts = Vec::new();
            if !group_ids.is_empty() {
                let mut s_stmt = conn.prepare(
                    "SELECT DISTINCT s.id, s.name FROM knowledge_systems s
                     JOIN knowledge_links l ON l.system_id = s.id
                     WHERE l.target_type = 'note_group'
                       AND l.target_id IN (SELECT group_id FROM goal_groups WHERE goal_id = ?1)",
                )?;
                for row in s_stmt.query_map(params![goal_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
                    let (id, name) = row?;
                    systems.push(serde_json::json!({ "id": id, "name": name }));
                }
                let mut c_stmt = conn.prepare(
                    "SELECT DISTINCT c.id, c.name FROM knowledge_concepts c
                     JOIN knowledge_links l ON l.concept_id = c.id
                     WHERE l.target_type = 'note_group'
                       AND l.target_id IN (SELECT group_id FROM goal_groups WHERE goal_id = ?1)",
                )?;
                for row in c_stmt.query_map(params![goal_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
                    let (id, name) = row?;
                    concepts.push(serde_json::json!({ "id": id, "name": name }));
                }
            }
            // 最近笔记标题（检索片段最小面——L3 占位：目标组 top 5 更新时间）
            let mut recent_notes = Vec::new();
            if !group_ids.is_empty() {
                let mut n_stmt = conn.prepare(
                    "SELECT title FROM notes WHERE group_id IN
                       (SELECT group_id FROM goal_groups WHERE goal_id = ?1)
                     ORDER BY updated_at DESC LIMIT 5",
                )?;
                for row in n_stmt.query_map(params![goal_id], |r| r.get::<_, String>(0))? {
                    recent_notes.push(row?);
                }
            }
            let ctx = serde_json::json!({
                "goalId": goal_id,
                "groups": group_rows,
                "systems": systems,
                "concepts": concepts,
                "recentNotes": recent_notes,
            });
            Ok(ctx.to_string())
        })
    }
}
