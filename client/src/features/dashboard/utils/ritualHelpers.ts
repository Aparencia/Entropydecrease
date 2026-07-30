/**
 * 启动仪式纯函数工具 / Pure helpers for the startup ritual
 *
 * @ai-context: 本文件仅含纯函数（无副作用、无存储/网络访问），可安全
 * 并发重构。快选标签、目标接力与三段式填空的业务规则集中在此，
 * 供 ritualService 与组件层复用（RIT-09/RIT-11）。
 * @ai-context: Pure functions only (no side effects, no storage/network).
 * Quick-tag building, goal relay and structured goal composition rules
 * live here, shared by ritualService and UI components (RIT-09/RIT-11).
 */
import type { RitualRecord, MasteryMark } from '@/types/ritual';
import type { QuickTag } from '../types';

/** 快选标签总数上限（1 个接力位 + 4 个笔记标题位） */
export const MAX_QUICK_TAGS = 5;

/** 标签展示长度上限，超出截断（避免长标题撑爆胶囊按钮） */
const TAG_MAX_LENGTH = 14;

/** 三段式填空动词选项（RIT-11） */
export const GOAL_VERBS = ['搞懂', '复习', '完成', '练习'] as const;
export type GoalVerb = (typeof GOAL_VERBS)[number];

/** 返回本地时区 YYYY-MM-DD 日期字符串 */
export function getTodayStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** 截断标签文本到展示上限 */
function truncateTag(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > TAG_MAX_LENGTH ? `${trimmed.slice(0, TAG_MAX_LENGTH)}…` : trimmed;
}

/**
 * 从仪式历史中找出最近一条"未完成的目标"（目标接力，RIT-09）。
 * 规则：按日期倒序，取第一条 goalText 非空、goalCompleted !== true
 * 且不是今天的记录（今天的目标尚在进行中，不构成"昨日未完成"）。
 */
export function findLastUnfinishedGoal(
  records: RitualRecord[],
  today: string = getTodayStr(),
): string | undefined {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const hit = sorted.find(
    (r) => r.date !== today && !!r.goalText?.trim() && r.goalCompleted !== true,
  );
  return hit?.goalText?.trim();
}

/**
 * 构建微目标快选标签（RIT-09）。
 * 第一位固定为"昨日未完成目标"接力项（若存在），其余取自最近笔记标题
 * （最多取最近 10 条，去重、去空，截断到展示长度），总数 ≤ 5。
 */
export function buildQuickTags(
  recentNoteTitles: string[],
  lastUnfinishedGoal?: string,
): QuickTag[] {
  const tags: QuickTag[] = [];
  if (lastUnfinishedGoal?.trim()) {
    tags.push({ text: truncateTag(lastUnfinishedGoal), relay: true });
  }
  const seen = new Set<string>(tags.map((t) => t.text));
  for (const title of recentNoteTitles.slice(0, 10)) {
    if (tags.length >= MAX_QUICK_TAGS) break;
    const text = truncateTag(title);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    tags.push({ text, relay: false });
  }
  return tags;
}

/**
 * 三段式填空合成目标文本（RIT-11）："我要 [动词] [对象] [范围]"。
 * 对象为空时返回空串（结构化目标至少需要对象）。
 */
export function composeStructuredGoal(verb: GoalVerb, object: string, scope: string): string {
  const obj = object.trim();
  if (!obj) return '';
  const scopePart = scope.trim() ? ` ${scope.trim()}` : '';
  return `${verb}${obj}${scopePart}`;
}

/** 掌握标记是否应触发复习卡生成（RIT-06：模糊/未掌握才安排复习） */
export function shouldScheduleReviewCard(mark: MasteryMark | undefined | null): boolean {
  return mark === 'fuzzy' || mark === 'unmastered';
}

/** YYYY-MM-DD 减一天 */
function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return getTodayStr(d);
}

/**
 * 计算"仪式火种"连续天数（RIT-19）——假设今天已完成仪式，返回包含今天
 * 在内、向前不间断的连续天数（今天=1，昨天也有记录则累加，以此类推）。
 * @param records 今天完成前的历史记录（不含今天亦可，函数自行去重日期）
 * @param today 今天日期字符串
 */
export function computeRitualStreak(
  records: RitualRecord[],
  today: string = getTodayStr(),
): number {
  const dates = new Set(records.map((r) => r.date));
  let streak = 1; // 今天刚完成
  let cursor = prevDay(today);
  while (dates.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}

