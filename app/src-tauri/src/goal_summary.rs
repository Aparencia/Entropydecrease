//! L4.5 目标摘要现算（v0.18.2 REQ-253；每次现算无缓存——优化评审 #1 延续）。
//!
//! @ai-context: 目标 → 摘要（进度/里程碑/弱项/原始意图），<1K token（~1200 字
//!              预算）；用于 /goal 对话注入与 AI 规划上下文——聚合皆毫秒级，
//!              缓存是过度设计（ADR-027 §4）。纯函数：信号输入 → 摘要文本。

/// 摘要输出字符上界（≤ ~600 token 的中文摘要——远低于 1K token 预算）。
pub const SUMMARY_MAX_CHARS: usize = 1_200;

/// 摘要输入信号（命令层自 goal_progress_signals/detail 组装——结构即契约）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GoalSummaryInput {
    pub name: String,
    pub status: String,
    pub created_at: i64,
    pub horizon_end: Option<i64>,
    pub scenario: Option<String>,
    pub driver: Option<String>,
    pub non_scope: Option<String>,
    pub criteria_statement: String,
    pub milestone_done: usize,
    pub milestone_total: usize,
    pub settlements: usize,
    pub review_days_90: usize,
    pub applications: usize,
    /// 最弱组（FSRS 低稳定性占比 Top——"最弱一块"字符串，无则 None）
    pub weak_top: Option<String>,
}

/// 目标摘要（现状/进度/弱项/原始意图——四段；未来展望不入（AI 规划产蓝图））。
pub fn build_summary(i: &GoalSummaryInput) -> String {
    let mut out = String::new();
    let scene = i.scenario.clone().map(|s| format!("（场景：{}）", s)).unwrap_or_default();
    let driver = i.driver.clone().map(|d| format!("，驱动：{}", d)).unwrap_or_default();
    out.push_str(&format!(
        "目标「{}」{}状态{}，始于 {}；原始意图{}{}；",
        i.name,
        scene,
        i.status,
        fmt_date(i.created_at),
        if i.scenario.is_some() { String::new() } else { "未访谈（规则基线）".to_string() },
        driver,
    ));
    let horizon = i.horizon_end.map(|h| format!("，锚点 {}", fmt_date(h))).unwrap_or_default();
    out.push_str(&format!(
        "当前进度：里程碑 {}/{}·组结算 {} 次·近 90 天复习活跃 {} 天·应用记录 {} 条{}。",
        i.milestone_done, i.milestone_total, i.settlements, i.review_days_90, i.applications, horizon
    ));
    if let Some(weak) = &i.weak_top {
        out.push_str(&format!("最弱一块：{}。", weak));
    }
    if !i.criteria_statement.is_empty() {
        out.push_str(&format!("达成标准：{}。", i.criteria_statement));
    }
    if let Some(ns) = &i.non_scope {
        out.push_str(&format!("边界：不学{}。", ns));
    }
    out.chars().take(SUMMARY_MAX_CHARS).collect()
}

/// Unix 秒 → YYYY-MM-DD（摘要展示；epoch 前回退 "—"）。
fn fmt_date(secs: i64) -> String {
    if secs <= 0 {
        return "—".to_string();
    }
    // 与前端 toISOString 语义对齐（UTC 秒 → 日期；0 偏移历法换算）
    let days = secs / 86_400;
    let (y, m, d) = civil_from_days(days);
    format!("{}-{:02}-{:02}", y, m, d)
}

/// Howard Hinnant civil_from_days（历法换算纯函数——零 chrono 依赖）。
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as i64;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as i64;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
#[path = "goal_summary_tests.rs"]
mod tests;
