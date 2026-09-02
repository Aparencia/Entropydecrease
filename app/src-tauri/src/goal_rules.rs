//! goal_rules 状态机与毕业判据（v0.18.0 REQ-250；四态状态机 + 守卫）。
//!
//! @ai-context: 规格 §七——active⇄paused；active→graduated（毕业仪式用户确认，
//!              M2 落 goal_settle）；active/paused→abandoned（显式动作+可选原因，
//!              无惩罚文案）。毕业＝「可毕业」档位（这里判定）＋用户确认仪式
//!              （M2），本模块**不自动毕业**。
//! @ai-context: 判据信号全部现算比对（goal_progress::GoalProgressReport 为输入，
//!              快照只有 SuccessCriteria 一份）；自测占位（self_test_enforced=
//!              false，M1/M2）不参与判定——防「占位数值假装达标」。

use crate::goal_progress::GoalProgressReport;
use crate::goal_schema::{
    SuccessCriteria, GOAL_ABANDONED, GOAL_ACTIVE, GOAL_GRADUATED, GOAL_PAUSED,
};

/// 四态状态白名单（命令层校验；TEXT 无 CHECK 的项目惯例白名单先例）。
/// 登记豁免 dead_code：valid_goal_status 为 M2 命令层校验预留在用接口
/// （M1 只开放 active⇄paused 子集，白名单总入口先随纯函数落地，学
/// KnowledgeDecision M1 类型机制先行先例）。
#[allow(dead_code)]
pub const GOAL_STATUSES: [&str; 4] = [GOAL_ACTIVE, GOAL_PAUSED, GOAL_GRADUATED, GOAL_ABANDONED];

/// 状态合法性（非法值 → false——命令层拒绝入库）。
/// 登记豁免 dead_code：M2（pause/abandon/graduate 命令层）接入后移除。
#[allow(dead_code)]
pub fn valid_goal_status(status: &str) -> bool {
    GOAL_STATUSES.contains(&status)
}

/// 状态机转移守卫（规格 §七图）。
///
/// @ai-context: paused→graduated 不允许（毕业仪式只从 active 发起——暂停中的
///              目标先恢复再毕业，仪式语义单一）；毕业/放弃为终态
///              （无复活路径，弹性承诺的放弃不追责但也不回滚）。
pub fn can_transition(from: &str, to: &str) -> bool {
    match from {
        GOAL_ACTIVE => matches!(to, GOAL_PAUSED | GOAL_GRADUATED | GOAL_ABANDONED),
        GOAL_PAUSED => matches!(to, GOAL_ACTIVE | GOAL_ABANDONED),
        // graduated / abandoned 为终态
        _ => false,
    }
}

/// 单个判据项的检查结果（毕业确认仪式/详情页可见——不静默，六类归一）。
#[derive(Debug, Clone, PartialEq)]
pub struct ReadinessCheck {
    /// 判据项名称（人类可读）
    pub label: String,
    pub met: bool,
    /// 现状说明（如「里程碑 2/4」「结算 0/1」）
    pub detail: String,
}

/// 可毕业判定报告。
#[derive(Debug, Clone, PartialEq)]
pub struct ReadinessReport {
    /// 全部判据满足且状态合法（active）
    pub ready: bool,
    pub checks: Vec<ReadinessCheck>,
}

/// 毕业判据（判据配方快照 × 现算进度信号——规格 §七 ①-⑤）。
///
/// @ai-context: 守卫：已毕业/已放弃目标**不可重复判毕业**（重复毕业非法——
///              状态机终态语义）；暂停目标不参与判定（毕业仅从 active 发起）。
pub fn graduation_readiness(status: &str, progress: &GoalProgressReport, criteria: &SuccessCriteria) -> ReadinessReport {
    // 状态守卫：只有进行中目标可判「可毕业」
    if status != GOAL_ACTIVE {
        let guard = ReadinessCheck {
            label: "目标状态".to_string(),
            met: false,
            detail: if status == GOAL_GRADUATED {
                "已毕业（终态，不可重复毕业）".to_string()
            } else if status == GOAL_ABANDONED {
                "已放弃（终态，不可再判毕业）".to_string()
            } else {
                "已暂停（恢复后再判毕业）".to_string()
            },
        };
        return ReadinessReport { ready: false, checks: vec![guard] };
    }

    let mut checks = Vec::new();
    // ① 里程碑全部 done（且 ≥1 个——里程碑清单就是用户的计划，清单为空无判据）
    let ms_met = progress.milestone_total >= 1 && progress.milestone_done == progress.milestone_total;
    checks.push(ReadinessCheck {
        label: "里程碑".to_string(),
        met: ms_met,
        detail: if progress.milestone_total == 0 {
            "无里程碑（请先拆出可执行计划）".to_string()
        } else {
            format!("{} / {} 已完成", progress.milestone_done, progress.milestone_total)
        },
    });
    // ② 组结算历史数（归档组仍计入——结算历史计数口径）
    let st_met = progress.settlements_count >= criteria.group_settlements;
    checks.push(ReadinessCheck {
        label: "组结算".to_string(),
        met: st_met,
        detail: format!(
            "{} / {} 次（含归档组历史）",
            progress.settlements_count, criteria.group_settlements
        ),
    });
    // ③ 应用记录（solo_project 档要求 ≥1；None=不要求——不检查不展示）
    if let Some(req) = criteria.applications {
        let met = progress.applications_count >= req;
        checks.push(ReadinessCheck {
            label: "应用记录".to_string(),
            met,
            detail: format!("{} / {} 条", progress.applications_count, req),
        });
    }
    // ④ 自测（M1/M2 占位：self_test_enforced=false 不参与判定——防占位假装达标）
    if criteria.self_test_enforced {
        let met = match (criteria.self_test_rate, progress.self_test_passed_rate) {
            // 无自测数据 → 未达标（诚实——不把「无数据」当「达标」）
            (Some(rate), Some(actual)) => actual >= rate,
            _ => false,
        };
        checks.push(ReadinessCheck {
            label: "自测通过率".to_string(),
            met,
            detail: match progress.self_test_passed_rate {
                Some(actual) => format!("{}% / {}%", (actual * 100.0).round(), (criteria.self_test_rate.unwrap_or(0.0) * 100.0).round()),
                None => "无自测数据（自测链路 M3 生效后回填）".to_string(),
            },
        });
    }
    // ⑤ 近 90 天复习活跃度（default 档要求）
    if let Some(req) = criteria.review_active_days {
        let met = progress.review_days_90 >= req;
        checks.push(ReadinessCheck {
            label: "复习活跃".to_string(),
            met,
            detail: format!("近 90 天 {} / {} 天", progress.review_days_90, req),
        });
    }
    let ready = checks.iter().all(|c| c.met);
    ReadinessReport { ready, checks }
}

#[cfg(test)]
#[path = "goal_rules_tests.rs"]
mod tests;
