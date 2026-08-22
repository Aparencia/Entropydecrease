//! 周契约纯函数（v0.11.4 REQ-200；弹性承诺呈现层的数据基础）。
//!
//! @ai-context: 弹性承诺纪律（v4 §8.2 P31+N10）——契约是用户自设的本周目标，
//!              不是打卡 KPI：无 streak、无惩罚、欠账不追。本层只回答
//!              "本周承诺 vs 实际"两个数字，聚合结果由 UI 呈现。
//! @ai-context: 周界口径：UTC 周一零点（零依赖纯函数，不引 chrono）。时区偏差
//!              对弹性承诺无惩罚性影响（欠账不追，边界模糊不伤契约精神）；
//!              UI 展示时把 week_start 转本地日期。
//! @ai-context: 纯逻辑无 IO；取数（review_logs 按组+周过滤）在 db_contracts.rs。

/// 一周秒数（周一零点周界计算用）。
pub const WEEK_SECS: i64 = 7 * 86_400;
/// 一天毫秒数（聚合按天去重口径——review_logs.reviewed_at 为毫秒）。
const DAY_MS: i64 = 86_400_000;
/// 最小可行日徽标阈值：本周完成卡数达到此值即"成立"（N9/N11 低谷生存
/// 的最轻形态——一天状态崩坏不否定整周，但至少 3 次提取才算成立）。
pub const MINIMAL_DAY_CARDS: usize = 3;

/// 当前时刻所在周的周一零点（UTC；Unix 秒）。
///
/// @ai-context: 推导——Unix epoch（1970-01-01）是周四；设 d=距纪元天数，
///              ISO weekday(d) = (d + 3) % 7 + 1（周一=1）；该周起始天 =
///              d - (weekday - 1) = d - (d + 3) % 7。rem_euclid 防负天数。
pub fn week_start_secs(now_secs: i64) -> i64 {
    let d = now_secs / 86_400;
    let back = (d + 3).rem_euclid(7);
    (d - back) * 86_400
}

/// 周聚合结果（承诺 vs 实际的数据基础）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WeekAggregate {
    /// 有复习的天数（按自然日去重——断签不清零：不连续也算天数）
    pub review_days: usize,
    /// 复习卡次数（review_logs 行数）
    pub review_cards: usize,
}

/// review 记录（reviewed_at Unix 毫秒列表）→ 周聚合。
///
/// @ai-context: 天数按 (t / DAY_MS) 去重——同一天多次复习只算一天（日历日口径，
///              与 week_start 周界一致）；卡数=复习次数（提取动作次数）。
/// @ai-context: 审查修复（2026-08-22）：口径统一毫秒——review_logs.reviewed_at
///              由 review_card 以毫秒写入，此前按秒除 86400 会致同一天内
///              全部去重为同一"毫秒天"（完成度失真）。
pub fn aggregate_week(reviewed_ats: &[i64]) -> WeekAggregate {
    let mut days = std::collections::HashSet::new();
    for t in reviewed_ats {
        days.insert(t / DAY_MS);
    }
    WeekAggregate {
        review_days: days.len(),
        review_cards: reviewed_ats.len(),
    }
}

/// 最小可行日成立判定（本周完成卡数 ≥ MINIMAL_DAY_CARDS）。
pub fn minimal_day_met(review_cards: usize) -> bool {
    review_cards >= MINIMAL_DAY_CARDS
}

#[cfg(test)]
#[path = "week_contract_tests.rs"]
mod tests;
