//! 周契约 commands（v0.11.4 REQ-200；弹性承诺呈现层系统层）。
//!
//! @ai-context: 弹性承诺纪律（v4 §8.2 P31+N10）——契约是用户自设本周目标，
//!              不是打卡 KPI：无 streak、无惩罚、欠账不追。本层只做
//!              参数校验、调用数据层/纯函数、错误映射（AGENTS.md §6）。
//! @ai-context: week_start 由命令层按当前时刻计算（周界口径单一在
//!              week_contract.rs 纯函数）——前端不传时间，只传目标值。

use serde::Serialize;
use tauri::State;

use crate::commands::AppState;
use crate::db::unix_seconds;
use crate::types::WeekContract;
use crate::week_contract::{aggregate_week, minimal_day_met, week_start_secs};

/// 承诺天数合法区间（1..=7——一周最多七天，诚实有界）。
const TARGET_DAYS_RANGE: std::ops::RangeInclusive<i64> = 1..=7;
/// 承诺卡数上限（有界防超大 payload；一周 200 次复习已远超合理承诺）。
const TARGET_CARDS_MAX: i64 = 200;

/// 周契约状态读数（承诺 vs 实际；UI 周契约卡数据源）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekContractStatus {
    /// 本周契约（None=未立约——UI 显示设定表单）
    pub contract: Option<WeekContract>,
    /// 周界（周一零点 UTC 秒；UI 转本地日期展示）
    pub week_start: i64,
    /// 本周实际复习天数（按日去重——断签不清零）
    pub actual_days: usize,
    /// 本周实际复习卡次数
    pub actual_cards: usize,
    /// 最小可行日徽标：本周完成 ≥3 卡即成立（N9/N11 低谷生存最轻形态）
    pub minimal_day_met: bool,
}

/// 校验组存在性（contracts 外键 + 前端按 id 刷新共用）。
fn require_group(state: &AppState, group_id: i64) -> Result<(), String> {
    if group_id <= 0 {
        return Err("无效的组 id".to_string());
    }
    if state.db.get_group(group_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("笔记组不存在: {}", group_id));
    }
    Ok(())
}

/// 设定/覆盖本周契约（幂等——同周同组覆盖目标值；改目标即改承诺）。
#[tauri::command]
pub fn upsert_week_contract(
    state: State<'_, AppState>,
    group_id: i64,
    target_days: i64,
    target_cards: i64,
) -> Result<WeekContract, String> {
    require_group(&state, group_id)?;
    if !TARGET_DAYS_RANGE.contains(&target_days) {
        return Err(format!("承诺天数需在 1..=7 之间（收到 {}）", target_days));
    }
    if !(1..=TARGET_CARDS_MAX).contains(&target_cards) {
        return Err(format!("承诺卡数需在 1..={} 之间（收到 {}）", TARGET_CARDS_MAX, target_cards));
    }
    let ws = week_start_secs(unix_seconds());
    state
        .db
        .upsert_week_contract(group_id, ws, target_days, target_cards)
        .map_err(|e| e.to_string())
}

/// 本周契约状态（承诺 vs 实际——review_logs 周聚合纯函数）。
///
/// @ai-context: 取数 → 聚合两步：review_ats_in_week 拿原始时刻列表（数据层），
///              aggregate_week 纯函数聚合成天数/卡数——口径可单测可追溯。
#[tauri::command]
pub fn week_contract_status(state: State<'_, AppState>, group_id: i64) -> Result<WeekContractStatus, String> {
    require_group(&state, group_id)?;
    let ws = week_start_secs(unix_seconds());
    let contract = state.db.get_week_contract(group_id, ws).map_err(|e| e.to_string())?;
    let ats = state.db.review_ats_in_week(group_id, ws).map_err(|e| e.to_string())?;
    let agg = aggregate_week(&ats);
    Ok(WeekContractStatus {
        contract,
        week_start: ws,
        actual_days: agg.review_days,
        actual_cards: agg.review_cards,
        minimal_day_met: minimal_day_met(agg.review_cards),
    })
}
