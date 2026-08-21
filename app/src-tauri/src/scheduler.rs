//! 间隔重复调度器（v0.11.2；FSRS-6 主实现，ADR-018）。
//!
//! @ai-context: fsrs crate（Anki 23.10+ 默认调度器算法）——DSR 三变量模型，
//!              按目标留存率（0.9）反解间隔；纯算法零网络，契合本地优先。
//!              裁决记录：SM-2 手写兜底的条件（依赖引入受限）未触发——crate
//!              引入成功，不保留双实现（YAGNI；接口稳定可后补）。
//! @ai-context: 弹性承诺纪律（v4 路线图裁决 4）：调度纯函数无 streak 概念，
//!              欠账卡仅按 due_at 排序呈现——不追债不清零（N10 归零暴政防御）。
//! @ai-context: 纯逻辑层（输入状态+评分→输出新状态+到期时刻），DB/UI 无关；
//!              CardState 以 JSON 落 flashcards.state_json（版本演进容忍缺字段）。

use fsrs::{MemoryState, FSRS};
use serde::{Deserialize, Serialize};

/// 目标留存率（FSRS 默认推荐值；个性化调参为复习数据积累后的远期扩展）。
pub const DESIRED_RETENTION: f32 = 0.9;
/// 一天的毫秒数。
const DAY_MS: u64 = 86_400_000;

/// 复习评分（四档——提取优先：先回忆再看后评分）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

impl Rating {
    /// 解析前端评分字符串（非法值 → None，诚实不猜）。
    pub fn parse(s: &str) -> Option<Rating> {
        match s {
            "again" => Some(Rating::Again),
            "hard" => Some(Rating::Hard),
            "good" => Some(Rating::Good),
            "easy" => Some(Rating::Easy),
            _ => None,
        }
    }
}

/// 卡片记忆状态（序列化落库；serde(default) 容忍旧格式演进）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CardState {
    /// FSRS 稳定性（天——记忆可维持时长的度量）
    pub stability: f32,
    /// FSRS 难度（1-10）
    pub difficulty: f32,
    /// 累计复习次数
    pub reps: u32,
    /// 遗忘次数（Again 计数——弹性承诺下仅统计不惩罚）
    pub lapses: u32,
    /// 上次复习时刻（Unix 毫秒；新卡 0）
    pub last_review_ms: u64,
}

impl Default for CardState {
    fn default() -> Self {
        Self { stability: 0.0, difficulty: 0.0, reps: 0, lapses: 0, last_review_ms: 0 }
    }
}

/// 调度输出（新状态 + 间隔天数 + 到期时刻）。
#[derive(Debug, Clone, PartialEq)]
pub struct ScheduleOutcome {
    pub next: CardState,
    pub interval_days: f32,
    pub due_at_ms: u64,
}

/// 调度主入口（纯函数）：新卡 state=None，复习卡 Some。
///
/// @ai-context: fsrs.next_states 对四个评分一次算全（Again/Hard/Good/Easy），
///              取本次评分分支；days_elapsed=距上次复习天数（新卡 0）——
///              欠账卡按真实过期天数演化状态（FSRS 正确处理延迟复习）。
pub fn schedule(state: Option<&CardState>, rating: Rating, now_ms: u64) -> ScheduleOutcome {
    // 默认参数恒有效（FSRS::default 同款 expect 口径）
    let fsrs = FSRS::new(&[]).expect("FSRS-6 默认参数恒有效");
    let (mem, days_elapsed) = match state {
        Some(s) if s.reps > 0 => (
            Some(MemoryState { stability: s.stability, difficulty: s.difficulty }),
            (now_ms.saturating_sub(s.last_review_ms) / DAY_MS) as u32,
        ),
        _ => (None, 0),
    };
    let states = fsrs
        .next_states(mem, DESIRED_RETENTION, days_elapsed)
        .expect("有限状态输入恒有效（fsrs 内部 validate）");
    let item = match rating {
        Rating::Again => states.again,
        Rating::Hard => states.hard,
        Rating::Good => states.good,
        Rating::Easy => states.easy,
    };
    let base = state.cloned().unwrap_or_default();
    // 间隔下限 1 天（无学习步设计——当日重学靠 Again 后次日再现，简化 UI）
    let interval_days = item.interval.max(1.0);
    let due_at_ms = now_ms + (interval_days.round() as u64).max(1) * DAY_MS;
    ScheduleOutcome {
        next: CardState {
            stability: item.memory.stability,
            difficulty: item.memory.difficulty,
            reps: base.reps + 1,
            lapses: base.lapses + if rating == Rating::Again { 1 } else { 0 },
            last_review_ms: now_ms,
        },
        interval_days,
        due_at_ms,
    }
}

#[cfg(test)]
#[path = "scheduler_tests.rs"]
mod tests;
