/**
 * 珊瑚生长引擎单元测试
 * Unit tests for coral growth engine
 *
 * @ai-context: 覆盖珊瑚类型决定（flashcard 优先/连续天数/时长）、深度分层
 * （边界值含 200/1000/4000 与超深回退）、白化判定（阈值、最近一株、无健康株）
 * 与恢复、标签/色值映射。全部为纯函数，测试不触碰任何存储或网络。
 * @ai-context: Covers coral type determination, depth zone boundaries,
 * bleaching rules (threshold, latest healthy, empty), restoration and
 * label/color mapping. All pure functions — no storage or network.
 */
import { describe, it, expect } from 'vitest';
import {
  determineCoralType,
  calculateDepth,
  getDepthZone,
  getZoneProgress,
  checkBleaching,
  restoreBleached,
  getCoralTypeLabel,
  getCoralTypeColor,
} from './coralEngine';
import type { CoralRecord } from '../types';

const coral = (overrides: Partial<CoralRecord> & { id: string }): CoralRecord => ({
  type: 'branching',
  health: 'healthy',
  plantedAt: new Date(2026, 0, 10),
  sourceSession: 's1',
  depth: 100,
  ...overrides,
});

describe('determineCoralType', () => {
  it('should always return tube for flashcard source', () => {
    expect(determineCoralType(0, 'flashcard', 0)).toBe('tube');
    expect(determineCoralType(60, 'flashcard', 9)).toBe('tube');
  });

  it('should prefer fan for 5+ consecutive days', () => {
    expect(determineCoralType(10, 'pomodoro', 5)).toBe('fan');
    expect(determineCoralType(60, 'feynman', 7)).toBe('fan');
  });

  it('should return brain for long sessions', () => {
    expect(determineCoralType(40, 'pomodoro', 1)).toBe('brain');
    expect(determineCoralType(120, 'feynman', 2)).toBe('brain');
  });

  it('should return branching by default', () => {
    expect(determineCoralType(20, 'pomodoro', 1)).toBe('branching');
    expect(determineCoralType(39, 'feynman', 4)).toBe('branching');
  });
});

describe('calculateDepth', () => {
  it('should map 1 minute of focus to 4 meters', () => {
    expect(calculateDepth(0)).toBe(0);
    expect(calculateDepth(25)).toBe(100);
    expect(calculateDepth(30)).toBe(120);
  });
});

describe('getDepthZone', () => {
  it('should return the zone containing the depth', () => {
    expect(getDepthZone(0).name).toBe('透光层');
    expect(getDepthZone(100).name).toBe('透光层');
    expect(getDepthZone(200).name).toBe('中层带');
    expect(getDepthZone(999).name).toBe('中层带');
    expect(getDepthZone(1000).name).toBe('深层带');
    expect(getDepthZone(3999).name).toBe('深层带');
    expect(getDepthZone(4000).name).toBe('超深层');
    expect(getDepthZone(10_000).name).toBe('超深层');
  });

  it('should fall back to the deepest zone for negative depth', () => {
    expect(getDepthZone(-5).name).toBe('超深层');
  });
});

describe('getZoneProgress', () => {
  it('should compute linear progress within a zone', () => {
    expect(getZoneProgress(100)).toBe(50);
    expect(getZoneProgress(150)).toBe(75);
    expect(getZoneProgress(600)).toBe(50);
    expect(getZoneProgress(2500)).toBe(50);
  });

  it('should return 100 for the infinite deepest zone', () => {
    expect(getZoneProgress(5000)).toBe(100);
  });
});

describe('checkBleaching', () => {
  const today = new Date(2026, 0, 15, 12, 0);

  it('should not bleach within the 3-day threshold', () => {
    expect(checkBleaching([coral({ id: 'c1' })], '2026-01-14', today)).toEqual([]);
  });

  it('should bleach the latest healthy coral after 3 idle days', () => {
    // Arrange：两株健康珊瑚，c2 更新
    const corals = [
      coral({ id: 'old', plantedAt: new Date(2026, 0, 5) }),
      coral({ id: 'new', plantedAt: new Date(2026, 0, 8) }),
    ];
    // Act
    const result = checkBleaching(corals, '2026-01-10', today);
    // Assert：只白化最近一株
    expect(result).toEqual(['new']);
  });

  it('should skip already bleached corals and return empty when none healthy', () => {
    const corals = [
      coral({ id: 'a', health: 'bleached' }),
      coral({ id: 'b', health: 'bleached' }),
    ];
    expect(checkBleaching(corals, '2026-01-10', today)).toEqual([]);
  });

  it('should return empty for an empty collection', () => {
    expect(checkBleaching([], '2026-01-10', today)).toEqual([]);
  });
});

describe('restoreBleached', () => {
  it('should restore all bleached corals and leave healthy ones intact', () => {
    // Arrange
    const corals = [
      coral({ id: 'a', health: 'bleached' }),
      coral({ id: 'b', health: 'healthy' }),
    ];
    // Act
    const restored = restoreBleached(corals);
    // Assert
    expect(restored[0].health).toBe('healthy');
    expect(restored[1].health).toBe('healthy');
    expect(restored[0].id).toBe('a');
  });

  it('should return an equal-length array', () => {
    expect(restoreBleached([])).toEqual([]);
    expect(restoreBleached([coral({ id: 'x', health: 'healthy' })])).toHaveLength(1);
  });
});

describe('getCoralTypeLabel / getCoralTypeColor', () => {
  it('should map every coral type to a label', () => {
    expect(getCoralTypeLabel('branching')).toBe('枝状珊瑚');
    expect(getCoralTypeLabel('brain')).toBe('脑珊瑚');
    expect(getCoralTypeLabel('fan')).toBe('扇形珊瑚');
    expect(getCoralTypeLabel('tube')).toBe('管虫');
  });

  it('should map every coral type to a color', () => {
    expect(getCoralTypeColor('branching')).toBe('#f472b6');
    expect(getCoralTypeColor('brain')).toBe('#a78bfa');
    expect(getCoralTypeColor('fan')).toBe('#34d399');
    expect(getCoralTypeColor('tube')).toBe('#fbbf24');
  });
});
