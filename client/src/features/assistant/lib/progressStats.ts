/**
 * A3 微进展叙述 — 周学习统计聚合
 * Weekly learning stats aggregation for the A3 micro-progress narrator
 *
 * @ai-context: 本地优先——经 db IPC 聚合 pomodoro_sessions / flashcard_reviews /
 * feynman_notes 三张表（IPC 仅支持 getAll，时间过滤在渲染层完成）；
 * formatStatsText 为纯函数（可测试），模块级缓存供 ProactiveEngine
 * 同步读取（事件触发时不可等待异步查询）。所有失败路径静默降级为空。
 * @ai-context: Aggregates three local tables via the db IPC bridge into a
 * human-readable stats sentence; pure formatter + module cache so the
 * proactive engine can read it synchronously at trigger time.
 */

/** 单个时间窗口的统计（近 7 天为一个窗口） */
export interface PeriodStats {
  /** 番茄专注次数 */
  pomodoroCount: number;
  /** 专注总时长（分钟） */
  focusMinutes: number;
  /** 闪卡复习次数 */
  reviewCount: number;
  /** 费曼讲解完成数 */
  feynmanCount: number;
}

/** 本周 vs 上周统计（上周供叙述对比用） */
export interface WeeklyStats {
  current: PeriodStats;
  previous: PeriodStats;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 数据表行结构（仅声明聚合需要的字段） */
interface PomodoroRow { completed_at: string; actual_duration: number; }
interface ReviewRow { reviewed_at: string; }
interface FeynmanRow { completed_at: string | null; }

const EMPTY_PERIOD: PeriodStats = { pomodoroCount: 0, focusMinutes: 0, reviewCount: 0, feynmanCount: 0 };

/** 解析时间戳；非法值返回 0（窗口判断时自然落选） */
function parseTs(value: string | null | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

/** 左开右闭窗口判断：(start, end] */
function inWindow(ts: number, start: number, end: number): boolean {
  return ts > start && ts <= end;
}

/** 累加单个时间窗口的统计 */
function tallyWindow(
  pomos: PomodoroRow[],
  reviews: ReviewRow[],
  feynmans: FeynmanRow[],
  start: number,
  end: number,
): PeriodStats {
  const stats = { ...EMPTY_PERIOD };
  for (const p of pomos) {
    if (inWindow(parseTs(p.completed_at), start, end)) {
      stats.pomodoroCount++;
      stats.focusMinutes += Math.max(0, Math.round(p.actual_duration ?? 0));
    }
  }
  for (const r of reviews) {
    if (inWindow(parseTs(r.reviewed_at), start, end)) stats.reviewCount++;
  }
  for (const f of feynmans) {
    if (f.completed_at && inWindow(parseTs(f.completed_at), start, end)) stats.feynmanCount++;
  }
  return stats;
}

/**
 * 采集本周与上周的学习统计。
 * 非 Electron 环境或 IPC 失败时返回全零（叙述降级为通用文案）。
 */
export async function collectWeeklyStats(now: Date = new Date()): Promise<WeeklyStats> {
  const api = window.electronAPI;
  if (!api) return { current: EMPTY_PERIOD, previous: EMPTY_PERIOD };
  try {
    const [pomos, reviews, feynmans] = await Promise.all([
      api.db.query<PomodoroRow[]>('pomodoro_sessions', 'getAll'),
      api.db.query<ReviewRow[]>('flashcard_reviews', 'getAll'),
      api.db.query<FeynmanRow[]>('feynman_notes', 'getAll'),
    ]);
    const nowMs = now.getTime();
    return {
      current: tallyWindow(pomos ?? [], reviews ?? [], feynmans ?? [], nowMs - WEEK_MS, nowMs),
      previous: tallyWindow(pomos ?? [], reviews ?? [], feynmans ?? [], nowMs - 2 * WEEK_MS, nowMs - WEEK_MS),
    };
  } catch {
    return { current: EMPTY_PERIOD, previous: EMPTY_PERIOD };
  }
}

/**
 * 把本周统计格式化为一句可读文本（纯函数）。
 * 全零时返回空串——调用方用通用正向文案兜底（不展示空数据）。
 */
export function formatStatsText(stats: WeeklyStats): string {
  const c = stats.current;
  const parts: string[] = [];
  if (c.pomodoroCount > 0) {
    parts.push(`完成了 ${c.pomodoroCount} 个专注时段（共 ${c.focusMinutes} 分钟）`);
  }
  if (c.reviewCount > 0) parts.push(`复习了 ${c.reviewCount} 张闪卡`);
  if (c.feynmanCount > 0) parts.push(`完成了 ${c.feynmanCount} 次费曼讲解`);
  return parts.join('，');
}

// ── 模块级缓存：ProactiveEngine 触发时同步读取 ──────────────

let cachedStatsText: string | null = null;

/** 采集并缓存统计文本（挂载时预取；采集失败缓存保持 null） */
export async function refreshStatsCache(): Promise<void> {
  const stats = await collectWeeklyStats();
  cachedStatsText = formatStatsText(stats) || null;
}

/** 读取缓存的统计文本；未就绪返回 null（调用方用通用文案兜底） */
export function getStatsCacheText(): string | null {
  return cachedStatsText;
}
