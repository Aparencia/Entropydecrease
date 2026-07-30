/**
 * ritualPlanner 单元测试 / Unit tests for the adaptive planner
 *
 * @ai-context: 覆盖 T-B1-01——全部编排规则分支（无数据裁剪/7 天轻档/深夜/
 * 手动优先）+ A/B 分流稳定性（B 组呼吸前置、同 seed 恒定）。
 * @ai-context: Covers all planner branches and stable A/B allocation.
 */
import { describe, it, expect } from 'vitest';
import { buildRitualPlan, pickAbGroup } from './ritualPlanner';
import type { RitualPlanContext } from '../types';

function ctx(overrides: Partial<RitualPlanContext> = {}): RitualPlanContext {
  return {
    hasLastSession: true,
    streakDays: 1,
    hour: 10,
    intensity: 'standard',
    autoAdapt: true,
    abGroup: 'A',
    ...overrides,
  };
}

describe('buildRitualPlan', () => {
  it('should return full three steps for standard new user', () => {
    const plan = buildRitualPlan(ctx());
    expect(plan.steps).toEqual(['review', 'goal', 'breathing']);
    expect(plan.planVariant).toBe('standard-A');
  });

  it('should drop review when no last session', () => {
    const plan = buildRitualPlan(ctx({ hasLastSession: false }));
    expect(plan.steps).toEqual(['goal', 'breathing']);
  });

  it('should use light plan for 7-day streak with autoAdapt', () => {
    const plan = buildRitualPlan(ctx({ streakDays: 7 }));
    expect(plan.steps).toEqual(['goal', 'breathing']);
    expect(plan.planVariant).toBe('light-A');
  });

  it('should NOT auto-light when autoAdapt is off', () => {
    const plan = buildRitualPlan(ctx({ streakDays: 10, autoAdapt: false }));
    expect(plan.steps).toEqual(['review', 'goal', 'breathing']);
  });

  it('should keep full plan for deep intensity even at long streak', () => {
    const plan = buildRitualPlan(ctx({ streakDays: 20, intensity: 'deep' }));
    expect(plan.steps).toEqual(['review', 'goal', 'breathing']);
    expect(plan.planVariant).toBe('deep-A');
  });

  it('should honor manual light intensity regardless of streak', () => {
    const plan = buildRitualPlan(ctx({ streakDays: 1, intensity: 'light', autoAdapt: false }));
    expect(plan.steps).toEqual(['goal', 'breathing']);
    expect(plan.planVariant).toBe('light-A');
  });

  it('should tag night variant after 22:00', () => {
    const plan = buildRitualPlan(ctx({ hour: 23 }));
    expect(plan.planVariant).toBe('standard-A-night');
  });

  it('should frontload breathing for B group', () => {
    const plan = buildRitualPlan(ctx({ abGroup: 'B' }));
    expect(plan.steps).toEqual(['breathing', 'review', 'goal']);
    expect(plan.planVariant).toBe('standard-B');
  });

  it('should frontload breathing for B group in light plan too', () => {
    const plan = buildRitualPlan(ctx({ abGroup: 'B', intensity: 'light' }));
    expect(plan.steps).toEqual(['breathing', 'goal']);
  });
});

describe('pickAbGroup', () => {
  it('should be stable for the same seed', () => {
    expect(pickAbGroup('device-123')).toBe(pickAbGroup('device-123'));
  });

  it('should return only A or B', () => {
    for (const seed of ['a', 'b', 'c', 'device-xyz', '']) {
      expect(['A', 'B']).toContain(pickAbGroup(seed));
    }
  });
});
