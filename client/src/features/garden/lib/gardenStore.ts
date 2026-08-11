/**
 * 专注花园 Store
 * Focus garden store
 *
 * @ai-context: 管理花园植物的增删（只增不删）、浇水、复活与枯萎检查。
 * 数据经 zustand persist 持久化到 localStorage（轻量养成数据，不进
 * Dexie/SQLite 主库）。addPlant 由番茄钟完成回路动态 import 调用；
 * 枯萎判定为纯函数（可测试），3 天未浇水即白化，但任何时候可复活——
 * 可逆原则，绝不删除用户积累。
 * @ai-context: Plant CRUD persisted to localStorage via zustand persist.
 * Wilting is a pure function (testable); plants white-out after 3 idle days
 * but can always be revived — the reversible principle, never data loss.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  stageFromMinutes, ecosystemStageFromCount, WILT_AFTER_DAYS, SPECIES_META,
  type GardenPlant, type GardenSpecies, type GardenStats, type GardenEcosystemStage,
} from '../types';

/** 每次深潜播种后自动浇灌全园——新植物带来生机（与珊瑚种植即恢复同构） */
const AUTO_REVIVE_ON_PLANT = true;

/** 物种轮换池：按种植序号循环分配，保证花园多样性 */
const SPECIES_POOL: GardenSpecies[] = ['sunflower', 'tulip', 'cactus', 'lotus', 'bamboo', 'clover'];

/** 持久化条目结构校验：损坏/旧版本数据逐项过滤，防渲染崩溃（H6） */
function isValidPlant(p: unknown): p is GardenPlant {
  if (!p || typeof p !== 'object') return false;
  const plant = p as Record<string, unknown>;
  return typeof plant.id === 'string'
    && typeof plant.name === 'string'
    && typeof plant.species === 'string'
    && (SPECIES_POOL as string[]).includes(plant.species)
    && typeof plant.plantedAt === 'string'
    && typeof plant.focusMinutes === 'number'
    && typeof plant.wilted === 'boolean';
}

export interface AddPlantData {
  /** 来源会话 ID / Source session ID */
  sourceSessionId: string;
  /** 本次专注分钟数 / Focus minutes of this session */
  focusMinutes: number;
}

interface GardenState {
  plants: GardenPlant[];
  /** 是否已执行过枯萎检查 / Whether wilt check ran */
  initialized: boolean;

  /** 初始化：执行枯萎检查（幂等） / Initialize: run wilt check */
  initialize: () => void;
  /** 深潜完成 → 播种（自动浇灌全园恢复枯萎） */
  addPlant: (data: AddPlantData) => GardenPlant | null;
  /** 浇水：刷新 lastWateredAt，顺带解除枯萎 */
  waterPlant: (id: string) => void;
  /** 复活枯萎植株（可逆原则） / Revive a wilted plant */
  revivePlant: (id: string) => void;
  /** 花园统计 / Garden stats */
  getGardenStats: () => GardenStats;
}

/** 枯萎检查（纯函数）：超过 WILT_AFTER_DAYS 天未浇水 → 白化 */
export function applyWilting(plants: GardenPlant[], now: number = Date.now()): GardenPlant[] {
  return plants.map((p) => {
    if (p.wilted) return p;
    const last = p.lastWateredAt ? new Date(p.lastWateredAt).getTime() : new Date(p.plantedAt).getTime();
    return now - last > WILT_AFTER_DAYS * 24 * 60 * 60 * 1000 ? { ...p, wilted: true } : p;
  });
}

/** 汇总统计（纯函数） / Aggregate stats (pure) */
export function computeGardenStats(plants: GardenPlant[]): GardenStats {
  const speciesUnlocked = new Set(plants.map((p) => p.species)).size;
  return {
    totalPlants: plants.length,
    totalFocusMinutes: plants.reduce((sum, p) => sum + p.focusMinutes, 0),
    speciesUnlocked,
    bloomedCount: plants.filter((p) => p.stage === 'bloom').length,
    wiltedCount: plants.filter((p) => p.wilted).length,
    ecosystemStage: ecosystemStageFromCount(plants.length),
  };
}

export const useGardenStore = create<GardenState>()(
  persist(
    (set, get) => ({
      plants: [],
      initialized: false,

      initialize: () => {
        if (get().initialized) return;
        const plants = applyWilting(get().plants);
        set({ plants, initialized: true });
      },

      addPlant: (data) => {
        const state = get();
        const existing = applyWilting(state.plants);
        const minutes = Math.max(1, data.focusMinutes);
        const plant: GardenPlant = {
          id: crypto.randomUUID(),
          name: `${SPECIES_META[SPECIES_POOL[existing.length % SPECIES_POOL.length]].label}·${existing.length + 1}`,
          species: SPECIES_POOL[existing.length % SPECIES_POOL.length],
          stage: stageFromMinutes(minutes),
          plantedAt: new Date(),
          sourceSessionId: data.sourceSessionId,
          focusMinutes: minutes,
          wilted: false,
          revivedCount: 0,
          lastWateredAt: new Date(),
        };
        // 新植物带来生机：自动浇灌全园（可逆原则的积极面）
        const plants = AUTO_REVIVE_ON_PLANT
          ? [...existing.map((p) => (p.wilted ? { ...p, wilted: false, revivedCount: p.revivedCount + 1 } : p)), plant]
          : [...existing, plant];
        set({ plants });
        return plant;
      },

      waterPlant: (id) => {
        const plants = applyWilting(get().plants).map((p) =>
          p.id === id ? { ...p, lastWateredAt: new Date(), wilted: false } : p,
        );
        set({ plants });
      },

      revivePlant: (id) => {
        const plants = applyWilting(get().plants).map((p) =>
          p.id === id ? { ...p, wilted: false, revivedCount: p.revivedCount + 1, lastWateredAt: new Date() } : p,
        );
        set({ plants });
      },

      getGardenStats: () => computeGardenStats(get().plants),
    }),
    {
      name: 'garden-store',
      // H6: initialized 不入库——枯萎检查必须每次冷启动都执行，
      // 持久化该字段会导致 hydrate 后视为已初始化、植物永不枯萎
      partialize: (state) => ({
        plants: state.plants,
      }),
      // H6: rehydrate 时逐项校验，丢弃损坏条目（防 SPECIES_META[species] undefined 崩溃）
      onRehydrateStorage: () => (state) => {
        if (!state || !Array.isArray(state.plants)) {
          useGardenStore.setState({ plants: [], initialized: false });
          return;
        }
        const valid = state.plants.filter(isValidPlant);
        if (valid.length !== state.plants.length) {
          useGardenStore.setState({ plants: valid, initialized: false });
        } else {
          // 冷启动强制下次 initialize 执行枯萎检查（initialized 不持久化）
          useGardenStore.setState({ initialized: false });
        }
      },
    },
  ),
);

/** 便捷选择器：仅订阅植物列表 / Selector: plants only */
export const useGardenPlants = () => useGardenStore((s) => s.plants);

/** 生态阶段快速查询 / Quick ecosystem stage lookup */
export function useGardenEcosystemStage(): GardenEcosystemStage {
  return useGardenStore((s) => ecosystemStageFromCount(s.plants.length));
}
