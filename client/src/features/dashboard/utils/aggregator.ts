/** @file 学习分析聚合纯函数 — 五维雷达 / 热力图 / 趋势 / 推荐 */
import type { PomodoroSession, Note, Flashcard, FeynmanNote, FlashcardReview } from '@/types/models';
import type { RadarDimension, HeatmapCell, TrendPoint, TimeSlotRecommendation, GoalProgress, AnalyticsAggregate } from '../types/analytics';

const DAY_MS = 86_400_000;
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const recent = <T>(arr: T[], dt: (i: T) => Date, days: number) => { const c = Date.now() - days * DAY_MS; return arr.filter((i) => dt(i).getTime() >= c); };
const norm = (v: number, m: number) => (m === 0 ? 0 : Math.min(100, Math.round((v / m) * 100)));

/** 聚合输入类型 */
export interface AggregateInput {
  sessions: PomodoroSession[]; notes: Note[]; flashcards: Flashcard[];
  feynmanNotes: FeynmanNote[]; reviews: FlashcardReview[];
}

/** 计算五维雷达：专注度 / 效率 / 持续性 / 广度 / 活跃度 */
export function computeRadarData(
  sessions: PomodoroSession[], notes: Note[], _fc: Flashcard[],
  feynman: FeynmanNote[], reviews: FlashcardReview[], days = 30,
): RadarDimension[] {
  const rs = recent(sessions, (s) => new Date(s.completedAt), days);
  const rn = recent(notes, (n) => new Date(n.updatedAt), days);
  const rr = recent(reviews, (r) => new Date(r.reviewedAt), days);
  const rf = recent(feynman, (n) => new Date(n.updatedAt), days);
  // 专注度：平均完成率
  const focus = rs.length === 0 ? 0 : norm(rs.reduce((a, s) => a + (s.duration > 0 ? s.actualDuration / s.duration : 0), 0) / rs.length, 1);
  // 效率：字数归一化
  const words = rn.reduce((a, n) => a + (n.wordCount ?? 0), 0);
  const efficiency = norm(words, rn.length * 1500);
  // 持续性：连续天数 / 总天数
  const dates = new Set<string>();
  rs.forEach((s) => dates.add(toISO(new Date(s.completedAt))));
  rn.forEach((n) => dates.add(toISO(new Date(n.updatedAt))));
  let streak = 0; const d = new Date();
  while (dates.has(toISO(d))) { streak++; d.setDate(d.getDate() - 1); }
  const persistence = norm(streak, days);
  // 广度：科目+标签去重数
  const subs = new Set<string>();
  rs.forEach((s) => { if (s.subject) subs.add(s.subject); });
  rn.forEach((n) => n.tags.forEach((t) => subs.add(t)));
  const breadth = norm(subs.size, 10);
  // 活跃度：复习+费曼数
  const activity = norm(rr.length + rf.length, days * 3);
  return [
    { dimension: 'focus', value: focus, label: '专注度' },
    { dimension: 'efficiency', value: efficiency, label: '效率' },
    { dimension: 'persistence', value: persistence, label: '持续性' },
    { dimension: 'breadth', value: breadth, label: '广度' },
    { dimension: 'activity', value: activity, label: '活跃度' },
  ];
}

/** 按时段+星期聚合学习分钟数，返回 7×24 热力图矩阵 */
export function computeHeatmap(sessions: PomodoroSession[], days = 30): HeatmapCell[] {
  const rs = recent(sessions, (s) => new Date(s.completedAt), days);
  const m: Record<string, number> = {};
  rs.forEach((s) => {
    const d = new Date(s.completedAt);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const key = `${dow}-${d.getHours()}`;
    m[key] = (m[key] ?? 0) + Math.round(s.actualDuration / 60);
  });
  const cells: HeatmapCell[] = [];
  for (let dow = 0; dow < 7; dow++)
    for (let h = 0; h < 24; h++)
      cells.push({ dayOfWeek: dow, hour: h, value: m[`${dow}-${h}`] ?? 0 });
  return cells;
}

/** 每日学习时长趋势（含 7 天滑动均值 label） */
export function computeTrend(sessions: PomodoroSession[], days = 30): TrendPoint[] {
  const cutoff = Date.now() - days * DAY_MS;
  const dm: Record<string, number> = {};
  sessions.forEach((s) => {
    const d = new Date(s.completedAt);
    if (d.getTime() < cutoff) return;
    const k = toISO(d); dm[k] = (dm[k] ?? 0) + Math.round(s.actualDuration / 60);
  });
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = toISO(new Date(Date.now() - i * DAY_MS));
    dates.push(k); if (!(k in dm)) dm[k] = 0;
  }
  return dates.map((date, i) => {
    const w = dates.slice(Math.max(0, i - 6), i + 1);
    const avg = Math.round(w.reduce((a, d) => a + (dm[d] ?? 0), 0) / w.length);
    return { date, value: dm[date] ?? 0, label: i >= 6 ? `7日均值 ${avg}min` : undefined };
  });
}

const DOW = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 取热力图中 value 最高的 top-N 时段，生成推荐理由 */
export function computeRecommendations(heatmap: HeatmapCell[], count = 3): TimeSlotRecommendation[] {
  const nz = heatmap.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  return nz.slice(0, count).map((c) => ({
    dayOfWeek: c.dayOfWeek, hour: c.hour,
    score: norm(c.value, nz[0]?.value ?? 1),
    reason: `${DOW[c.dayOfWeek]} ${c.hour}:00 是你学习最集中的时段，累计 ${c.value} 分钟`,
  }));
}

/**
 * 计算目标进度：基于近期数据推算本周学习时长、复习数、笔记数目标
 * @ai-context: 目标值采用固定周目标，后续可改为用户自定义
 */
export function computeGoalProgress(
  sessions: PomodoroSession[], notes: Note[], reviews: FlashcardReview[], days = 7,
): GoalProgress[] {
  const rs = recent(sessions, (s) => new Date(s.completedAt), days);
  const rn = recent(notes, (n) => new Date(n.updatedAt), days);
  const rr = recent(reviews, (r) => new Date(r.reviewedAt), days);
  const totalMin = rs.reduce((a, s) => a + Math.round(s.actualDuration / 60), 0);
  const weeklyHoursTarget = 10; // 周目标 10 小时
  const weeklyNotesTarget = 5;
  const weeklyReviewsTarget = 30;
  const clamp = (v: number, m: number) => Math.min(100, Math.round((v / m) * 100));
  return [
    { id: 'goal-hours', title: '本周深潜时长', target: weeklyHoursTarget * 60, current: totalMin, unit: '分钟', progressPercent: clamp(totalMin, weeklyHoursTarget * 60) },
    { id: 'goal-notes', title: '本周结礁数', target: weeklyNotesTarget, current: rn.length, unit: '篇', progressPercent: clamp(rn.length, weeklyNotesTarget) },
    { id: 'goal-reviews', title: '本周反衰减呼吸', target: weeklyReviewsTarget, current: rr.length, unit: '次', progressPercent: clamp(rr.length, weeklyReviewsTarget) },
  ];
}

/** 聚合分析入口：编排雷达 / 热力图 / 趋势 / 推荐 / 目标 */
export function aggregateAnalytics(data: AggregateInput, days = 30): AnalyticsAggregate {
  const heatmap = computeHeatmap(data.sessions, days);
  return {
    radar: computeRadarData(data.sessions, data.notes, data.flashcards, data.feynmanNotes, data.reviews, days),
    heatmap,
    trend: computeTrend(data.sessions, days),
    recommendations: computeRecommendations(heatmap),
    period: { start: toISO(new Date(Date.now() - days * DAY_MS)), end: toISO(new Date()) },
    goals: computeGoalProgress(data.sessions, data.notes, data.reviews),
  };
}
