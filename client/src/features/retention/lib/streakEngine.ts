/**
 * 防断裂 Streak 引擎
 * Anti-break streak engine
 *
 * @ai-context: 连续学习天数计算，含洋流休息日（不算断裂）、断裂后保留 50%。
 * 4.4 节约束：无惩罚性文案，仅中性视觉变化。里程碑复用成就系统。
 * @ai-context: Consecutive learning days calculation with ocean current rest
 * days (don't break streak), 50% retention after break. No punitive copy.
 */
import type { StreakState } from '../types';

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 将本地日期字符串（YYYY-MM-DD）解析为本地午夜 Date
 * FRONT2-M3: new Date("YYYY-MM-DD") 会按 UTC 午夜解析，UTC+8 时
 * lastDate 实际落在前一天的 08:00，与本地日期的 today 间隔计算差一天
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 断裂后保留百分比 / Retained percent after break */
export const RETAINED_PERCENT = 50;

/**
 * 判断某天是否为洋流休息日
 * Check if a date is the ocean current rest day
 */
export function isRestDay(date: Date, restDayPreference: number): boolean {
  return date.getDay() === restDayPreference;
}

/**
 * 计算两个日期之间的天数差（不含起始日）
 * Calculate day difference between two dates (exclusive of start)
 */
function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * 更新 streak 状态（每次学习行为后调用）
 * Update streak state (called after each learning action)
 */
export function updateStreak(
  state: StreakState | null,
  today: Date,
): StreakState {
  const todayStr = toISO(today);

  // 首次记录 / First record
  if (!state) {
    return {
      id: 'streak-main',
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: todayStr,
      restDayPreference: 0, // 默认周日 / Default Sunday
      retainedPercent: RETAINED_PERCENT,
    };
  }

  // 同一天重复触发：不变 / Same day repeat: no change
  if (state.lastActiveDate === todayStr) {
    return state;
  }

  const lastDate = parseLocalDate(state.lastActiveDate);
  const gap = daysBetween(lastDate, today);
  const restDayPref = state.restDayPreference;

  // 计算间隔中有多少天是休息日
  // Count rest days in the gap
  let restDaysInGap = 0;
  for (let i = 1; i < gap; i++) {
    const d = new Date(lastDate.getTime() + i * 86_400_000);
    if (isRestDay(d, restDayPref)) restDaysInGap++;
  }

  // 有效间隔 = 总间隔 - 休息日
  // Effective gap = total gap - rest days
  const effectiveGap = gap - restDaysInGap;

  let newStreak: number;
  if (effectiveGap <= 1) {
    // 连续（或仅隔休息日）：+1 / Consecutive (or only rest day gap): +1
    newStreak = state.currentStreak + 1;
  } else {
    // 断裂：保留 50% / Break: retain 50%
    newStreak = Math.max(1, Math.round(state.currentStreak * (RETAINED_PERCENT / 100)));
  }

  return {
    ...state,
    currentStreak: newStreak,
    longestStreak: Math.max(state.longestStreak, newStreak),
    lastActiveDate: todayStr,
  };
}

/**
 * 检查 streak 是否即将断裂（当天 20:00 后仍未学习）
 * Check if streak is about to break (after 20:00 with no activity today)
 */
export function isBreakWarning(state: StreakState | null, now: Date): boolean {
  if (!state) return false;
  if (state.currentStreak < 3) return false; // 太短不提醒 / Too short to warn
  if (isRestDay(now, state.restDayPreference)) return false; // 休息日不提醒

  const todayStr = toISO(now);
  if (state.lastActiveDate === todayStr) return false; // 今天已活跃

  return now.getHours() >= 20; // 20:00 后 / After 20:00
}

/**
 * 获取本周日历视图数据
 * Get weekly calendar view data
 */
export function getWeekView(state: StreakState | null, today: Date): Array<{
  date: string;
  isActive: boolean;
  isRestDay: boolean;
  isToday: boolean;
}> {
  const restDayPref = state?.restDayPreference ?? 0;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek.getTime() + i * 86_400_000);
    const dateStr = toISO(d);
    return {
      date: dateStr,
      isActive: state?.lastActiveDate === dateStr,
      isRestDay: isRestDay(d, restDayPref),
      isToday: dateStr === toISO(today),
    };
  });
}
