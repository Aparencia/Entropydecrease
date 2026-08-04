/**
 * Dashboard aggregator unit tests
 * B1 (D5): heatmap efficiency dimension + golden-hour (peak) annotation
 * @ai-context 学习分析聚合纯函数测试：覆盖热力图效率维度与黄金时段标注
 */
import { describe, it, expect } from 'vitest';
import { computeHeatmap, computeTrend, computeRecommendations, aggregateAnalytics, type AggregateInput } from './aggregator';
import type { PomodoroSession } from '@/types/pomodoro';

const EMPTY: AggregateInput = { sessions: [], notes: [], flashcards: [], feynmanNotes: [], reviews: [] };

/** 构造一条番茄会话：daysAgo 天前 hour 点，duration/actualDuration 为秒 */
function sessionAt(daysAgo: number, hour: number, opts: Partial<Pick<PomodoroSession, 'duration' | 'actualDuration' | 'interrupted'>> = {}): PomodoroSession {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return {
    id: `s-${daysAgo}-${hour}`,
    mode: 'self_study',
    duration: 25 * 60,
    actualDuration: 25 * 60,
    interrupted: false,
    completedAt: d,
    ...opts,
  };
}

describe('computeHeatmap (B1/D5)', () => {
  it('should return 7×24 cells with correct day/hour mapping', () => {
    const cells = computeHeatmap([]);
    expect(cells).toHaveLength(168);
    expect(cells[0]).toMatchObject({ dayOfWeek: 0, hour: 0 });
    expect(cells[23]).toMatchObject({ dayOfWeek: 0, hour: 23 });
    expect(cells[24]).toMatchObject({ dayOfWeek: 1, hour: 0 });
    expect(cells[167]).toMatchObject({ dayOfWeek: 6, hour: 23 });
  });

  it('should aggregate minutes per (day, hour) cell', () => {
    // 今天 9 点 60s+90s → 1+2=3 分钟；昨天 10 点 120s → 2 分钟
    const cells = computeHeatmap([
      sessionAt(0, 9, { actualDuration: 60 }),
      sessionAt(0, 9, { actualDuration: 90 }),
      sessionAt(1, 10, { actualDuration: 120 }),
    ]);
    const today = new Date();
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const yesterdayDow = new Date(Date.now() - 86_400_000).getDay() === 0 ? 6 : new Date(Date.now() - 86_400_000).getDay() - 1;
    const cell9 = cells.find((c) => c.dayOfWeek === dow && c.hour === 9);
    const cell10 = cells.find((c) => c.dayOfWeek === yesterdayDow && c.hour === 10);
    expect(cell9?.value).toBe(3);
    expect(cell10?.value).toBe(2);
  });

  it('should compute efficiency as mean completion rate with 1.2 cap', () => {
    // 同一格两条：完成率 1.0 与 0.5 → 均值 0.75
    const cells = computeHeatmap([
      sessionAt(0, 9, { duration: 25 * 60, actualDuration: 25 * 60 }),
      sessionAt(0, 9, { duration: 25 * 60, actualDuration: 12.5 * 60 }),
    ]);
    const today = new Date();
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const cell9 = cells.find((c) => c.dayOfWeek === dow && c.hour === 9);
    expect(cell9?.efficiency).toBeCloseTo(0.75, 2);
  });

  it('should cap efficiency at 1.2 when actual far exceeds plan', () => {
    const cells = computeHeatmap([
      sessionAt(0, 9, { duration: 25 * 60, actualDuration: 50 * 60 }),
    ]);
    const today = new Date();
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const cell9 = cells.find((c) => c.dayOfWeek === dow && c.hour === 9);
    expect(cell9?.efficiency).toBe(1.2);
  });

  it('should leave efficiency undefined for cells without samples', () => {
    const cells = computeHeatmap([sessionAt(0, 9)]);
    const empty = cells.find((c) => c.hour === 3);
    expect(empty?.efficiency).toBeUndefined();
    expect(empty?.value).toBe(0);
  });

  it('should mark peak hours (rhythmEngine high tier) as golden time', () => {
    // 9 点全完成、14 点全失败、19 点半数 → 9 点为高峰档（≥3 有效桶）
    const sessions = [
      sessionAt(6, 9, { interrupted: false }), sessionAt(5, 9, { interrupted: false }),
      sessionAt(6, 14, { interrupted: true }), sessionAt(5, 14, { interrupted: true }),
      sessionAt(6, 19, { interrupted: false }), sessionAt(5, 19, { interrupted: true }),
    ];
    const cells = computeHeatmap(sessions);
    expect(cells.filter((c) => c.hour === 9).every((c) => c.peak)).toBe(true);
    expect(cells.filter((c) => c.hour === 14).every((c) => c.peak)).toBe(false);
  });

  it('should not annotate peaks when data insufficient (<3 valid buckets)', () => {
    const cells = computeHeatmap([sessionAt(1, 9, { interrupted: false })]);
    expect(cells.some((c) => c.peak)).toBe(false);
  });
});

describe('aggregateAnalytics smoke (B1 regression)', () => {
  it('should wire heatmap with efficiency/peak into aggregate', () => {
    const agg = aggregateAnalytics({
      ...EMPTY,
      sessions: [
        sessionAt(1, 9, { interrupted: false }),
        sessionAt(2, 9, { interrupted: false }),
        sessionAt(1, 14, { interrupted: true }),
      ],
    }, 30);
    expect(agg.heatmap).toHaveLength(168);
    expect(agg.recommendations.length).toBeGreaterThan(0);
    expect(agg.period.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should compute trend with 7-day moving average label', () => {
    const trend = computeTrend([sessionAt(0, 9, { actualDuration: 60 })], 7);
    expect(trend).toHaveLength(7);
    const last = trend[trend.length - 1];
    expect(last.value).toBe(1);
    expect(last.label).toMatch(/7日均值/);
  });

  it('should produce recommendations ranked by minutes', () => {
    const recs = computeRecommendations([
      { dayOfWeek: 0, hour: 9, value: 10 },
      { dayOfWeek: 0, hour: 10, value: 30 },
      { dayOfWeek: 1, hour: 9, value: 5 },
    ]);
    expect(recs[0].hour).toBe(10);
    expect(recs[0].score).toBe(100);
    expect(recs[0].reason).toContain('10:00');
  });
});
