/**
 * goals.ts — v0.18.0 学习目标领域类型（与 Rust serde camelCase 契约对齐）。
 *
 * @ai-context: 目标是学习循环的意图层对象（规格 §一）——可追踪/可毕业/可复盘
 *              的「学会 Python」；三表：goals/goal_milestones/goal_groups。
 * @ai-context: 四态无 draft（访谈中断不落库）；判据配方为快照、进度信号现算
 *              （零双写一致性契约）；弱项=FSRS 低稳定性卡占比（M1）。
 */

/** 目标四态（M1 只有 active 出现——暂停/放弃/毕业 UI 随 M2） */
export type GoalStatus = "active" | "paused" | "graduated" | "abandoned";

/** 里程碑状态 */
export type MilestoneStatus = "pending" | "in_progress" | "done" | "skipped";

/** 里程碑判据类型（self_test 仅 M3 占位契约，M1 不可写） */
export type CriteriaType = "manual" | "group_settled" | "self_test";

/** 判据档位（第 3 问「做到什么程度算会了」） */
export type CriteriaTier = "hands_on" | "solo_project" | "teach_cert" | "default";

/** 目标（goals 行；JSON 文本字段原样透传——解析见 SuccessCriteria/GoalIntent） */
export interface Goal {
  id: number;
  name: string;
  /** 领域标签（DomainKind kebab-case；null=未指定） */
  domainTag: string | null;
  status: GoalStatus;
  /** 中周期锚点（Unix 秒；非截止日 KPI；null=无期限） */
  horizonEnd: number | null;
  successCriteriaJson: string;
  intentJson: string;
  /** 创建时刻即开始时间（"第 6/12 周"由 created_at 推算） */
  createdAt: number;
  completedAt: number | null;
  updatedAt: number;
}

/** 目标里程碑 */
export interface GoalMilestone {
  id: number;
  goalId: number;
  title: string;
  dueAt: number | null;
  orderIdx: number;
  status: MilestoneStatus;
  criteriaType: CriteriaType;
  /** 绑定组（group_settled 型；组删除 SET NULL→降级手动） */
  refGroupId: number | null;
  completedAt: number | null;
  createdAt: number;
}

/** 判据配方（success_criteria_json 契约；毕业冻结快照） */
export interface SuccessCriteria {
  tier: CriteriaTier;
  groupSettlements: number;
  applications: number | null;
  selfTestRate: number | null;
  /** M1/M2 占位 false——自测链路 M3 真实化前不参与判定 */
  selfTestEnforced: boolean;
  reviewActiveDays: number | null;
  statement: string;
}

/** 访谈答案（intent_json 契约；全部可空——跳过/快速模式合法） */
export interface GoalIntent {
  scenario: string | null;
  level: string | null;
  driver: string | null;
  criteriaStatement: string | null;
  horizon: string | null;
  nonScope: string | null;
  weeklyCommitment: string | null;
  obstacles: string | null;
}

/** 组弱项信号（M1：FSRS 低稳定性卡占比） */
export interface GroupWeakness {
  groupId: number;
  groupName: string;
  cardTotal: number;
  weakCards: number;
  weakRatio: number;
}

/** 进度报告（现算——与库一致） */
export interface GoalProgressReport {
  milestoneTotal: number;
  milestoneDone: number;
  percent: number;
  settlementsCount: number;
  contractDone: number;
  contractTotal: number;
  reviewDays90: number;
  applicationsCount: number;
  /** M1 占位 null（无自测链路） */
  selfTestPassedRate: number | null;
  weakGroups: GroupWeakness[];
}

/** 判据检查（可毕业明细） */
export interface ReadinessView {
  label: string;
  met: boolean;
  detail: string;
}

/** 进度视图（现算信号 + 一句话进度 + 可毕业判定） */
export interface GoalProgressView {
  progress: GoalProgressReport;
  statement: string;
  ready: boolean;
  checks: ReadinessView[];
}

/** 目标卡（列表项——单行折叠） */
export interface GoalCardView {
  goal: Goal;
  statement: string;
  percent: number;
  milestoneDone: number;
  milestoneTotal: number;
  ready: boolean;
}

/** 目标绑定组视图 */
export interface GoalGroupView {
  id: number;
  name: string;
}

/** 目标详情（一次取全） */
export interface GoalDetailView {
  goal: Goal;
  criteria: ReadinessView[];
  progress: GoalProgressView;
  milestones: GoalMilestone[];
  groups: GoalGroupView[];
  declaration: string;
}

/** 新建目标入参（访谈结果全量提交；tier/scenario 同缺=快速模式） */
export interface GoalCreateInput {
  name: string;
  domainTag?: string | null;
  /** 3m/6m/none/2w */
  horizon?: string | null;
  tier?: CriteriaTier | null;
  scenario?: string | null;
  level?: string | null;
  driver?: string | null;
  criteriaStatement?: string | null;
  nonScope?: string | null;
  weeklyCommitment?: string | null;
  obstacles?: string | null;
  groupIds: number[];
  milestones: { title: string; dueWeeks: number }[];
}

/** 里程碑草案（后端 suggest_goal_milestones 返回——单一事实源） */
export interface MilestoneDraft {
  title: string;
  dueWeeks: number;
}

/** 状态徽标文案映射 */
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  graduated: "已毕业",
  abandoned: "已放弃",
};
