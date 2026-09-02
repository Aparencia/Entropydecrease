//! 目标进度信号统一（v0.18.0 REQ-250；跨表信号聚合的纯函数层）。
//!
//! @ai-context: 一致性契约（规格 §九）——进度信号全部**现算**（进度页每次打开
//!              聚合，与库一致），目标层零进度副本；只有 M2 的毕业报告才写
//!              快照。取数 SQL 在 db_goals_progress.rs，本模块只做
//!              「原始信号 → GoalProgressReport」的纯函数组装与文案
//!              （口径可单测：percent/弱项占比/一句话进度）。
//! @ai-context: 弱项块（M1）＝FSRS 低稳定性卡占比（零 JOIN 的 state_json
//!              字段查询）；概念低激活弱项属 M3（AI 教练输入），本版不做。

use crate::goal_schema::GroupWeakness;

/// 低稳定性阈值（天）：stability < 2 天 = 未建立长时记忆（FSRS 首复习后
/// 稳定性约 1 天量级，2 天分界「刚学/不牢」与「已固化」——确定性阈值，
/// 便于 table 测试；后续校准走常量，不动查询逻辑）。
pub const LOW_STABILITY_DAYS: f32 = 2.0;

/// 跨表聚合的原始信号（命令层取数后填充——结构即契约，取数见 db_goals_progress）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GoalSignals {
    pub milestone_total: usize,
    pub milestone_done: usize,
    /// 绑定组结算历史计数（settlements 历史——归档组仍计入，防判据蒸发）
    pub settlements_count: usize,
    /// 本周契约完成 N/M（跨绑定组聚合；未立约组不计入——弹性承诺不追债）
    pub contract_done: usize,
    pub contract_total: usize,
    /// 近 90 天复习活跃天数（绑定组复习按自然日去重）
    pub review_days_90: usize,
    /// 应用记录数（knowledge_decisions kind=application 且引用组在目标下）
    pub applications_count: usize,
    /// 自测通过率（M1/M2 占位 None——无自测链路；M3 真实化后取数填充）
    pub self_test_passed_rate: Option<f64>,
    /// 绑定组弱项（低稳定性占比升序——最弱在前）
    pub weak_groups: Vec<GroupWeakness>,
}

/// 进度报告（现算结果；percent/弱项占比已派生）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgressReport {
    pub milestone_total: usize,
    pub milestone_done: usize,
    /// 一句话进度百分比（0..=100；里程碑完成率——无里程碑时 0，诚实不猜）
    pub percent: f64,
    pub settlements_count: usize,
    pub contract_done: usize,
    pub contract_total: usize,
    pub review_days_90: usize,
    pub applications_count: usize,
    /// 自测通过率占位（None=无数据——M3 真实化前不参与判据，goal_rules 兜底）
    pub self_test_passed_rate: Option<f64>,
    pub weak_groups: Vec<GroupWeakness>,
}

/// 原始信号 → 进度报告（纯函数；percent 派生口径唯一落点）。
pub fn build_report(signals: &GoalSignals) -> GoalProgressReport {
    let percent = if signals.milestone_total > 0 {
        (signals.milestone_done as f64 / signals.milestone_total as f64) * 100.0
    } else {
        0.0
    };
    GoalProgressReport {
        milestone_total: signals.milestone_total,
        milestone_done: signals.milestone_done,
        percent,
        settlements_count: signals.settlements_count,
        contract_done: signals.contract_done,
        contract_total: signals.contract_total,
        review_days_90: signals.review_days_90,
        applications_count: signals.applications_count,
        self_test_passed_rate: signals.self_test_passed_rate,
        weak_groups: signals.weak_groups.clone(),
    }
}

/// 一句话进度（GoalCard 单行文案：「62% · 里程碑 2/4」）。
///
/// @ai-context: 列表是导航不是仪表盘（优化评审 #5）——单行只给百分比与里程碑；
///              周契约/组徽标/回顾流/操作全部收进详情页。
pub fn progress_statement(report: &GoalProgressReport) -> String {
    format!(
        "{:.0}% · 里程碑 {}/{}",
        report.percent.round(),
        report.milestone_done,
        report.milestone_total
    )
}

/// 组弱项占比（0..=1；无卡 → 0——空组不是弱项）。
pub fn weakness_ratio(card_total: usize, weak_cards: usize) -> f64 {
    if card_total == 0 {
        0.0
    } else {
        (weak_cards as f64 / card_total as f64).clamp(0.0, 1.0)
    }
}

/// 弱项排序（占比降序——「最弱一块」排最前；相同占比按弱卡数降序）。
pub fn rank_weakness(mut groups: Vec<GroupWeakness>) -> Vec<GroupWeakness> {
    groups.sort_by(|a, b| {
        b.weak_ratio
            .partial_cmp(&a.weak_ratio)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.weak_cards.cmp(&a.weak_cards))
    });
    groups
}

#[cfg(test)]
#[path = "goal_progress_tests.rs"]
mod tests;
