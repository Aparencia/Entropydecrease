/**
 * 防断裂 Streak 引擎单元测试
 * Unit tests for the anti-break streak engine
 *
 * @ai-context: 覆盖 updateStreak 的首次/同日/连续/休息日桥接/断裂保留 50%
 * 各分支、isRestDay、isBreakWarning（不足 3 天/休息日/今日已活跃/20:00 前）
 * 与 getWeekView 周视图。纯函数，日期全部本地时区构造，确定性可复现。
 * @ai-context: Covers updateStreak branches (first/same-day/consecutive/
 * rest-day bridging/break with 50% retention), isRestDay, isBreakWarning
 * and getWeekView. Pure functions with locally-constructed dates.
 */
import { describe, it, expect } from 'vitest';
import {
  updateStreak,
  isRestDay,
  isBreakWarning,
  getWeekView,
  RETAINED_PERCENT,
} from './streakEngine';
import type { StreakState } from '../types';

const baseState = (overrides: Partial<StreakState>): StreakState => ({
  id: 'streak-main',
  currentStreak: 1,
  longestStreak: 1,
  lastActiveDate: '2026-01-16',
  restDayPreference: 0,
  retainedPercent: RETAINED_PERCENT,
  ...overrides,
});

describe('isRestDay', () => {
  it('should match the configured weekday preference', () => {
    const sunday = new Date(2026, 0, 18, 12); // 2026-01-18 是周日
    expect(isRestDay(sunday, 0)).toBe(true);
    expect(isRestDay(sunday, 6)).toBe(false);
  });
});

describe('updateStreak', () => {
  it('should create initial state on first record', () => {
    // Act
    const state = updateStreak(null, new Date(2026, 0, 15, 12));
    // Assert
    expect(state).toEqual({
      id: 'streak-main',
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: '2026-01-15',
      restDayPreference: 0,
      retainedPercent: RETAINED_PERCENT,
    });
  });

  it('should keep state unchanged for same-day repeat', () => {
    // Arrange
    const state = baseState({ currentStreak: 3 });
    // Act
    const result = updateStreak(state, new Date(2026, 0, 16, 20));
    // Assert
    expect(result).toBe(state);
  });

  it('should increment on the next consecutive day', () => {
    // Arrange
    const state = baseState({ lastActiveDate: '2026-01-16', currentStreak: 2 });
    // Act
    const result = updateStreak(state, new Date(2026, 0, 17, 12));
    // Assert
    expect(result.currentStreak).toBe(3);
    expect(result.lastActiveDate).toBe('2026-01-17');
    expect(result.longestStreak).toBe(3);
  });

  it('should bridge a rest day without breaking the streak', () => {
    // Arrange：周六休息日偏好，周五 → 周日仍算连续
    const state = baseState({
      lastActiveDate: '2026-01-16',
      restDayPreference: 6,
      currentStreak: 4,
    });
    // Act
    const result = updateStreak(state, new Date(2026, 0, 18, 12));
    // Assert：gap=2 但含 1 个休息日 → 有效间隔 1
    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
  });

  it('should retain 50% after a real break', () => {
    // Arrange：最后活跃 2026-01-10，今天 2026-01-15，无休息日（偏好周五）
    const state = baseState({
      lastActiveDate: '2026-01-10',
      currentStreak: 10,
      longestStreak: 12,
      restDayPreference: 5,
    });
    // Act
    const result = updateStreak(state, new Date(2026, 0, 15, 12));
    // Assert：10 → 保留 50% = 5；longestStreak 不回退
    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(12);
    expect(result.lastActiveDate).toBe('2026-01-15');
  });

  it('should never drop below 1 after a break', () => {
    // Arrange
    const state = baseState({ lastActiveDate: '2026-01-10', currentStreak: 1, restDayPreference: 5 });
    // Act
    const result = updateStreak(state, new Date(2026, 0, 15, 12));
    // Assert
    expect(result.currentStreak).toBe(1);
  });
});

describe('isBreakWarning', () => {
  it('should return false for null state or short streaks', () => {
    expect(isBreakWarning(null, new Date(2026, 0, 15, 21))).toBe(false);
    expect(isBreakWarning(baseState({ currentStreak: 2 }), new Date(2026, 0, 15, 21))).toBe(false);
  });

  it('should return false on a rest day', () => {
    const state = baseState({ currentStreak: 5, restDayPreference: 0, lastActiveDate: '2026-01-17' });
    expect(isBreakWarning(state, new Date(2026, 0, 18, 21))).toBe(false); // 周日
  });

  it('should return false when already active today', () => {
    const state = baseState({ currentStreak: 5, lastActiveDate: '2026-01-15' });
    expect(isBreakWarning(state, new Date(2026, 0, 15, 21))).toBe(false);
  });

  it('should return false before 20:00', () => {
    const state = baseState({ currentStreak: 5, lastActiveDate: '2026-01-14' });
    expect(isBreakWarning(state, new Date(2026, 0, 15, 10))).toBe(false);
  });

  it('should warn after 20:00 with an unbroken day', () => {
    const state = baseState({ currentStreak: 5, lastActiveDate: '2026-01-14' });
    expect(isBreakWarning(state, new Date(2026, 0, 15, 21))).toBe(true);
  });
});

describe('getWeekView', () => {
  it('should build the 7-day window starting on Sunday', () => {
    // Arrange：2026-01-15 是周四 → 本周从 01-11（周日）开始
    const state = baseState({ lastActiveDate: '2026-01-15', restDayPreference: 0 });
    // Act
    const week = getWeekView(state, new Date(2026, 0, 15, 12));
    // Assert
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe('2026-01-11');
    expect(week[6].date).toBe('2026-01-17');
    expect(week[4]).toMatchObject({ date: '2026-01-15', isToday: true, isActive: true });
    expect(week[0]).toMatchObject({ date: '2026-01-11', isRestDay: true, isToday: false });
  });

  it('should tolerate null state', () => {
    const week = getWeekView(null, new Date(2026, 0, 15, 12));
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.isActive === false)).toBe(true);
  });
});
