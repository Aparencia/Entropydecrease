//! 目标毕业报告与回顾流纯函数（v0.18.1 REQ-255/256；无 AI 依赖）。
//!
//! @ai-context: 毕业＝用户确认仪式（延续 v0.11.3 结算仪式纪律）——goal_settle
//!              只做「组装报告快照 + 状态归档 + 埋点」；本模块只做纯组装
//!              （信号输入 → GraduationReport / RetroEntry），取数在
//!              commands_goals::goal_settle（数据层复用 goal_progress 口径）。
//! @ai-context: 报告快照独立于 goals 行（goal_graduation_reports 表，目标删除
//!              后 FK SET NULL 仍保留）——同 notes_versions「回滚不破坏历史」
//!              哲学；回顾流全现算（零双写：创建/里程碑/结算/毕业四源拼装）。

use serde::{Deserialize, Serialize};

/// 里程碑快照（毕业报告项）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneSnapshot {
    pub title: String,
    pub status: String,
    pub completed_at: Option<i64>,
}

/// 组结算快照（绑定组维度——历史计数，含归档组）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupSettlementSnapshot {
    pub group_id: i64,
    pub group_name: String,
    pub settlement_count: usize,
    pub last_settled_at: Option<i64>,
}

/// 复习统计（毕业判据信号回顾）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewStats {
    pub card_total: usize,
    pub review_logs_total: usize,
    pub review_days_90: usize,
    /// 低稳定性卡数（<2 天——与 M1 弱项块同口径）
    pub weak_cards: usize,
}

/// 成果物清单（组·笔记·闪卡·概念——「我留下了什么」）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactsInventory {
    pub groups: usize,
    pub notes: usize,
    pub cards: usize,
    pub concepts: usize,
}

/// 毕业报告（快照 JSON——毕业后冻结，目标删除仍可读）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraduationReport {
    pub goal_id: i64,
    pub goal_name: String,
    pub graduated_at: i64,
    pub milestones: Vec<MilestoneSnapshot>,
    pub group_settlements: Vec<GroupSettlementSnapshot>,
    pub review_stats: ReviewStats,
    pub artifacts: ArtifactsInventory,
    /// 毕业判据说明（配方 statement——「达成标准回顾」）
    pub criteria_statement: String,
}

/// 回顾流条目（时间线节点；kind=created/milestone/settlement/graduated）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RetroEntry {
    pub kind: String,
    pub occurred_at: i64,
    pub title: String,
    pub detail: String,
}

/// 毕业报告组装输入（取数层在命令层；结构即契约）。
pub struct ReportSignals {
    pub goal_id: i64,
    pub goal_name: String,
    pub graduated_at: i64,
    pub milestones: Vec<MilestoneSnapshot>,
    pub group_settlements: Vec<GroupSettlementSnapshot>,
    pub review_stats: ReviewStats,
    pub artifacts: ArtifactsInventory,
    pub criteria_statement: String,
}

/// 信号 → 毕业报告（纯组装；无 IO 无随机——快照内容确定）。
pub fn assemble_report(s: ReportSignals) -> GraduationReport {
    GraduationReport {
        goal_id: s.goal_id,
        goal_name: s.goal_name,
        graduated_at: s.graduated_at,
        milestones: s.milestones,
        group_settlements: s.group_settlements,
        review_stats: s.review_stats,
        artifacts: s.artifacts,
        criteria_statement: s.criteria_statement,
    }
}

/// 回顾流时间线组装（四源现算：创建→里程碑完成→组结算→毕业）。
///
/// @ai-context: 里程碑仅完成态入时间线（completed_at 非空——skipped/pending
///              无"发生时刻"不造假事件；跳过明细在毕业报告的里程碑清单可见）；
///              结算按组折叠（逐次展开无限增长——明细在毕业报告）。
pub fn assemble_retro(
    created_at: i64,
    milestones: &[MilestoneSnapshot],
    settlements: &[GroupSettlementSnapshot],
    graduation: Option<&GraduationReport>,
) -> Vec<RetroEntry> {
    let mut entries = vec![RetroEntry {
        kind: "created".to_string(),
        occurred_at: created_at,
        title: "目标创建".to_string(),
        detail: "明确意图：用它做什么、做到什么程度、不做什么".to_string(),
    }];
    for m in milestones.iter().filter(|m| m.completed_at.is_some()) {
        entries.push(RetroEntry {
            kind: "milestone".to_string(),
            occurred_at: m.completed_at.unwrap_or(0),
            title: format!("里程碑：{}", m.title),
            detail: "已达成".to_string(),
        });
    }
    for s in settlements {
        entries.push(RetroEntry {
            kind: "settlement".to_string(),
            occurred_at: s.last_settled_at.unwrap_or(0),
            title: format!("组结算：{}", s.group_name),
            detail: format!("历史 {} 次（含归档组）", s.settlement_count),
        });
    }
    if let Some(g) = graduation {
        entries.push(RetroEntry {
            kind: "graduated".to_string(),
            occurred_at: g.graduated_at,
            title: "目标毕业".to_string(),
            detail: g.criteria_statement.clone(),
        });
    }
    // 时间线顺序：发生时刻升序（settlement 无记录时不造假事件——其 occurred=0
    // 仅在从未结算时出现，此时按最早位序，UI 细节标识"从未结算"由计数 0 呈现）
    entries.sort_by_key(|e| e.occurred_at);
    entries
}

/// 报告 → 纯文本（无渲染依赖的兜底呈现；日期由前端按时间戳本地化）。
///
/// @ai-context: 快照存 JSON（GraduationReport serde）；本函数为纯文本
///              摘要（日志/兜底）；成品入口 UI 用结构化 JSON + 本地化日期。
/// 登记豁免 dead_code：纯文本兜底通道为「无 WebView/日志/导出」场景预留
/// （report_text 消费端未接线——随 v0.18.2 导出或诊断面接入后移除）。
#[allow(dead_code)]
pub fn report_text(r: &GraduationReport) -> String {
    let ms_done = r
        .milestones
        .iter()
        .filter(|m| m.status == "done")
        .count();
    let ms_total = r.milestones.iter().filter(|m| m.status != "skipped").count();
    format!(
        "🎓 {} · 毕业\n\n达成标准：{}\n里程碑 {}/{} · 组结算 {} 组 {} 次 · 复习 {} 卡 {} 次（近 90 天 {} 天）· 低稳定性 {} 卡\n成果物：{} 组 · {} 笔记 · {} 卡 · {} 概念",
        r.goal_name,
        r.criteria_statement,
        ms_done,
        ms_total,
        r.group_settlements.len(),
        r.group_settlements.iter().map(|s| s.settlement_count).sum::<usize>(),
        r.review_stats.card_total,
        r.review_stats.review_logs_total,
        r.review_stats.review_days_90,
        r.review_stats.weak_cards,
        r.artifacts.groups,
        r.artifacts.notes,
        r.artifacts.cards,
        r.artifacts.concepts,
    )
}

#[cfg(test)]
#[path = "goal_retro_tests.rs"]
mod tests;
