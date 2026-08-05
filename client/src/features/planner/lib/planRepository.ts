/**
 * 学习规划器 — 本地存储与规则规划
 * Learning planner — localStorage persistence & local rule planning
 *
 * @ai-context: 计划按日期持久化在 localStorage（key kb-learning-plan:YYYY-MM-DD），
 * 短期数据重新生成即可，不引入 SQLite schema 迁移。buildLocalPlan 是 AI 不可用
 * 时的兜底：到期卡优先复习 + 高峰时段深度学习 + 轻量收尾。
 * @ai-context: Plans persist per-day in localStorage; buildLocalPlan is the
 * offline fallback that prioritizes due reviews and peak-hour deep work.
 */

import { flashcardDeckStore, flashcardStore, pomodoroSessionStore } from '@/lib/storage';
import type { PlanItem, LearningPlan, PlanModule, PlanSource } from '../types';

const KEY_PREFIX = 'kb-learning-plan:';

/** 今日日期 YYYY-MM-DD */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 读取指定日期的计划（不存在返回 null） */
export function loadPlan(date: string): LearningPlan | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + date);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LearningPlan;
    // 防御性校验：localStorage 可能被外部写入/旧版本残留，
    // 非法 module 会在渲染层 PLAN_MODULE_META 索引时抛 TypeError 崩溃
    if (!parsed || !Array.isArray(parsed.items) || parsed.date !== date) return null;
    const validModules = new Set<PlanModule>(['pomodoro', 'notes', 'flashcards', 'feynman', 'inspiration']);
    parsed.items = parsed.items.filter((i) => i && validModules.has(i.module));
    if (parsed.items.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 保存指定日期的计划 */
export function savePlan(plan: LearningPlan): void {
  try {
    localStorage.setItem(KEY_PREFIX + plan.date, JSON.stringify(plan));
  } catch {
    /* localStorage 满/不可用时静默——计划可重新生成 */
  }
}

// ============================================================
// 本地规则规划（AI 不可用时的兜底，离线可用）
// ============================================================

interface LocalPlanContext {
  dueByDeck: Record<string, number>;
  peakHour: boolean;
  todayMinutes: number;
}

/**
 * 本地规则规划：到期卡优先复习；高峰时段安排深潜；默认轻量组合。
 * 完全基于本地数据，零 AI 依赖（本地优先原则）。
 */
export async function buildLocalPlan(): Promise<LearningPlan> {
  const ctx = await collectLocalContext();

  const items: PlanItem[] = [];
  let order = 1;

  // 1. 到期卡片优先复习（呼吸）
  const totalDue = Object.values(ctx.dueByDeck).reduce((a, v) => a + v, 0);
  if (totalDue > 0) {
    const deckName = Object.entries(ctx.dueByDeck).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '到期卡片';
    const minutes = Math.min(30, Math.max(15, Math.round(totalDue * 0.8)));
    items.push({
      id: crypto.randomUUID(), module: 'flashcards', order: order++,
      title: `呼吸一次：复习「${deckName}」`, minutes,
      task: `今天有 ${totalDue} 张卡片到期，先清掉它们，记忆就不会断`,
      reason: `到期 ${totalDue} 张卡，间隔重复需要及时巩固`,
      done: false,
    });
  }

  // 2. 高峰时段深度学习（深潜）
  const deepMinutes = ctx.peakHour ? 35 : 25;
  items.push({
    id: crypto.randomUUID(), module: 'pomodoro', order: order++,
    title: `深潜 ${deepMinutes} 分钟`, minutes: deepMinutes,
    task: '挑一个今天最想推进的主题，专注学习一个完整周期',
    reason: ctx.peakHour ? '现在正处于你的高峰时段，适合深度学习' : '保持一个标准深潜周期',
    done: false,
  });

  // 3. 轻量收尾（费曼或笔记，取决于今日时长）
  if (ctx.todayMinutes < 60) {
    items.push({
      id: crypto.randomUUID(), module: 'feynman', order: order++,
      title: '浮出水面：讲一句话', minutes: 10,
      task: '把今天学的某个概念用一句话讲给自己听——讲得出来才是真懂',
      reason: '费曼输出是把短期记忆固化的关键一步',
      done: false,
    });
  }

  return {
    date: todayISO(),
    items,
    note: ctx.todayMinutes >= 60
      ? '今天已经学了不少，按这个轻量计划收尾就好。'
      : '按自己的节奏来，完成一项就够好了。',
    source: 'local',
    generatedAt: new Date().toISOString(),
  };
}

/** 聚合本地上下文（掌握度/到期卡/高峰/今日分钟） */
async function collectLocalContext(): Promise<LocalPlanContext> {
  // 到期卡：按 deckId 分组
  const dueByDeck: Record<string, number> = {};
  try {
    const cards = await flashcardStore.getAll();
    const decks = await flashcardDeckStore.getAll();
    const now = Date.now();
    for (const c of cards) {
      if (new Date(c.dueDate).getTime() <= now) {
        const deck = decks.find((d) => d.id === c.deckId);
        const key = deck?.name ?? c.deckId.slice(0, 8);
        dueByDeck[key] = (dueByDeck[key] ?? 0) + 1;
      }
    }
  } catch {
    /* 数据不可用时跳过（兜底计划不依赖到期卡） */
  }

  // 今日已学分钟（番茄钟）
  let todayMinutes = 0;
  try {
    const sessions = await pomodoroSessionStore.getAll();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    todayMinutes = sessions
      .filter((s) => new Date(s.completedAt).getTime() >= startOfDay.getTime())
      .reduce((a, s) => a + Math.round(s.actualDuration / 60), 0);
  } catch {
    /* 静默 */
  }

  // 高峰时段：按当前小时粗判（8-11 点、14-17 点、20-22 点视为常规高峰）
  const hour = new Date().getHours();
  const peakHour = (hour >= 8 && hour <= 11) || (hour >= 14 && hour <= 17) || (hour >= 20 && hour <= 22);

  return { dueByDeck, peakHour, todayMinutes };
}

/** 将 AI 返回项规范化为 PlanItem */
export function normalizePlanItems(
  raw: Array<{ module: string; title?: string; minutes?: number; task?: string; reason?: string; order?: number }>,
): PlanItem[] {
  const validModules = new Set<PlanModule>(['pomodoro', 'notes', 'flashcards', 'feynman', 'inspiration']);
  const items: PlanItem[] = [];
  for (const r of raw) {
    if (!r || !validModules.has(r.module as PlanModule)) continue;
    const minutes = Math.max(1, Math.min(120, Math.round(r.minutes ?? 30)));
    items.push({
      id: crypto.randomUUID(),
      module: r.module as PlanModule,
      title: r.title?.slice(0, 60) || '学习任务',
      minutes,
      task: r.task?.slice(0, 200) ?? '',
      reason: r.reason?.slice(0, 200) ?? '',
      order: items.length + 1,
      done: false,
    });
  }
  return items;
}

/** 组装发往网关的上下文文本（掌握度摘要等） */
export async function buildPlanContextText(): Promise<{
  masterySummary: string;
  dueCounts: Record<string, number>;
  peakHours: number[];
  weeklyGoalMinutes: number;
  todayMinutes: number;
}> {
  const ctx = await collectLocalContext();
  // 到期卡摘要即掌握度代理（朦胧档）
  const deckLines = Object.entries(ctx.dueByDeck)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}：${v} 张到期（朦胧）`);
  const masterySummary = deckLines.length > 0 ? deckLines.join('；') : '';

  // 最近 7 天学习分钟 ×1.2 作为周目标参考
  let weeklyGoalMinutes = 300;
  try {
    const sessions = await pomodoroSessionStore.getAll();
    const weekAgo = Date.now() - 7 * 86_400_000;
    const weekMin = sessions
      .filter((s) => new Date(s.completedAt).getTime() >= weekAgo)
      .reduce((a, s) => a + Math.round(s.actualDuration / 60), 0);
    if (weekMin > 0) weeklyGoalMinutes = Math.min(1200, Math.round(weekMin * 1.2));
  } catch { /* 静默 */ }

  return {
    masterySummary,
    dueCounts: ctx.dueByDeck,
    peakHours: ctx.peakHour ? [new Date().getHours()] : [],
    weeklyGoalMinutes,
    todayMinutes: ctx.todayMinutes,
  };
}

/** 由 AI 响应构造计划（空 items 时返回 null，调用方回退本地规划） */
export function planFromAI(
  raw: {
    date?: string;
    items?: Array<{ module: string; title?: string; minutes?: number; task?: string; reason?: string; order?: number }>;
    note?: string;
  },
): LearningPlan | null {
  const items = normalizePlanItems(raw.items ?? []);
  if (items.length === 0) return null;
  return {
    date: raw.date ?? todayISO(),
    items,
    note: raw.note?.slice(0, 120) ?? '',
    source: 'ai',
    generatedAt: new Date().toISOString(),
  };
}
