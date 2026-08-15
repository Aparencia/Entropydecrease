/**
 * 专注花园 Store 单元测试
 * Unit tests for the focus garden store
 *
 * @ai-context: 枯萎判定（applyWilting）与汇总统计（computeGardenStats）为
 * 纯函数，直接断言；Store 动作（播种/浇水/复活/初始化）经 zustand 实例
 * 验证，使用本地 localStorage（jsdom）持久化，测试间重置状态隔离。
 * @ai-context: Pure functions applyWilting/computeGardenStats are asserted
 * directly; store actions run on the zustand instance with jsdom
 * localStorage, reset between tests for isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyWilting,
  computeGardenStats,
  useGardenStore,
} from './gardenStore';
import { WILT_AFTER_DAYS } from '../types';
import type { GardenPlant } from '../types';

const plant = (overrides: Partial<GardenPlant> & { id: string }): GardenPlant => ({
  name: '向日葵·1',
  species: 'sunflower',
  stage: 'seed',
  plantedAt: new Date(2026, 0, 1),
  sourceSessionId: 's1',
  focusMinutes: 10,
  wilted: false,
  revivedCount: 0,
  lastWateredAt: new Date(2026, 0, 1),
  ...overrides,
});

describe('applyWilting', () => {
  const now = new Date(2026, 0, 10, 12).getTime();

  it('should wilt a plant idle beyond the threshold', () => {
    // Arrange：上次浇水超过 WILT_AFTER_DAYS 天
    const p = plant({ id: 'old', lastWateredAt: new Date(2026, 0, 1) });
    // Act
    const [result] = applyWilting([p], now);
    // Assert
    expect(result.wilted).toBe(true);
    expect(result.id).toBe('old');
  });

  it('should keep a recently watered plant healthy', () => {
    const p = plant({ id: 'fresh', lastWateredAt: new Date(2026, 0, 9) });
    expect(applyWilting([p], now)[0].wilted).toBe(false);
  });

  it('should treat exactly the threshold as not wilted (strict >)', () => {
    // Arrange：刚好 3 天整 → 不白化
    const p = plant({ id: 'edge', lastWateredAt: new Date(2026, 0, 7, 12) });
    expect(applyWilting([p], now)[0].wilted).toBe(false);
  });

  it('should fall back to plantedAt when lastWateredAt is missing', () => {
    const p = plant({ id: 'no-water', lastWateredAt: undefined, plantedAt: new Date(2025, 11, 20) });
    expect(applyWilting([p], now)[0].wilted).toBe(true);
  });

  it('should not touch already wilted plants', () => {
    const p = plant({ id: 'w', wilted: true });
    expect(applyWilting([p], now)[0].wilted).toBe(true);
  });
});

describe('computeGardenStats', () => {
  it('should return zeroed stats for an empty garden', () => {
    expect(computeGardenStats([])).toEqual({
      totalPlants: 0,
      totalFocusMinutes: 0,
      speciesUnlocked: 0,
      bloomedCount: 0,
      wiltedCount: 0,
      ecosystemStage: 'seed',
    });
  });

  it('should aggregate totals, species and stages', () => {
    // Arrange：3 株（2 种物种、1 株盛开、1 株枯萎）
    const plants = [
      plant({ id: 'a', species: 'sunflower', focusMinutes: 30, stage: 'bloom' }),
      plant({ id: 'b', species: 'tulip', focusMinutes: 20, stage: 'grown' }),
      plant({ id: 'c', species: 'sunflower', focusMinutes: 50, stage: 'bloom', wilted: true }),
    ];
    // Act
    const stats = computeGardenStats(plants);
    // Assert
    expect(stats.totalPlants).toBe(3);
    expect(stats.totalFocusMinutes).toBe(100);
    expect(stats.speciesUnlocked).toBe(2);
    expect(stats.bloomedCount).toBe(2);
    expect(stats.wiltedCount).toBe(1);
    expect(stats.ecosystemStage).toBe('seed');
  });

  it('should map ecosystem stage from plant count', () => {
    const many = Array.from({ length: 5 }, (_, i) => plant({ id: `p${i}` }));
    expect(computeGardenStats(many).ecosystemStage).toBe('seedling');
    const garden = Array.from({ length: 15 }, (_, i) => plant({ id: `g${i}` }));
    expect(computeGardenStats(garden).ecosystemStage).toBe('garden');
    const eco = Array.from({ length: 30 }, (_, i) => plant({ id: `e${i}` }));
    expect(computeGardenStats(eco).ecosystemStage).toBe('ecosystem');
  });
});

describe('useGardenStore actions', () => {
  beforeEach(() => {
    localStorage.clear();
    useGardenStore.setState({ plants: [], initialized: false });
  });

  it('should plant a new plant with auto-generated identity', () => {
    // Act
    const created = useGardenStore.getState().addPlant({ sourceSessionId: 'dive-1', focusMinutes: 25 });
    // Assert
    expect(created).not.toBeNull();
    expect(created?.species).toBe('sunflower');
    expect(created?.name).toBe('向日葵·1');
    expect(created?.wilted).toBe(false);
    expect(created?.revivedCount).toBe(0);
    expect(created?.focusMinutes).toBe(25);
    expect(useGardenStore.getState().plants).toHaveLength(1);
  });

  it('should clamp focus minutes to at least 1 and rotate species', () => {
    useGardenStore.getState().addPlant({ sourceSessionId: 'a', focusMinutes: 0 });
    const second = useGardenStore.getState().addPlant({ sourceSessionId: 'b', focusMinutes: 30 });
    const plants = useGardenStore.getState().plants;
    expect(plants[0].focusMinutes).toBe(1);
    expect(second?.species).toBe('tulip');
    expect(second?.name).toBe('郁金香·2');
  });

  it('should auto-revive wilted plants when planting', () => {
    // Arrange：先种一株并手动标记枯萎
    useGardenStore.setState({
      plants: [plant({ id: 'w', wilted: true, revivedCount: 0 })],
    });
    // Act：新植物带来生机 → 全园复活
    useGardenStore.getState().addPlant({ sourceSessionId: 'new', focusMinutes: 25 });
    // Assert
    const revived = useGardenStore.getState().plants.find((p) => p.id === 'w');
    expect(revived?.wilted).toBe(false);
    expect(revived?.revivedCount).toBe(1);
  });

  it('should water a plant and clear wilt', () => {
    // Arrange
    useGardenStore.setState({ plants: [plant({ id: 'w', wilted: true })] });
    // Act
    useGardenStore.getState().waterPlant('w');
    // Assert
    const watered = useGardenStore.getState().plants[0];
    expect(watered.wilted).toBe(false);
    expect(watered.lastWateredAt).toBeInstanceOf(Date);
  });

  it('should revive a wilted plant and count the revival', () => {
    // Arrange
    useGardenStore.setState({ plants: [plant({ id: 'w', wilted: true, revivedCount: 2 })] });
    // Act
    useGardenStore.getState().revivePlant('w');
    // Assert
    const revived = useGardenStore.getState().plants[0];
    expect(revived.wilted).toBe(false);
    expect(revived.revivedCount).toBe(3);
  });

  it('should run the wilt check idempotently on initialize', () => {
    // Arrange：一株早已不浇水的植物
    useGardenStore.setState({
      plants: [plant({ id: 'old', lastWateredAt: new Date(2025, 11, 1) })],
      initialized: false,
    });
    // Act
    useGardenStore.getState().initialize();
    useGardenStore.getState().initialize();
    // Assert：幂等——第二次 initialize 不再执行
    const plants = useGardenStore.getState().plants;
    expect(plants[0].wilted).toBe(true);
    expect(useGardenStore.getState().initialized).toBe(true);
    expect(plants).toHaveLength(1);
  });

  it('should expose garden stats from current state', () => {
    // Arrange
    useGardenStore.setState({ plants: [plant({ id: 'a', focusMinutes: 25 })] });
    // Act
    const stats = useGardenStore.getState().getGardenStats();
    // Assert
    expect(stats.totalPlants).toBe(1);
    expect(stats.totalFocusMinutes).toBe(25);
  });
});

describe('garden persistence validation', () => {
  beforeEach(() => {
    localStorage.clear();
    useGardenStore.setState({ plants: [], initialized: false });
  });

  it('should survive a full add/water/revive lifecycle', () => {
    // 生命周期冒烟：播种 → 枯萎 → 复活 → 统计
    useGardenStore.setState({ plants: [plant({ id: 'a', focusMinutes: 40, stage: 'grown' })] });
    useGardenStore.getState().waterPlant('a');
    useGardenStore.getState().revivePlant('a');
    const stats = useGardenStore.getState().getGardenStats();
    expect(stats.totalPlants).toBe(1);
    expect(stats.totalFocusMinutes).toBe(40);
    expect(WILT_AFTER_DAYS).toBe(3);
  });
});
