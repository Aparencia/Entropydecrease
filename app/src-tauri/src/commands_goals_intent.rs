//! 学习目标访谈输入契约与归一（IPC DTO + 纯助手——无命令、无 DB、无 IO）。
//!
//! @ai-context: 从 commands_goals.rs 拆出（≤300 行约束 / AGENTS.md §3）。
//!              `GoalCreateInput` 是前端访谈结果的全量提交契约（serde camelCase：
//!              字段名与声明顺序即 JSON 键序，**禁止改动**——前端
//!              `InterviewDialog`/`GraduateDialog` 测试按参数形态断言）。
//! @ai-context: 归一语义：空白串一律归一为 None（访谈答案「跳过/以后想」不落空串）；
//!              答案截断 200 字（`INTENT_FIELD_MAX`，防超大 payload 入库）。
//! @ai-context: 本文件 4 个助手均为**纯函数**（无副作用、无 IO），
//!              父模块的 create_goal_inner / update_goal_inner /
//!              update_goal_interview_inner 复用它们 ⇒ `pub(crate)`。

use serde::Deserialize;

use crate::goal_schema::GoalIntent;
use crate::video_profile_domain::DomainKind;

/// 访谈答案文本上限（防御超大 payload；chips/填空兜底的答案均为短文本）。
const INTENT_FIELD_MAX: usize = 200;

/// 新建目标入参（前端访谈结果全量提交；serde camelCase 契约）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalCreateInput {
    pub name: String,
    #[serde(default)]
    pub domain_tag: Option<String>,
    /// 时限（3m/6m/none/2w；None=未填）
    #[serde(default)]
    pub horizon: Option<String>,
    /// 判据档位（None=快速模式→默认档）
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub scenario: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub driver: Option<String>,
    #[serde(default)]
    pub criteria_statement: Option<String>,
    #[serde(default)]
    pub non_scope: Option<String>,
    #[serde(default)]
    pub weekly_commitment: Option<String>,
    #[serde(default)]
    pub obstacles: Option<String>,
    /// 初始绑定组（访谈第 4 步预勾选）
    #[serde(default)]
    pub group_ids: Vec<i64>,
    /// 里程碑草案（宣言页预填可删改；due_weeks=0 无期限）
    #[serde(default)]
    pub milestones: Vec<GoalMilestoneInput>,
}

/// 里程碑草案输入。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalMilestoneInput {
    pub title: String,
    #[serde(default)]
    pub due_weeks: usize,
}

/// 领域标签校验（与 commands_groups 同口径：kebab-case 白名单；空 → None）。
pub(crate) fn parse_domain(domain_tag: Option<&str>) -> Result<Option<String>, String> {
    match domain_tag {
        Some(t) if !t.trim().is_empty() => DomainKind::parse(t.trim())
            .map(|k| Some(k.as_str().to_string()))
            .ok_or_else(|| format!("不支持的领域标签: {}", t)),
        _ => Ok(None),
    }
}

/// 空白串归一为 None（访谈答案「跳过/以后想」的存储语义：不落空串）。
fn trimmed(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string)
}

/// 访谈答案：空白归一 + 长度截断（防超大 payload 入库；truncate 保留前 200 字）。
pub(crate) fn bounded(s: Option<&str>) -> Option<String> {
    trimmed(s).map(|v| v.chars().take(INTENT_FIELD_MAX).collect())
}

/// 访谈答案 → GoalIntent（全部可选字段过 bounded 归一）。
pub(crate) fn build_intent(input: &GoalCreateInput) -> GoalIntent {
    GoalIntent {
        scenario: bounded(input.scenario.as_deref()),
        level: bounded(input.level.as_deref()),
        driver: bounded(input.driver.as_deref()),
        criteria_statement: bounded(input.criteria_statement.as_deref()),
        horizon: bounded(input.horizon.as_deref()),
        non_scope: bounded(input.non_scope.as_deref()),
        weekly_commitment: bounded(input.weekly_commitment.as_deref()),
        obstacles: bounded(input.obstacles.as_deref()),
    }
}
