/**
 * goalInterview.ts — 访谈四步的选项常量与构建辅助（纯数据/纯函数，零 React）。
 *
 * @ai-context: 与后端 goal_interview.rs 契约对齐——chips 值是后端识别的语义 id
 *              （level/commitment/horizon 白名单在 goal_interview.rs，未知值
 *              诚实回落默认）；tier 值直接进 SuccessCriteria.tier。
 * @ai-context: 第 1/3 问必答、2/4 问折叠可选是后端校验语义（命令层拦截），
 *              这里只提供选项与展示文案——「访谈绝不允许变成负担」。
 */
import type { CriteriaTier, GoalCreateInput } from "../types/goals";

/** 第 1 问：学会以后想用它做什么（场景 chips；也允许自由输入） */
export const SCENARIO_OPTIONS: string[] = ["工作自动化", "独立项目", "考试通关", "兴趣分享"];

/** 第 2 问：现在什么程度 */
export const LEVEL_OPTIONS: { id: string; label: string }[] = [
  { id: "zero", label: "零基础" },
  { id: "some", label: "会一点" },
  { id: "mid", label: "系统学过一半" },
];

/** 第 2 问：为什么是现在 */
export const DRIVER_OPTIONS: string[] = ["工作需要", "转行", "好奇", "其他"];

/** 第 3 问：做到什么程度算会了（判据档位 chips） */
export const TIER_OPTIONS: { id: CriteriaTier; label: string }[] = [
  { id: "hands_on", label: "能上手" },
  { id: "solo_project", label: "能独立完成实例" },
  { id: "teach_cert", label: "能教别人 / 证书通过" },
  { id: "default", label: "说不清" },
];

/** 第 3 问：时间怎么算 */
export const HORIZON_OPTIONS: { id: string; label: string }[] = [
  { id: "3m", label: "3 个月" },
  { id: "6m", label: "半年" },
  { id: "2w", label: "先试两周" },
  { id: "none", label: "无期限" },
];

/** 第 4 问：每周能投多少时间 */
export const COMMITMENT_OPTIONS: { id: string; label: string }[] = [
  { id: "5h+", label: "≥5 小时" },
  { id: "2-5h", label: "2-5 小时" },
  { id: "flex", label: "看情况" },
];

/** 访谈答案收集（Dialog 状态；全部可空=跳过/快速模式） */
export interface InterviewAnswers {
  scenario: string;
  level: string;
  driver: string;
  tier: CriteriaTier | "";
  criteriaStatement: string;
  horizon: string;
  nonScope: string;
  weeklyCommitment: string;
  obstacles: string;
  groupIds: number[];
}

export const EMPTY_ANSWERS: InterviewAnswers = {
  scenario: "",
  level: "",
  driver: "",
  tier: "",
  criteriaStatement: "",
  horizon: "",
  nonScope: "",
  weeklyCommitment: "",
  obstacles: "",
  groupIds: [],
};

/** 访谈必答校验（第 1/3 问——后端同口径，前端先行拦截友好提示） */
export function interviewMissing(a: InterviewAnswers): string | null {
  if (!a.scenario.trim()) return "第 1 问「学会以后想用它做什么？」必答";
  if (!a.tier) return "第 3 问「做到什么程度算会了？」必答";
  return null;
}

/** 访谈答案 → create_goal 入参（后端 build_intent/derive_criteria 兜底空值） */
export function toCreateInput(
  name: string,
  horizon: string,
  a: InterviewAnswers,
  milestones: { title: string; dueWeeks: number }[],
): GoalCreateInput {
  return {
    name,
    horizon: horizon || null,
    tier: a.tier || null,
    scenario: a.scenario || null,
    level: a.level || null,
    driver: a.driver || null,
    criteriaStatement: a.criteriaStatement || null,
    nonScope: a.nonScope || null,
    weeklyCommitment: a.weeklyCommitment || null,
    obstacles: a.obstacles || null,
    groupIds: a.groupIds,
    milestones,
  };
}

/** 快速模式入参（tier/scenario 省略=默认档——后端契约） */
export function toQuickInput(name: string, horizon: string): GoalCreateInput {
  return { name, horizon: horizon || null, groupIds: [], milestones: [] };
}

/** 时限 → 展示文案（与后端 horizon_label 同口径——展示层复制，判定仍归后端） */
export function horizonLabel(horizon: string): string {
  switch (horizon) {
    case "3m": return "3 个月";
    case "6m": return "半年";
    case "2w": return "先试两周";
    default: return horizon ? "12 周" : "12 周";
  }
}

/** 宣言回显预览（与后端 assemble_declaration 同语义——展示层，创建走后端） */
export function assembleDeclarationPreview(
  name: string,
  horizon: string,
  a: InterviewAnswers,
  tierLabel: string,
): string {
  const standard = a.criteriaStatement.trim() || tierLabel || "（未判定标准）";
  const scene = a.scenario.trim() ? `（场景：${a.scenario.trim()}）` : "";
  return `用${horizonLabel(horizon)}学会${name.trim()}${scene}，达成标准：${standard}；边界：${a.nonScope.trim() || "暂未明确"}`;
}
