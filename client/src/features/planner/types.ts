/**
 * 学习规划器 — 类型定义
 * Learning planner — type definitions
 *
 * @ai-context: P1 个性化学习路径的原子层契约。LearningPlan 由 AI 网关
 * （/api/v1/ai/learning-plan）或本地规则规划生成，按日期持久化在
 * localStorage（短期数据，重新生成即可，无需 SQLite 迁移）。
 * @ai-context: Atomic types for the daily learning plan. Plans are generated
 * by the AI gateway or local rules, persisted per-day in localStorage.
 */

/** 计划任务模块（与服务端白名单保持一致） */
export type PlanModule = 'pomodoro' | 'notes' | 'flashcards' | 'feynman' | 'inspiration';

/** 单个计划任务 */
export interface PlanItem {
  id: string;
  module: PlanModule;
  title: string;
  minutes: number;
  task: string;
  reason: string;
  order: number;
  /** 是否已完成（本地勾选） */
  done: boolean;
}

/** 计划来源 */
export type PlanSource = 'ai' | 'local';

/** 今日学习计划 */
export interface LearningPlan {
  /** 计划日期 YYYY-MM-DD */
  date: string;
  items: PlanItem[];
  note: string;
  source: PlanSource;
  generatedAt: string; // ISO 8601
}

/** 模块展示元信息 */
export const PLAN_MODULE_META: Record<PlanModule, { label: string; route: string; badge: string }> = {
  pomodoro:    { label: '深潜',       route: '/pomodoro',    badge: 'bg-orange-500/15 text-orange-400' },
  notes:       { label: '结礁',       route: '/notes',       badge: 'bg-blue-500/15 text-blue-400' },
  flashcards:  { label: '呼吸',       route: '/flashcards',  badge: 'bg-emerald-500/15 text-emerald-400' },
  feynman:     { label: '浮出水面',   route: '/feynman',     badge: 'bg-cyber/15 text-cyber' },
  inspiration: { label: '灵感',       route: '/inspiration', badge: 'bg-amber/15 text-amber' },
};
