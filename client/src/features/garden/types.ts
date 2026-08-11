/**
 * 专注花园 — 类型定义
 * Focus garden — type definitions
 *
 * @ai-context: 宪法第六条世界数据回路的另一面——专注不再种珊瑚而是播种子。
 * 花园以「可逆原则」设计：枯萎（wilted）只是白化降级，任何时候都可复活
 * （revive），绝不删除用户积累。4 阶段生态（种子期→幼苗期→花园期→
 * 生态圈期）由植物总数驱动，与珊瑚生态的留存机制互补。
 * @ai-context: Garden plants follow the reversible principle — wilting is a
 * visual white-out, never data loss. Four ecosystem stages are driven by
 * the total plant count.
 */

/** 植物物种（由专注行为决定，长期一致性奖励稀有物种） */
export type GardenSpecies = 'sunflower' | 'tulip' | 'cactus' | 'lotus' | 'bamboo' | 'clover';

/** 单株植物生长阶段（由累计专注分钟数驱动） */
export type GardenStage = 'seed' | 'sprout' | 'grown' | 'bloom';

/** 花园生态阶段（由植物总数驱动） */
export type GardenEcosystemStage = 'seed' | 'seedling' | 'garden' | 'ecosystem';

/** 单株花园植物 / A single garden plant */
export interface GardenPlant {
  id: string;
  /** 植物名称（自动生成：物种名 + 序号） */
  name: string;
  species: GardenSpecies;
  stage: GardenStage;
  plantedAt: Date;
  /** 来源会话 ID（如深潜 dive-xxx） / Source session ID */
  sourceSessionId: string;
  /** 累计专注分钟数（决定生长阶段） / Cumulative focus minutes */
  focusMinutes: number;
  /** 是否枯萎（白化外观，可恢复） / Wilted (white-out, recoverable) */
  wilted: boolean;
  /** 复活次数 / Times revived */
  revivedCount: number;
  /** 上次浇水时间（决定枯萎判定） / Last watered at (wilt basis) */
  lastWateredAt?: Date;
}

/** 花园统计 / Garden stats */
export interface GardenStats {
  totalPlants: number;
  totalFocusMinutes: number;
  /** 已解锁物种数 / Unlocked species count */
  speciesUnlocked: number;
  /** 盛开植株数 / Bloomed plant count */
  bloomedCount: number;
  /** 枯萎植株数 / Wilted plant count */
  wiltedCount: number;
  /** 当前生态阶段 / Current ecosystem stage */
  ecosystemStage: GardenEcosystemStage;
}

/** 生长阶段阈值（累计专注分钟） / Growth stage thresholds (focus minutes) */
export const STAGE_THRESHOLDS: Record<GardenStage, number> = {
  seed: 0,
  sprout: 25,
  grown: 100,
  bloom: 300,
};

/** 生态阶段阈值（植物总数） / Ecosystem stage thresholds (plant count) */
export const ECOSYSTEM_THRESHOLDS: Record<GardenEcosystemStage, number> = {
  seed: 0,
  seedling: 5,
  garden: 15,
  ecosystem: 30,
};

/** 枯萎判定：超过 N 天未浇水 / Wilt after N days without watering */
export const WILT_AFTER_DAYS = 3;

/** 物种元信息（emoji 随生长阶段变化） / Species meta (emoji per stage) */
export const SPECIES_META: Record<GardenSpecies, {
  label: string;
  emoji: Record<GardenStage, string>;
  color: string;
}> = {
  sunflower: { label: '向日葵', emoji: { seed: '🌰', sprout: '🌱', grown: '🌿', bloom: '🌻' }, color: '#f5b942' },
  tulip: { label: '郁金香', emoji: { seed: '🌰', sprout: '🌱', grown: '🌿', bloom: '🌷' }, color: '#e8779b' },
  cactus: { label: '仙人掌', emoji: { seed: '🌰', sprout: '🌱', grown: '🌵', bloom: '🌵' }, color: '#5da574' },
  lotus: { label: '睡莲', emoji: { seed: '🌰', sprout: '🌱', grown: '🍃', bloom: '🪷' }, color: '#c99ae8' },
  bamboo: { label: '青竹', emoji: { seed: '🌰', sprout: '🌱', grown: '🎋', bloom: '🎋' }, color: '#7fbf7f' },
  clover: { label: '四叶草', emoji: { seed: '🌰', sprout: '🌱', grown: '🌿', bloom: '🍀' }, color: '#6fbf6f' },
};

/** 根据累计专注分钟计算生长阶段 / Stage from focus minutes */
export function stageFromMinutes(minutes: number): GardenStage {
  if (minutes >= STAGE_THRESHOLDS.bloom) return 'bloom';
  if (minutes >= STAGE_THRESHOLDS.grown) return 'grown';
  if (minutes >= STAGE_THRESHOLDS.sprout) return 'sprout';
  return 'seed';
}

/** 根据植物总数计算生态阶段 / Ecosystem stage from plant count */
export function ecosystemStageFromCount(count: number): GardenEcosystemStage {
  if (count >= ECOSYSTEM_THRESHOLDS.ecosystem) return 'ecosystem';
  if (count >= ECOSYSTEM_THRESHOLDS.garden) return 'garden';
  if (count >= ECOSYSTEM_THRESHOLDS.seedling) return 'seedling';
  return 'seed';
}

/** 生态阶段展示文案 / Ecosystem stage display copy */
export const ECOSYSTEM_STAGE_META: Record<GardenEcosystemStage, {
  label: string;
  description: string;
}> = {
  seed: { label: '种子期', description: '一粒种子，静待破土' },
  seedling: { label: '幼苗期', description: '嫩芽初绽，专注成畦' },
  garden: { label: '花园期', description: '满园春色，习惯成林' },
  ecosystem: { label: '生态圈期', description: '万物生长，自成生态' },
};

/** 生长阶段文案 / Growth stage label */
export const STAGE_LABEL: Record<GardenStage, string> = {
  seed: '种子',
  sprout: '幼苗',
  grown: '成长',
  bloom: '盛开',
};
