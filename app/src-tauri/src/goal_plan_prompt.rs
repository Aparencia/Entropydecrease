//! AI 目标规划提示词（v0.18.2 REQ-251；prompts/goal_plan.json 声明式）。
//!
//! @ai-context: NoteEnrichPrompt 同型——模板编译期捆绑（include_str），损坏回退
//!              内置最小提示词（不阻断规划）；输出 schema 在 JSON 声明（可校准
//!              不进代码）；用户侧上下文 JSON 由 command 组装（摘要+信号+检索
//!              片段+预算截断——见 budget_allocator/goal_summary）。

use serde::{Deserialize, Serialize};

use crate::ai_client::{AiClient, AiClientError};
use crate::goal_plan_protocol::{validate_proposal, GoalPlanProposal};

/// 规划提示词模板（prompts/goal_plan.json 结构）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GoalPlanPrompt {
    pub version: u32,
    pub system: String,
    pub output_format: String,
    pub few_shot: String,
}

impl GoalPlanPrompt {
    /// 编译期捆绑模板（改 JSON 重建即生效）。
    pub fn bundled() -> Self {
        let raw = include_str!("../prompts/goal_plan.json");
        serde_json::from_str(raw).unwrap_or_else(|e| {
            eprintln!("[GoalPlan] 提示词模板解析失败，使用内置兜底: {}", e);
            Self::fallback()
        })
    }

    /// 内置最小提示词（模板损坏兜底；不阻断规划）。
    pub fn fallback() -> Self {
        Self {
            version: 1,
            system: "你是学习目标规划师：结合目标上下文（摘要/信号/素材）给出可执行的里程碑、组绑定、体系建议与周契约；建议务实——只说明确可落地的内容；不回答目标之外的内容。"
                .to_string(),
            output_format: r#"只输出 JSON：{"milestones":[{"title":"..","dueWeeks":4,"criteriaType":"manual","refGroupId":null,"note":".."}],"groups":[{"groupId":12,"reason":".."}],"systems":[{"action":"create|link","systemId":null,"name":"..","coreQuestion":"..","domainEntries":[".."],"concepts":[{"name":"..","essence":"..","boundary":"..","relation":".."}]}],"weeklyContract":{"targetDays":3,"targetCards":20},"summary":"一句话规划说明"}"#.to_string(),
            few_shot: "".to_string(),
        }
    }

    /// 组装 system（基础指令 + 输出约束 + few-shot）。
    pub fn build_system(&self) -> String {
        let mut s = self.system.clone();
        if !self.few_shot.is_empty() {
            s.push_str("\n\n示例：\n");
            s.push_str(&self.few_shot);
        }
        s.push_str("\n\n");
        s.push_str(&self.output_format);
        s
    }
}

/// 规划适配器（阻塞调用——command 层 spawn_blocking 包裹；网络走共享 AiClient）。
#[derive(Debug, Clone)]
pub struct GoalPlanAdapter {
    pub client: AiClient,
    pub prompt: GoalPlanPrompt,
}

impl GoalPlanAdapter {
    pub fn new(client: AiClient) -> Self {
        Self { client, prompt: GoalPlanPrompt::bundled() }
    }

    /// 单次规划（上下文 JSON → 提示词 → 强校验）。
    ///
    /// @ai-context: 校验失败（丢弃项登记）不整次失败——局部可用原则；
    ///              所有条目仍为**草案**（确认前不落库，建议制）。
    pub fn plan(&self, context_json: &str) -> Result<GoalPlanProposal, AiClientError> {
        let system = self.prompt.build_system();
        let v = self.client.chat_json(&system, context_json)?;
        let proposal: GoalPlanProposal = serde_json::from_value(v)
            .map_err(|e| AiClientError::Parse(format!("规划响应结构非法: {}", e)))?;
        let (clean, dropped) = validate_proposal(proposal);
        if !dropped.dropped_milestones.is_empty()
            || !dropped.dropped_groups.is_empty()
            || !dropped.dropped_systems.is_empty()
        {
            eprintln!("[GoalPlan] 规划草案清洗（丢弃 {} 条，仅供参考）", dropped.dropped_milestones.len()
                + dropped.dropped_groups.len() + dropped.dropped_systems.len());
        }
        Ok(clean)
    }
}

#[cfg(test)]
#[path = "goal_plan_prompt_tests.rs"]
mod tests;
