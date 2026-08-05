/** @file 学习分析聚合纯函数 — 五维雷达 / 热力图 / 趋势 / 推荐 */
import type { PomodoroSession, Note, Flashcard, FeynmanNote, FlashcardReview } from '@/types/models';
import type { RadarDimension, HeatmapCell, TrendPoint, TimeSlotRecommendation, GoalProgress, AnalyticsAggregate, WeeklySummary, FlowCell, FlowChannelData, MasteryDrillData } from '../types/analytics';
import { buildHourlyCurve, getEnergyLevel, type RhythmSession } from '@/features/pomodoro/lib/rhythmEngine';

const DAY_MS = 86_400_000;
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const recent = <T>(arr: T[], dt: (i: T) => Date, days: number) => { const c = Date.now() - days * DAY_MS; return arr.filter((i) => dt(i).getTime() >= c); };
const norm = (v: number, m: number) => (m === 0 ? 0 : Math.min(100, Math.round((v / m) * 100)));

// ── 非番茄钟学习分钟折算（学习脉搏反映全部学习行为，内测反馈）──
const NOTE_EDIT_MINUTES = 10;   // 每篇笔记当天更新折算 10 分钟（按 id+日期去重防自动保存虚高）
const REVIEW_MINUTES = 2;       // 每次闪卡复习折算 2 分钟
const FEYNMAN_MINUTES = 15;     // 每篇费曼输出折算 15 分钟

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

/**
 * 按时段+星期聚合学习分钟数，返回 7×24 热力图矩阵。
 * D5 扩展：efficiency=该时段完成率均值（效率维度），
 * peak=该小时是否为个人黄金时段（rhythmEngine 高峰档，用于黄金时段标注）。
 */
export function computeHeatmap(sessions: PomodoroSession[], days = 30): HeatmapCell[] {
  const rs = recent(sessions, (s) => new Date(s.completedAt), days);
  const m: Record<string, number> = {};
  const eff: Record<string, { sum: number; count: number }> = {};
  rs.forEach((s) => {
    const d = new Date(s.completedAt);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const key = `${dow}-${d.getHours()}`;
    m[key] = (m[key] ?? 0) + Math.round(s.actualDuration / 60);
    // 效率维度：完成率（实际/计划），截断 0-1.2 防异常值
    const rate = s.duration > 0 ? Math.min(1.2, s.actualDuration / s.duration) : 0;
    const e = eff[key] ?? { sum: 0, count: 0 };
    e.sum += rate; e.count += 1;
    eff[key] = e;
  });

  // 黄金时段：按小时构建个人效率曲线，high 档 = 黄金时段。
  // 注意：曲线固定使用 30 天窗口（buildHourlyCurve 内部 LOOKBACK_DAYS=30），
  // 而分钟数按 days 参数过滤——两者窗口不同是有意设计：peak 表达"个人时段
  // 习惯"（长窗口更稳定），days<30 时 minutes 聚焦近期，互不冲突。
  const curve = buildHourlyCurve(
    sessions.map((s) => ({ duration: s.duration, completed: !s.interrupted, date: new Date(s.completedAt).toISOString() }) as RhythmSession),
  );

  const cells: HeatmapCell[] = [];
  for (let dow = 0; dow < 7; dow++)
    for (let h = 0; h < 24; h++) {
      const e = eff[`${dow}-${h}`];
      cells.push({
        dayOfWeek: dow, hour: h, value: m[`${dow}-${h}`] ?? 0,
        efficiency: e && e.count > 0 ? Math.round((e.sum / e.count) * 100) / 100 : undefined,
        peak: getEnergyLevel(curve, h) === 'high',
      });
    }
  return cells;
}

/** 每日学习时长趋势（含 7 天滑动均值 label）
 * 数据源：番茄钟 sessions（实际分钟）+ 可选折算（笔记/复习/费曼）
 */
export function computeTrend(
  sessions: PomodoroSession[], days = 30,
  extras?: { notes?: Note[]; reviews?: FlashcardReview[]; feynmanNotes?: FeynmanNote[] },
): TrendPoint[] {
  const cutoff = Date.now() - days * DAY_MS;
  const dm: Record<string, number> = {};
  sessions.forEach((s) => {
    const d = new Date(s.completedAt);
    if (d.getTime() < cutoff) return;
    const k = toISO(d); dm[k] = (dm[k] ?? 0) + Math.round(s.actualDuration / 60);
  });

  // 非番茄钟学习折算（全部按 (id, 日期) 去重：自动保存/重复复习会频繁更新）
  const seenNotes = new Set<string>();
  extras?.notes?.forEach((n) => {
    const d = new Date(n.updatedAt);
    if (d.getTime() < cutoff) return;
    const k = toISO(d);
    const key = `${n.id}-${k}`;
    if (seenNotes.has(key)) return;
    seenNotes.add(key);
    dm[k] = (dm[k] ?? 0) + NOTE_EDIT_MINUTES;
  });
  const seenReviews = new Set<string>();
  extras?.reviews?.forEach((r) => {
    const d = new Date(r.reviewedAt);
    if (d.getTime() < cutoff) return;
    const k = toISO(d);
    const key = `${r.cardId}-${k}`;
    if (seenReviews.has(key)) return;
    seenReviews.add(key);
    dm[k] = (dm[k] ?? 0) + REVIEW_MINUTES;
  });
  const seenFeynman = new Set<string>();
  extras?.feynmanNotes?.forEach((f) => {
    const d = new Date(f.updatedAt);
    if (d.getTime() < cutoff) return;
    const k = toISO(d);
    const key = `${f.id}-${k}`;
    if (seenFeynman.has(key)) return;
    seenFeynman.add(key);
    dm[k] = (dm[k] ?? 0) + FEYNMAN_MINUTES;
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
    trend: computeTrend(data.sessions, days, {
      notes: data.notes, reviews: data.reviews, feynmanNotes: data.feynmanNotes,
    }),
    recommendations: computeRecommendations(heatmap),
    period: { start: toISO(new Date(Date.now() - days * DAY_MS)), end: toISO(new Date()) },
    goals: computeGoalProgress(data.sessions, data.notes, data.reviews),
    weekly: computeWeeklySummary(data),
    flow: computeFlowChannel(data.sessions),
    drill: computeDrillData(data, days),
  };
}

/**
 * 心流通道分析（P32）：挑战（计划时长档）× 技能（完成率档）3×3 矩阵。
 * 完成率高 → 技能充足；计划时长长 → 挑战高。心流区 = 挑战与技能匹配的
 * 桶（中中/中高/高中/高高）。纯本地计算，零 AI 依赖。
 */
export function computeFlowChannel(sessions: PomodoroSession[], days = 30): FlowChannelData {
  const rs = recent(sessions, (s) => new Date(s.completedAt), days);
  const counts = new Map<string, number>();

  const challengeOf = (minutes: number): FlowCell['challenge'] =>
    minutes <= 20 ? 'low' : minutes <= 30 ? 'medium' : 'high';
  const skillOf = (rate: number): FlowCell['skill'] =>
    rate < 0.7 ? 'low' : rate <= 0.95 ? 'medium' : 'high';

  for (const s of rs) {
    if (s.duration <= 0) continue;
    const rate = Math.min(1.2, s.actualDuration / s.duration);
    const key = `${challengeOf(s.duration)}-${skillOf(rate)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const levels = ['low', 'medium', 'high'] as const;
  const cells: FlowCell[] = [];
  for (const c of levels)
    for (const sk of levels) {
      cells.push({ challenge: c, skill: sk, count: counts.get(`${c}-${sk}`) ?? 0 });
    }

  // 洞察：心流桶占比 + 主导桶
  const total = rs.length;
  let insight = '完成更多深潜后，这里会浮现你的心流通道';
  if (total >= 5) {
    const flowKeys = new Set(['medium-medium', 'medium-high', 'high-medium', 'high-high']);
    const flowCount = cells.filter((c) => flowKeys.has(`${c.challenge}-${c.skill}`)).reduce((a, c) => a + c.count, 0);
    const flowRatio = flowCount / total;
    const dominant = [...cells].sort((a, b) => b.count - a.count)[0];
    const isFlow = flowKeys.has(`${dominant.challenge}-${dominant.skill}`);

    if (isFlow && flowRatio >= 0.4) {
      const minutes = dominant.challenge === 'low' ? '20' : dominant.challenge === 'medium' ? '25-30' : '35+';
      insight = `你常在挑战与能力匹配的节奏中学习（${Math.round(flowRatio * 100)}% 的深潜）——${minutes} 分钟区间很适合你`;
    } else if (dominant.skill === 'low') {
      insight = '完成率偏低可能是计划定得太满——试试缩短深潜时长，先找回完成的节奏';
    } else if (dominant.challenge === 'low' && dominant.skill === 'high') {
      insight = '你擅长完成短深潜——可以逐步把计划时长加到 30 分钟，让挑战跟上能力';
    } else {
      insight = '你的挑战与能力正在磨合——保持当前时长区间，心流会越来越稳定';
    }
  }

  return { cells, insight };
}

// ============================================================
// 本周回顾（W1：周报摘要——复习及时率 / 掌握度变化 / 对比上周）
// ============================================================

/** 复习及时率：在应到期间隔 [0.9×, 1.5×] 内完成复习的比例。
 * 相邻两次复习的实际间隔 vs 上次复习后的计划间隔（intervalAfter 天）。
 * 仅统计近期（窗口内）发生的第二次及以上复习，样本 <3 时返回 null。
 */
export function computeReviewTimeliness(reviews: FlashcardReview[], sinceMs: number): number | null {
  // 按卡片分组并按时间排序
  const byCard = new Map<string, FlashcardReview[]>();
  for (const r of reviews) {
    const list = byCard.get(r.cardId) ?? [];
    list.push(r);
    byCard.set(r.cardId, list);
  }
  let timely = 0;
  let total = 0;
  for (const list of byCard.values()) {
    list.sort((a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime());
    for (let i = 1; i < list.length; i++) {
      const curr = list[i];
      if (new Date(curr.reviewedAt).getTime() < sinceMs) continue; // 只统计窗口内的复习
      const prev = list[i - 1];
      const planned = prev.intervalAfter; // 上次复习后的计划间隔（天）
      if (!planned || planned <= 0) continue;
      const actual = (new Date(curr.reviewedAt).getTime() - new Date(prev.reviewedAt).getTime()) / DAY_MS;
      if (actual >= planned * 0.9 && actual <= planned * 1.5) timely += 1;
      total += 1;
    }
  }
  return total >= 3 ? Math.round((timely / total) * 100) : null;
}

/** 掌握度变化：本周 vs 上周各卡复习后的平均计划间隔（天）差值。
 * 间隔越长代表记忆强度越强（FSRS/SM-2 语义一致）；样本 <3 返回 null。
 */
export function computeMasteryDelta(reviews: FlashcardReview[]): number | null {
  const now = Date.now();
  const weekMs = 7 * DAY_MS;
  const thisWeek: number[] = [];
  const prevWeek: number[] = [];
  for (const r of reviews) {
    const t = new Date(r.reviewedAt).getTime();
    if (t >= now - weekMs) thisWeek.push(r.intervalAfter);
    else if (t >= now - 2 * weekMs) prevWeek.push(r.intervalAfter);
  }
  if (thisWeek.length < 3 || prevWeek.length < 3) return null;
  const avg = (arr: number[]) => arr.reduce((a, v) => a + v, 0) / arr.length;
  return Math.round((avg(thisWeek) - avg(prevWeek)) * 10) / 10;
}

/** 计算本周回顾摘要（固定自然周窗口：最近 7 天 vs 前 7 天） */
export function computeWeeklySummary(data: AggregateInput): WeeklySummary {
  const now = Date.now();
  const weekMs = 7 * DAY_MS;
  const thisWeekStart = now - weekMs;
  const prevWeekStart = now - 2 * weekMs;

  const sumMinutes = (list: PomodoroSession[], from: number, to: number) =>
    list.reduce((a, s) => {
      const t = new Date(s.completedAt).getTime();
      return t >= from && t < to ? a + Math.round(s.actualDuration / 60) : a;
    }, 0);

  const totalMinutes = sumMinutes(data.sessions, thisWeekStart, now);
  const prevTotalMinutes = sumMinutes(data.sessions, prevWeekStart, thisWeekStart);

  const inWindow = (t: number, from: number) => t >= from && t < now;
  const noteCount = data.notes.filter((n) => inWindow(new Date(n.updatedAt).getTime(), thisWeekStart)).length;
  const reviewCount = data.reviews.filter((r) => inWindow(new Date(r.reviewedAt).getTime(), thisWeekStart)).length;
  const feynmanCount = data.feynmanNotes.filter((n) => inWindow(new Date(n.updatedAt).getTime(), thisWeekStart)).length;
  // 1.11 上周费曼次数（费曼趋势对比基线，成长叙事用）
  const prevFeynmanCount = data.feynmanNotes.filter((n) => inWindow(new Date(n.updatedAt).getTime(), prevWeekStart)).length;

  // 番茄完成率：本周非中断会话的实际/计划均值
  const rs = data.sessions.filter((s) => inWindow(new Date(s.completedAt).getTime(), thisWeekStart));
  const focusRate = rs.length === 0
    ? 0
    : Math.round(rs.reduce((a, s) => a + (s.duration > 0 ? s.actualDuration / s.duration : 0), 0) / rs.length * 100);

  return {
    weekStart: toISO(new Date(thisWeekStart)),
    weekEnd: toISO(new Date()),
    totalMinutes,
    prevTotalMinutes,
    noteCount,
    reviewCount,
    feynmanCount,
    prevFeynmanCount,
    focusRate,
    reviewTimeliness: computeReviewTimeliness(data.reviews, thisWeekStart),
    masteryDelta: computeMasteryDelta(data.reviews),
  };
}

// ============================================================
// 掌握度钻取（1.14 D3 增强：L0 总览 → L1 课程 → L2 概念）
// ============================================================

/**
 * 课程集合：番茄钟科目 + 笔记标签（去重合并），空集合时返回空钻取结构。
 */
function collectCourses(rs: PomodoroSession[], rn: Note[]): string[] {
  const courses = new Set<string>();
  rs.forEach((s) => { if (s.subject) courses.add(s.subject); });
  rn.forEach((n) => n.tags.forEach((t) => courses.add(t)));
  return [...courses];
}

/**
 * 计算掌握度钻取数据（1.14）：
 * - L1 课程：每个维度按全局算法同口径计算课程得分（focus=完成率、efficiency=均字数、
 *   persistence=活跃天数、breadth=课程标签数、activity=复习+费曼数）
 * - L2 概念：课程下匹配的笔记（tags 含课程名）+ 费曼概念（concept 含课程名）；
 *   概念掌握度 = 费曼完成状态分级 / 笔记复习间隔归一化
 */
export function computeDrillData(data: AggregateInput, days = 30): MasteryDrillData {
  const rs = recent(data.sessions, (s) => new Date(s.completedAt), days);
  const rn = recent(data.notes, (n) => new Date(n.updatedAt), days);
  const rr = recent(data.reviews, (r) => new Date(r.reviewedAt), days);
  const rf = recent(data.feynmanNotes, (n) => new Date(n.updatedAt), days);
  const courses = collectCourses(rs, rn);
  if (courses.length === 0) return { coursesByDimension: {}, conceptsByCourse: {} };

  const isOfCourse = (tags: string[], course: string) => tags.some((t) => t === course);
  const focusOf = (course: string) => {
    const list = rs.filter((s) => s.subject === course);
    if (list.length === 0) return 0;
    return norm(list.reduce((a, s) => a + (s.duration > 0 ? s.actualDuration / s.duration : 0), 0) / list.length, 1);
  };
  const efficiencyOf = (course: string) => {
    const list = rn.filter((n) => isOfCourse(n.tags, course));
    return norm(list.reduce((a, n) => a + (n.wordCount ?? 0), 0), list.length * 1500);
  };
  const persistenceOf = (course: string) => {
    const daysSet = new Set<string>();
    rs.filter((s) => s.subject === course).forEach((s) => daysSet.add(toISO(new Date(s.completedAt))));
    rn.filter((n) => isOfCourse(n.tags, course)).forEach((n) => daysSet.add(toISO(new Date(n.updatedAt))));
    return norm(daysSet.size, days);
  };
  const breadthOf = (course: string) =>
    norm(new Set(rn.filter((n) => isOfCourse(n.tags, course)).flatMap((n) => n.tags)).size, 10);
  const activityOf = (course: string) => {
    const feynmanIds = new Set(rf.filter((n) => n.concept.includes(course)).map((n) => n.id));
    const reviewCount = rr.filter((r) => feynmanIds.has(r.cardId)).length;
    const noteIds = new Set(rn.filter((n) => isOfCourse(n.tags, course)).map((n) => n.id));
    const noteReviews = rr.filter((r) => {
      const card = data.flashcards.find((c) => c.id === r.cardId);
      return card?.sourceNoteId ? noteIds.has(card.sourceNoteId) : false;
    }).length;
    return norm(reviewCount + noteReviews + rf.filter((n) => n.concept.includes(course)).length, days * 3);
  };

  const dimensions = ['focus', 'efficiency', 'persistence', 'breadth', 'activity'] as const;
  const labelOf: Record<(typeof dimensions)[number], string> = {
    focus: '专注度', efficiency: '效率', persistence: '持续性', breadth: '广度', activity: '活跃度',
  };
  const scoreOf: Record<(typeof dimensions)[number], (c: string) => number> = {
    focus: focusOf, efficiency: efficiencyOf, persistence: persistenceOf, breadth: breadthOf, activity: activityOf,
  };

  const coursesByDimension: MasteryDrillData['coursesByDimension'] = {};
  for (const dim of dimensions) {
    const entries = courses
      .map((course) => ({ dimension: course, value: scoreOf[dim](course), label: course }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
    if (entries.length > 0) coursesByDimension[labelOf[dim]] = entries;
  }

  // L2 概念：课程匹配的笔记（tags）+ 费曼概念（concept 含课程名）
  // 概念掌握度：费曼 completed≥70 / in_progress 40 / not_started 10；
  // 笔记按关联卡片复习间隔归一化（无关联时按字数，1500 字=100）
  const conceptsByCourse: MasteryDrillData['conceptsByCourse'] = {};
  for (const course of courses) {
    const feynmanConcepts = rf
      .filter((n) => n.concept.includes(course))
      .map<RadarDimension>((n) => ({
        dimension: n.concept,
        value: n.status === 'completed' ? 70 + (n.selfRating ?? 3) * 6 : n.status === 'in_progress' ? 40 : 10,
        label: n.concept,
      }));
    const noteConcepts = rn
      .filter((n) => isOfCourse(n.tags, course))
      .map<RadarDimension>((n) => {
        const card = data.flashcards.find((c) => c.sourceNoteId === n.id);
        if (card) {
          return { dimension: n.title, value: Math.min(100, 40 + card.interval * 2), label: n.title };
        }
        return { dimension: n.title, value: Math.min(100, Math.round((n.wordCount ?? 0) / 15)), label: n.title };
      });
    const concepts = [...feynmanConcepts, ...noteConcepts]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    if (concepts.length > 0) conceptsByCourse[course] = concepts;
  }

  return { coursesByDimension, conceptsByCourse };
}
