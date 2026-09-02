//! 目标访谈纯函数（v0.18.0 REQ-249；访谈式设定的本地规则核心）。
//!
//! @ai-context: 访谈式目标设定（规格 §六）——结构化四步（意图澄清→现状与驱动→
//!              边界与判据→可行与素材）+ 第 5 步宣言确认，0 AI 本地规则；
//!              第 1/3 问必答（命令层强制），2/4 问折叠可选；答案可回溯编辑，
//!              配方可重推。本模块全部纯函数（无 IO），table-driven golden 测试。
//! @ai-context: 本模块产出的三个契约：① derive_criteria（答案→判据配方快照）
//!              ② suggest_milestones（现状×投入→里程碑草案，宣言页预填可删改）
//!              ③ assemble_declaration（宣言回显一句话）＋ horizon_end_secs。
//! @ai-context: 档位常量（tier）在 goal_schema.rs——判定语义在那里展开，
//!              这里只做「档位输入 → 配方」的推导（单一事实源防漂移）。

use crate::goal_schema::{
    MilestoneDraft, SuccessCriteria, TIER_DEFAULT, TIER_HANDS_ON, TIER_SOLO_PROJECT, TIER_TEACH_CERT,
};

/// 一天秒数（horizon_end 换算）。
const DAY_SECS: i64 = 86_400;

/// 判据档位白名单（非法档位 → 默认档——诚实降级不猜）。
const TIERS: [&str; 4] = [TIER_HANDS_ON, TIER_SOLO_PROJECT, TIER_TEACH_CERT, TIER_DEFAULT];

/// 答案 → 判据配方（规格 §六表格的纯函数实现）。
///
/// @ai-context: 配方是快照（毕业后冻结）；数值为「要求值」，进度信号现算后
///              在 goal_rules 比对。self_test_enforced=false（M1/M2 占位——
///              自测链路 M3 真实化前不参与判定，防「占位数值假装达标」）。
///              周投入（weekly_commitment）不改变配方语义（只作用于里程碑
///              草案节奏 suggest_milestones），故不入参。
pub fn derive_criteria(tier: &str, non_scope: Option<&str>) -> SuccessCriteria {
    let tier = if TIERS.contains(&tier) { tier } else { TIER_DEFAULT };
    match tier {
        TIER_HANDS_ON => SuccessCriteria {
            tier: tier.to_string(),
            group_settlements: 1,
            applications: None,
            self_test_rate: None,
            self_test_enforced: false,
            review_active_days: None,
            statement: format!(
                "完成全部里程碑 + 主组经历结算 1 次。（边界：{}）",
                non_scope_label(non_scope)
            ),
        },
        TIER_SOLO_PROJECT => SuccessCriteria {
            tier: tier.to_string(),
            group_settlements: 1,
            applications: Some(1),
            self_test_rate: None,
            self_test_enforced: false,
            review_active_days: None,
            statement: format!(
                "完成全部里程碑 + 组结算 1 次 + 应用记录 ≥1 条。（边界：{}）",
                non_scope_label(non_scope)
            ),
        },
        TIER_TEACH_CERT => SuccessCriteria {
            tier: tier.to_string(),
            group_settlements: 1,
            applications: None,
            self_test_rate: Some(0.8),
            self_test_enforced: false,
            review_active_days: None,
            statement: format!(
                "完成全部里程碑 + 组结算 1 次 + 自测通过率 ≥80%（自测链路 M3 生效，当前按「访谈已记录」对待，不参与判定）。（边界：{}）",
                non_scope_label(non_scope)
            ),
        },
        _ => SuccessCriteria {
            tier: TIER_DEFAULT.to_string(),
            group_settlements: 1,
            applications: None,
            self_test_rate: None,
            self_test_enforced: false,
            review_active_days: Some(5),
            statement: format!(
                "完成全部里程碑 + ≥1 组结算 + 近 90 天复习活跃 ≥5 天。（边界：{}）",
                non_scope_label(non_scope)
            ),
        },
    }
}

/// 边界文案（None/pending → "暂未明确"——防沼泽化的「明确不学什么」可后补）。
fn non_scope_label(non_scope: Option<&str>) -> String {
    non_scope
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "暂未明确".to_string())
}

/// 现状×投入 → 里程碑草案（宣言页预填 3 个草案：基础→应用→项目，可删改）。
///
/// @ai-context: 通用节奏（规格 §六）——「现状」只影响入口草案数（系统学过一半
///              直接进应用/项目，不再铺基础），「投入」决定节奏（周距 4/6/8 周，
///              5h+/2-5h/看情况）；unknown 值全部回落默认值（诚实不猜）。
pub fn suggest_milestones(level: Option<&str>, weekly_commitment: Option<&str>) -> Vec<MilestoneDraft> {
    let spacing = match weekly_commitment {
        Some("5h+") => 4usize,
        Some("2-5h") => 6usize,
        _ => 8usize,
    };
    // 系统学过一半：从应用阶段起步（基础已过，查漏补缺并入应用练习）
    let mid = level == Some("mid");
    let mut drafts = Vec::new();
    if !mid {
        drafts.push(MilestoneDraft {
            title: "基础入门：掌握核心概念并做完配套练习".to_string(),
            due_weeks: spacing,
        });
    }
    drafts.push(MilestoneDraft {
        title: "应用练习：动手完成一个完整实例并记录应用".to_string(),
        due_weeks: spacing * 2,
    });
    drafts.push(MilestoneDraft {
        title: "项目实战：独立完成一个小项目并复盘".to_string(),
        due_weeks: spacing * 3,
    });
    drafts
}

/// 宣言回显（一句话：时限 + 目标 + 达成标准 + 边界）。
///
/// @ai-context: 第 5 步确认前的回显文案——criteria_statement 优先（用户
///              原始表述），缺失时回退配方的可读 statement（未填第 3 问但
///              档位已定——配方语义兜底，不是只有一条路径）。
pub fn assemble_declaration(
    name: &str,
    scenario: Option<&str>,
    criteria_statement: Option<&str>,
    criteria_fallback: &str,
    non_scope: Option<&str>,
    horizon: Option<&str>,
) -> String {
    let horizon_label = horizon_label(horizon);
    let goal = name.trim();
    let scene = scenario
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| format!("（场景：{}）", s))
        .unwrap_or_default();
    let standard = criteria_statement
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| criteria_fallback.to_string());
    format!(
        "用{}学会{}{}，达成标准：{}；边界：{}",
        horizon_label,
        goal,
        scene,
        standard,
        non_scope_label(non_scope)
    )
}

/// 时限 → 中周期锚点（Unix 秒；None=无期限——合法非 KPI 截止日）。
///
/// @ai-context: 周距一律换算自然时长（3 月≈90 天/半年≈180 天/先试两周=14 天）；
///              now_secs 显式入参（纯函数，测试可控）。
pub fn horizon_end_secs(horizon: Option<&str>, now_secs: i64) -> Option<i64> {
    match horizon {
        Some("3m") => Some(now_secs + 90 * DAY_SECS),
        Some("6m") => Some(now_secs + 180 * DAY_SECS),
        Some("2w") => Some(now_secs + 14 * DAY_SECS),
        // none（无期限）/ None / 未知值 → 无期限（未知值诚实回落，不乱猜）
        _ => None,
    }
}

/// 时限 → 展示文案（宣言回显用）。
fn horizon_label(horizon: Option<&str>) -> String {
    match horizon {
        Some("3m") => "3 个月".to_string(),
        Some("6m") => "半年".to_string(),
        Some("2w") => "先试两周".to_string(),
        // none/None/未知 → 默认节奏（12 周——与里程碑草案的通用节奏呼应，
        // 展示层文案不是 KPI，用户可在声明页/详情改期）
        _ => "12 周".to_string(),
    }
}

#[cfg(test)]
#[path = "goal_interview_tests.rs"]
mod tests;
