/**
 * 世界状态派生层单元测试
 * Unit tests for the world state derivation layer
 *
 * @ai-context: 覆盖《熵可视化设计宪法》关键约束：焦虑防线雾上限 0.4、
 * 关闭留存→中性信号、冷启动非空白、无负向输出语义。
 */
import { describe, it, expect } from 'vitest';
import {
  deriveWorldSignals,
  vitalityToGlowScale,
  computeCurrentStreakFromCorals,
  WORLD_ANCHORS,
} from './worldState';
import type { CoralRecord } from '../types';

function makeCoral(health: CoralRecord['health'], id = Math.random().toString(36)): CoralRecord {
  return {
    id,
    type: 'branching',
    health,
    plantedAt: new Date(),
    sourceSession: 'test',
    depth: 10,
  };
}

/** 指定日期偏移的珊瑚（daysAgo=0 为今天） / Coral planted daysAgo days ago */
function coralOnDay(daysAgo: number): CoralRecord {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { ...makeCoral('healthy'), plantedAt: d };
}

const base = {
  corals: [] as CoralRecord[],
  totalDepth: 0,
  discoveriesCount: 0,
  currentStreak: 0,
  enabled: true,
};

describe('deriveWorldSignals', () => {
  it('should return neutral signals when retention is disabled (焦虑防线 §5)', () => {
    // Arrange：留存关闭，即使存在白化珊瑚
    const input = { ...base, corals: [makeCoral('bleached')], enabled: false };

    // Act
    const s = deriveWorldSignals(input);

    // Assert：纯净亮度映射——满活力、无雾
    expect(s.vitality).toBe(1);
    expect(s.mist).toBe(0);
    expect(s.enabled).toBe(false);
  });

  it('should return unlit-chaos world on cold start (宪法第七条：非空白)', () => {
    // Arrange：无任何珊瑚
    const input = { ...base };

    // Act
    const s = deriveWorldSignals(input);

    // Assert：中性活力 + 薄雾，暗示可能性而非空洞
    expect(s.vitality).toBe(WORLD_ANCHORS.VITALITY_COLD_START);
    expect(s.mist).toBe(WORLD_ANCHORS.MIST_COLD_START);
    expect(s.depthNorm).toBe(0);
  });

  it('should map healthy ratio to vitality and zero mist when all healthy', () => {
    // Arrange：全部健康
    const input = { ...base, corals: [makeCoral('healthy'), makeCoral('healthy')] };

    // Act
    const s = deriveWorldSignals(input);

    // Assert
    expect(s.vitality).toBe(1);
    expect(s.mist).toBe(0);
  });

  it('should map bleached ratio to mist proportionally', () => {
    // Arrange：一半白化
    const input = { ...base, corals: [makeCoral('healthy'), makeCoral('bleached')] };

    // Act
    const s = deriveWorldSignals(input);

    // Assert：0.5 × 0.4
    expect(s.vitality).toBe(0.5);
    expect(s.mist).toBeCloseTo(0.2);
  });

  it('should never exceed mist cap 0.4 even when fully bleached (焦虑防线 §1)', () => {
    // Arrange：全部白化
    const input = { ...base, corals: [makeCoral('bleached'), makeCoral('bleached')] };

    // Act
    const s = deriveWorldSignals(input);

    // Assert：雾封顶 40%，朦胧可拨开，永不吞噬世界
    expect(s.mist).toBeLessThanOrEqual(WORLD_ANCHORS.MIST_MAX);
    expect(s.vitality).toBe(0);
  });

  it('should clamp depth/firefly/warmth into 0-1', () => {
    // Arrange：远超饱和锚点的输入
    const input = {
      ...base,
      corals: [makeCoral('healthy')],
      totalDepth: WORLD_ANCHORS.DEPTH_FULL * 10,
      discoveriesCount: WORLD_ANCHORS.FIREFLY_FULL * 5,
      currentStreak: WORLD_ANCHORS.STREAK_FULL * 3,
    };

    // Act
    const s = deriveWorldSignals(input);

    // Assert
    expect(s.depthNorm).toBe(1);
    expect(s.firefly).toBe(1);
    expect(s.warmth).toBe(1);
  });
});

describe('vitalityToGlowScale', () => {
  it('should stay within the 0.6-1.15 readable band (奖赏回来：无惩罚性暗淡)', () => {
    // Act & Assert：边界内外均收敛于可读域
    expect(vitalityToGlowScale(0)).toBeCloseTo(0.6);
    expect(vitalityToGlowScale(1)).toBeCloseTo(1.15);
    expect(vitalityToGlowScale(-2)).toBeCloseTo(0.6);
    expect(vitalityToGlowScale(9)).toBeCloseTo(1.15);
  });
});

describe('computeCurrentStreakFromCorals', () => {
  it('should return 0 for empty corals', () => {
    expect(computeCurrentStreakFromCorals([])).toBe(0);
  });

  it('should count consecutive days and dedupe same-day plants', () => {
    // Arrange：今天 2 次种植 + 前 2 天连续
    const corals = [coralOnDay(0), coralOnDay(0), coralOnDay(1), coralOnDay(2)];

    // Act & Assert
    expect(computeCurrentStreakFromCorals(corals)).toBe(3);
  });

  it('should stop at the first gap (与 DashboardPage 口径一致)', () => {
    // Arrange：今天、昨天，第三天断裂
    const corals = [coralOnDay(0), coralOnDay(1), coralOnDay(3)];

    // Act & Assert
    expect(computeCurrentStreakFromCorals(corals)).toBe(2);
  });
});
