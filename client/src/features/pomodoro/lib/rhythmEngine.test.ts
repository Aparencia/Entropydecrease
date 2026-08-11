/**
 * Rhythm Engine Unit Tests
 * T1 超昼夜节律自适应
 */
import { describe, it, expect } from 'vitest';
import {
  buildHourlyCurve,
  getEnergyLevel,
  recommendRhythmDuration,
  type RhythmSession,
} from './rhythmEngine';

const NOW = new Date(2026, 7, 3, 9, 0, 0); // 2026-08-03 09:00 本地时间

/** 构造 daysAgo 天前 hour 点的一条会话 */
function sessionAt(daysAgo: number, hour: number, completed: boolean): RhythmSession {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { duration: 25, completed, date: d.toISOString() };
}

describe('buildHourlyCurve', () => {
  it('should aggregate completion rate per hour bucket', () => {
    const sessions = [
      sessionAt(1, 9, true),
      sessionAt(2, 9, true),
      sessionAt(1, 14, false),
      sessionAt(2, 14, false),
    ];
    const curve = buildHourlyCurve(sessions, NOW);
    expect(curve).toHaveLength(24);
    expect(curve[9].score).toBeCloseTo(1, 5);
    expect(curve[9].sampleCount).toBe(2);
    expect(curve[14].score).toBeCloseTo(0, 5);
    expect(curve[20].sampleCount).toBe(0);
  });

  it('should ignore sessions older than 30 days and invalid dates', () => {
    const sessions = [
      sessionAt(40, 9, true),
      { duration: 25, completed: true, date: 'not-a-date' },
      sessionAt(1, 9, true),
    ];
    const curve = buildHourlyCurve(sessions, NOW);
    expect(curve[9].sampleCount).toBe(1);
  });
});

describe('getEnergyLevel', () => {
  it('should classify high/low/medium by deviation from mean', () => {
    const sessions: RhythmSession[] = [
      // 9 点全完成，14 点全失败，19 点半数 → 形成明显峰谷
      sessionAt(1, 9, true), sessionAt(2, 9, true),
      sessionAt(1, 14, false), sessionAt(2, 14, false),
      sessionAt(1, 19, true), sessionAt(2, 19, false),
    ];
    const curve = buildHourlyCurve(sessions, NOW);
    expect(getEnergyLevel(curve, 9)).toBe('high');
    expect(getEnergyLevel(curve, 14)).toBe('low');
  });

  it('should return medium when data insufficient', () => {
    const curve = buildHourlyCurve([sessionAt(1, 9, true)], NOW);
    expect(getEnergyLevel(curve, 9)).toBe('medium');
  });
});

describe('recommendRhythmDuration', () => {
  it('should fallback to 25 minutes when sessions < 10', () => {
    const sessions = Array.from({ length: 9 }, () => sessionAt(1, 9, true));
    const result = recommendRhythmDuration(sessions, NOW);
    expect(result.minutes).toBe(25);
    expect(result.confidence).toBe('low');
  });

  it('should recommend 35 minutes at peak hours', () => {
    const sessions: RhythmSession[] = [
      ...Array.from({ length: 6 }, (_, i) => sessionAt(i + 1, 9, true)),
      ...Array.from({ length: 6 }, (_, i) => sessionAt(i + 1, 14, false)),
      sessionAt(1, 19, true), sessionAt(2, 19, false), // 第三个有效桶（平稳）
    ];
    const result = recommendRhythmDuration(sessions, NOW); // NOW 是 9 点
    expect(result.minutes).toBe(35);
    expect(result.level).toBe('high');
  });

  it('should recommend 18 minutes at trough hours', () => {
    const sessions: RhythmSession[] = [
      ...Array.from({ length: 6 }, (_, i) => sessionAt(i + 1, 9, true)),
      ...Array.from({ length: 6 }, (_, i) => sessionAt(i + 1, 14, false)),
      sessionAt(1, 19, true), sessionAt(2, 19, false), // 第三个有效桶（平稳）
    ];
    const trough = new Date(NOW);
    trough.setHours(14, 0, 0, 0);
    const result = recommendRhythmDuration(sessions, trough);
    expect(result.minutes).toBe(18);
    expect(result.level).toBe('low');
  });
});

