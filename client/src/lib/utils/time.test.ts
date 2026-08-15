/**
 * 时间格式化工具单元测试
 * Unit tests for time formatting utilities
 *
 * @ai-context: 全站时间格式唯一权威实现（D12 收敛）。全部函数为纯函数，
 * 相对时间类函数支持注入 now 参照时间，expiryBadge 使用 fake timers
 * 固定基准时钟——测试均不依赖真实系统时间。
 * @ai-context: Single source of truth for time formatting. All functions
 * are pure; relative-time functions accept an injectable `now` and
 * expiryBadge is tested under fake timers — no reliance on wall clock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate,
  formatTime,
  formatTimeWithSeconds,
  formatDuration,
  formatMinutes,
  formatRelativeTime,
  formatTimeAgo,
  formatSessionElapsed,
  expiryBadge,
} from './time';

// 本地时区构造，保证 getFullYear/getHours 等确定性
const d = (y: number, mo: number, day: number, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, day, h, mi, s);

describe('formatDate / formatTime / formatTimeWithSeconds', () => {
  it('should format date as YYYY-MM-DD in local timezone', () => {
    expect(formatDate(d(2026, 5, 7))).toBe('2026-05-07');
    expect(formatDate(d(2026, 12, 1))).toBe('2026-12-01');
    expect(formatDate(d(2026, 1, 3))).toBe('2026-01-03');
  });

  it('should accept Date, string and number inputs', () => {
    expect(formatDate('2026-05-07T00:00:00')).toBe('2026-05-07');
    expect(formatDate(new Date('2026-05-07T00:00:00').getTime())).toBe('2026-05-07');
  });

  it('should format time as HH:mm with zero padding', () => {
    expect(formatTime(d(2026, 5, 7, 9, 5))).toBe('09:05');
    expect(formatTime(d(2026, 5, 7, 23, 59))).toBe('23:59');
  });

  it('should format time with seconds as HH:mm:ss', () => {
    expect(formatTimeWithSeconds(d(2026, 5, 7, 9, 5, 3))).toBe('09:05:03');
  });
});

describe('formatDuration', () => {
  it('should format sub-minute durations as Xs', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
  });

  it('should format minute-level durations as Xm Ys', () => {
    expect(formatDuration(60)).toBe('1m 0s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3599)).toBe('59m 59s');
  });

  it('should format hour-level durations as Xh Ym', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3661)).toBe('1h 1m');
    expect(formatDuration(7260)).toBe('2h 1m');
  });

  it('should clamp negative and round fractional input', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(59.6)).toBe('1m 0s');
  });
});

describe('formatMinutes', () => {
  it('should append the 分钟 unit and clamp negatives', () => {
    expect(formatMinutes(45)).toBe('45 分钟');
    expect(formatMinutes(0)).toBe('0 分钟');
    expect(formatMinutes(-3)).toBe('0 分钟');
    expect(formatMinutes(59.4)).toBe('59 分钟');
  });
});

describe('formatRelativeTime', () => {
  const now = d(2026, 5, 15, 12, 0).getTime();

  it('should return 刚刚 for less than a minute ago', () => {
    expect(formatRelativeTime(now - 30 * 1000, now)).toBe('刚刚');
    expect(formatRelativeTime(now, now)).toBe('刚刚');
  });

  it('should return N 分钟前 for minutes ago', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, now)).toBe('5 分钟前');
    expect(formatRelativeTime(now - 59 * 60 * 1000, now)).toBe('59 分钟前');
  });

  it('should return N 小时前 for hours ago', () => {
    expect(formatRelativeTime(now - 3 * 3600 * 1000, now)).toBe('3 小时前');
    expect(formatRelativeTime(now - 23 * 3600 * 1000, now)).toBe('23 小时前');
  });

  it('should return N 天前 for days within a week', () => {
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe('3 天前');
    expect(formatRelativeTime(now - 6 * 86_400_000, now)).toBe('6 天前');
  });

  it('should fall back to date beyond 7 days and for future dates', () => {
    expect(formatRelativeTime(now - 10 * 86_400_000, now)).toBe('2026-05-05');
    expect(formatRelativeTime(now + 60 * 1000, now)).toBe('2026-05-15');
  });
});

describe('formatTimeAgo', () => {
  const now = d(2026, 5, 15, 12, 0).getTime();

  it('should delegate sub-day values to formatRelativeTime', () => {
    expect(formatTimeAgo(now - 30 * 60 * 1000, now)).toBe('30 分钟前');
    expect(formatTimeAgo(now - 3 * 3600 * 1000, now)).toBe('3 小时前');
  });

  it('should return N 天前 for days under 30', () => {
    expect(formatTimeAgo(now - 5 * 86_400_000, now)).toBe('5 天前');
    expect(formatTimeAgo(now - 29 * 86_400_000, now)).toBe('29 天前');
  });

  it('should fall back to date beyond 30 days and for future dates', () => {
    expect(formatTimeAgo(now - 40 * 86_400_000, now)).toBe('2026-04-05');
    expect(formatTimeAgo(now + 3600 * 1000, now)).toBe('2026-05-15');
  });
});

describe('formatSessionElapsed', () => {
  it('should format elapsed milliseconds as MM:SS (minutes may exceed 59)', () => {
    expect(formatSessionElapsed(90_000, 30_000)).toBe('01:00');
    expect(formatSessionElapsed(3_723_000, 0)).toBe('62:03');
  });

  it('should clamp negative elapsed to 00:00', () => {
    expect(formatSessionElapsed(10_000, 30_000)).toBe('00:00');
  });
});

describe('expiryBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(d(2026, 5, 15, 12, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null for undefined expiresAt', () => {
    expect(expiryBadge(undefined)).toBeNull();
  });

  it('should mark expired when days <= 0', () => {
    const badge = expiryBadge(d(2026, 5, 15, 12, 0));
    expect(badge).toEqual({ days: 0, label: '已过期', color: 'text-semantic-error' });

    const past = expiryBadge(d(2026, 5, 10));
    expect(past?.days).toBeLessThan(0);
    expect(past?.label).toBe('已过期');
  });

  it('should warn within 7 days', () => {
    const badge = expiryBadge(d(2026, 5, 18, 12, 0));
    expect(badge).toEqual({ days: 3, label: '3 天后过期', color: 'text-semantic-warning' });
  });

  it('should show tertiary color within 30 days', () => {
    const badge = expiryBadge(d(2026, 6, 5, 12, 0));
    expect(badge).toEqual({ days: 21, label: '21 天后过期', color: 'text-text-tertiary' });
  });

  it('should return null beyond 30 days', () => {
    expect(expiryBadge(d(2026, 7, 1))).toBeNull();
  });
});
