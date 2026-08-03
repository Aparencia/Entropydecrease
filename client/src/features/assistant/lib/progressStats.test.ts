/**
 * progressStats 单元测试
 *
 * @ai-context: 覆盖 formatStatsText 纯函数的拼接规则（全零空串、
 * 非零项按序拼接）与 collectWeeklyStats 的窗口过滤/降级行为。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatStatsText, collectWeeklyStats, type WeeklyStats } from './progressStats';

const ZERO: WeeklyStats = {
  current: { pomodoroCount: 0, focusMinutes: 0, reviewCount: 0, feynmanCount: 0 },
  previous: { pomodoroCount: 0, focusMinutes: 0, reviewCount: 0, feynmanCount: 0 },
};

describe('formatStatsText', () => {
  it('全零统计返回空串（调用方用通用文案兜底）', () => {
    expect(formatStatsText(ZERO)).toBe('');
  });

  it('非零项按"番茄/闪卡/费曼"顺序拼接', () => {
    const stats: WeeklyStats = {
      ...ZERO,
      current: { pomodoroCount: 5, focusMinutes: 125, reviewCount: 42, feynmanCount: 2 },
    };
    expect(formatStatsText(stats)).toBe('完成了 5 个专注时段（共 125 分钟），复习了 42 张闪卡，完成了 2 次费曼讲解');
  });

  it('仅输出非零项', () => {
    const stats: WeeklyStats = { ...ZERO, current: { ...ZERO.current, reviewCount: 3 } };
    expect(formatStatsText(stats)).toBe('复习了 3 张闪卡');
  });
});

describe('collectWeeklyStats', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('非 Electron 环境返回全零', async () => {
    vi.stubGlobal('window', { ...window, electronAPI: undefined });
    const stats = await collectWeeklyStats();
    expect(stats.current).toEqual(ZERO.current);
  });

  it('按时间窗口过滤并汇总三张表', async () => {
    const now = new Date('2026-08-03T12:00:00Z');
    const dayMs = 24 * 60 * 60 * 1000;
    const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * dayMs).toISOString();
    const mockDb = {
      query: vi.fn(async (table: string) => {
        if (table === 'pomodoro_sessions') {
          return [
            { completed_at: iso(1), actual_duration: 25 },   // 本周
            { completed_at: iso(10), actual_duration: 30 },  // 上周
            { completed_at: iso(20), actual_duration: 45 },  // 窗口外
          ];
        }
        if (table === 'flashcard_reviews') {
          return [{ reviewed_at: iso(2) }, { reviewed_at: iso(3) }, { reviewed_at: iso(9) }];
        }
        return [
          { completed_at: iso(1) },        // 本周完成
          { completed_at: null },          // 未完成不计
          { completed_at: iso(12) },       // 上周完成
        ];
      }),
    };
    vi.stubGlobal('window', { ...window, electronAPI: { db: mockDb } });

    const stats = await collectWeeklyStats(now);
    expect(stats.current).toEqual({ pomodoroCount: 1, focusMinutes: 25, reviewCount: 2, feynmanCount: 1 });
    expect(stats.previous).toEqual({ pomodoroCount: 1, focusMinutes: 30, reviewCount: 1, feynmanCount: 1 });
  });

  it('IPC 失败静默降级为全零', async () => {
    const mockDb = { query: vi.fn(async () => { throw new Error('ipc down'); }) };
    vi.stubGlobal('window', { ...window, electronAPI: { db: mockDb } });
    const stats = await collectWeeklyStats();
    expect(stats.current).toEqual(ZERO.current);
  });
});
