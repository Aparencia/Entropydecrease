/**
 * 深海发现概率引擎单元测试
 * Unit tests for the deep sea discovery engine
 *
 * @ai-context: rollDiscovery 依赖 Math.random——测试用 spy 固定随机序列，
 * 逐档验证稀有度判定顺序（传说→史诗→稀有→常见→未触发）；getRarityConfig
 * 为纯 switch 映射，覆盖全部四种稀有度。定义池同时做结构完整性校验。
 * @ai-context: rollDiscovery uses Math.random — tests stub the PRNG to
 * verify rarity tiers resolve in order (legendary→epic→rare→common→none).
 * The definition pool is validated structurally as well.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rollDiscovery, getRarityConfig, DISCOVERY_DEFS } from './discoveryEngine';
import type { DiscoveryRarity } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DISCOVERY_DEFS pool', () => {
  it('should contain every rarity tier with complete fields', () => {
    // Arrange
    const byRarity = new Map<DiscoveryRarity, number>();
    for (const def of DISCOVERY_DEFS) {
      expect(def.type).toBeTruthy();
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.shapeKey).toBeTruthy();
      byRarity.set(def.rarity, (byRarity.get(def.rarity) ?? 0) + 1);
    }
    // Assert：各档池非空，与文档权重比例一致
    expect(byRarity.get('common')).toBe(5);
    expect(byRarity.get('rare')).toBe(4);
    expect(byRarity.get('epic')).toBe(3);
    expect(byRarity.get('legendary')).toBe(3);
  });
});

describe('rollDiscovery', () => {
  it('should return a legendary def when the first roll succeeds', () => {
    // Arrange：始终返回 0 → 传说判定（0 < 0.005）命中
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // Act
    const def = rollDiscovery();
    // Assert
    expect(def?.rarity).toBe('legendary');
  });

  it('should resolve to epic when legendary misses and epic hits', () => {
    // Arrange：0.01 传说未命中（≥0.005）、0.01 史诗命中（<0.03）
    const seq = [0.01, 0.01];
    vi.spyOn(Math, 'random').mockImplementation(() => seq.shift() ?? 0);
    // Act
    const def = rollDiscovery();
    // Assert
    expect(def?.rarity).toBe('epic');
  });

  it('should resolve to rare when only the rare roll hits', () => {
    // Arrange：传说(0.01)/史诗(0.05)未命中，稀有命中(0.05<0.08)，第 4 次为池内选取
    const seq = [0.01, 0.05, 0.05, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => seq.shift() ?? 0);
    // Act
    const def = rollDiscovery();
    // Assert
    expect(def?.rarity).toBe('rare');
  });

  it('should resolve to common when only the common roll hits', () => {
    // Arrange：前三档均未命中，常见命中(0.1<0.15)，第 5 次为池内选取
    const seq = [0.01, 0.05, 0.1, 0.1, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => seq.shift() ?? 0);
    // Act
    const def = rollDiscovery();
    // Assert
    expect(def?.rarity).toBe('common');
  });

  it('should return null when all rarity rolls miss', () => {
    // Arrange：0.9 高于所有触发概率
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    // Act/Assert
    expect(rollDiscovery()).toBeNull();
  });
});

describe('getRarityConfig', () => {
  it('should return display config for every rarity', () => {
    expect(getRarityConfig('common')).toEqual({ label: '常见', color: 'text-slate-300', glowColor: 'shadow-slate-400/20' });
    expect(getRarityConfig('rare')).toEqual({ label: '稀有', color: 'text-blue-300', glowColor: 'shadow-blue-400/30' });
    expect(getRarityConfig('epic')).toEqual({ label: '史诗', color: 'text-cyber', glowColor: 'shadow-cyber/40' });
    expect(getRarityConfig('legendary')).toEqual({ label: '传说', color: 'text-amber-300', glowColor: 'shadow-amber-400/50' });
  });
});
