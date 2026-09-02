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

// ───────────────────────── v0.18.1 毕业仪式/回顾流（REQ-255/256） ─────────────────────────

/** 里程碑快照（毕业报告项） */
export interface MilestoneSnapshot {
  title: string;
  status: MilestoneStatus;
  completedAt: number | null;
}

/** 组结算快照（绑定组维度——历史计数，含归档组） */
export interface GroupSettlementSnapshot {
  groupId: number;
  groupName: string;
  settlementCount: number;
  lastSettledAt: number | null;
}

/** 复习统计（毕业报告口径） */
export interface ReviewStats {
  cardTotal: number;
  reviewLogsTotal: number;
  reviewDays90: number;
  weakCards: number;
}

/** 成果物清单（组·笔记·闪卡·概念——「我留下了什么」） */
export interface ArtifactsInventory {
  groups: number;
  notes: number;
  cards: number;
  concepts: number;
}

/** 毕业报告（快照——毕业后冻结，目标删除仍可读） */
export interface GraduationReport {
  goalId: number;
  goalName: string;
  graduatedAt: number;
  milestones: MilestoneSnapshot[];
  groupSettlements: GroupSettlementSnapshot[];
  reviewStats: ReviewStats;
  artifacts: ArtifactsInventory;
  criteriaStatement: string;
}

/** 回顾流条目（时间线节点） */
export interface RetroEntry {
  kind: "created" | "milestone" | "settlement" | "graduated";
  occurredAt: number;
  title: string;
  detail: string;
}

/** 回顾流视图（现算 + 毕业报告快照） */
export interface GoalRetroView {
  status: GoalStatus;
  entries: RetroEntry[];
  graduation: GraduationReport | null;
}

// ───────────────────────── v0.18.2 AI 目标规划（REQ-251~254） ─────────────────────────

/** 里程碑建议（AI 草案） */
export interface ProposalMilestone {
  title: string;
  dueWeeks: number;
  criteriaType: "manual" | "group_settled";
  refGroupId: number | null;
  note: string;
}

/** 组绑定建议 */
export interface ProposalGroup {
  groupId: number;
  reason: string;
}

/** 概念建议（体系骨架） */
export interface ProposalConcept {
  name: string;
  essence: string;
  boundary: string;
  relation: string;
}

/** 体系建议（create 新建骨架 / link 挂接现有） */
export interface ProposalSystem {
  action: "create" | "link";
  systemId: number | null;
  name: string | null;
  coreQuestion: string | null;
  domainEntries: string[];
  concepts: ProposalConcept[];
  reason: string;
}

/** 周契约建议（建议值——仍需用户确认） */
export interface ProposalContract {
  targetDays: number;
  targetCards: number;
}

/** 目标规划提案（AI 输出蓝图——确认前不落库） */
export interface GoalPlanProposal {
  milestones: ProposalMilestone[];
  groups: ProposalGroup[];
  systems: ProposalSystem[];
  weeklyContract: ProposalContract | null;
  summary: string;
}

/** 清洗登记（丢弃项诚实提示） */
export interface PlanValidationView {
  droppedMilestones: string[];
  droppedGroups: string[];
  droppedSystems: string[];
}

/** 规划结果视图（草案 + 清洗登记 + 诚实提示 + 成本） */
export interface GoalPlanView {
  proposal: GoalPlanProposal;
  dropped: PlanValidationView;
  honestNote: string;
  costYuan: number;
  model: string;
}

/** 概念弱信号视图 */
export interface ConceptWeaknessView {
  conceptId: number;
  name: string;
  weak: boolean;
  reason: string;
}
