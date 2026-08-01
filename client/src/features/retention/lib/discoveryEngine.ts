/**
 * 深海发现概率引擎
 * Deep sea discovery probability engine
 *
 * @ai-context: 可变比率强化（VR schedule）实现：学习里程碑后按稀有度概率
 * 随机触发深海发现。概率设计对抗多巴胺适应——不可预期 > 固定奖励。
 * @ai-context: Variable-ratio reinforcement implementation: after learning
 * milestones, randomly triggers discoveries by rarity tier probability.
 */
import type { DiscoveryDef, DiscoveryRarity } from '../types';

// ─── 发现物定义池 / Discovery definition pool ──────────────────────

export const DISCOVERY_DEFS: DiscoveryDef[] = [
  // 常见 (common) — 60% 池
  { type: 'plankton_swarm', name: '浮游生物群', rarity: 'common', description: '一片微小的光点在黑暗中闪烁，它们是深海食物链的基石', shapeKey: 'plankton' },
  { type: 'marine_snow', name: '海雪飘落', rarity: 'common', description: '有机碎屑如雪花般缓缓沉降，为深渊带来养分', shapeKey: 'snow' },
  { type: 'jellyfish_passerby', name: '水母路过', rarity: 'common', description: '一只透明水母悠然飘过，触手在暗流中轻舞', shapeKey: 'jellyfish' },
  { type: 'sea_cucumber', name: '海参漫步', rarity: 'common', description: '一只海参在海底缓慢移动，清理着沉积物', shapeKey: 'cucumber' },
  { type: 'brittle_star', name: '海星碎片', rarity: 'common', description: '一只脆海星趴在岩石上，腕足轻轻摇摆', shapeKey: 'star' },

  // 稀有 (rare) — 25% 池
  { type: 'anglerfish', name: '深海灯笼鱼', rarity: 'rare', description: '头顶的生物发光器在黑暗中画出一道弧线', shapeKey: 'angler' },
  { type: 'tube_worms', name: '管虫群落', rarity: 'rare', description: '密密麻麻的白色管虫在热泉口附近摇曳', shapeKey: 'tubeworm' },
  { type: 'star_garden', name: '海星花园', rarity: 'rare', description: '数十只彩色海星铺满岩壁，如同一座水下花园', shapeKey: 'stargarden' },
  { type: 'nautilus', name: '鹦鹉螺', rarity: 'rare', description: '一只活化石鹦鹉螺优雅地调节着浮力', shapeKey: 'nautilus' },

  // 史诗 (epic) — 12% 池
  { type: 'whale_fall', name: '鲸落遗迹', rarity: 'epic', description: '一具鲸骨沉眠于此，周围繁衍生息着独特群落', shapeKey: 'whalefall' },
  { type: 'hydrothermal_vent', name: '热泉生态', rarity: 'epic', description: '滚烫的矿物水从地壳裂缝涌出，孕育着不依赖阳光的生态', shapeKey: 'vent' },
  { type: 'giant_tube_worm', name: '巨型管虫', rarity: 'epic', description: '两米高的巨型管虫在热泉旁矗立，红色羽冠随水流摆动', shapeKey: 'gianttube' },

  // 传说 (legendary) — 3% 池
  { type: 'dragonfish', name: '深海龙鱼', rarity: 'legendary', description: '通体漆黑、獠牙外露，它是深渊中最顶级的猎手', shapeKey: 'dragon' },
  { type: 'ghost_jellyfish', name: '幽灵水母', rarity: 'legendary', description: '一只罕见的深红色巨型水母，触手延伸数米，如同深海的幽灵', shapeKey: 'ghost' },
  { type: 'ancient_nautilus', name: '远古鹦鹉螺', rarity: 'legendary', description: '一只极为古老的鹦鹉螺，壳上的纹路记录着亿万年的演化', shapeKey: 'ancient' },
];

// ─── 概率配置 / Probability configuration ──────────────────────────

/** 每次里程碑事件的触发概率（按稀有度） / Trigger probability per milestone */
const TRIGGER_CHANCE: Record<DiscoveryRarity, number> = {
  common: 0.15,
  rare: 0.08,
  epic: 0.03,
  legendary: 0.005,
};

/** 稀有度在池中的权重分布（参考文档） / Rarity weight distribution (reference) */
const _RARITY_WEIGHT: Record<DiscoveryRarity, number> = {
  common: 60,
  rare: 25,
  epic: 12,
  legendary: 3,
};
void _RARITY_WEIGHT;

// ─── 核心逻辑 / Core logic ─────────────────────────────────────────

/**
 * 尝试触发一次深海发现
 * Attempt to trigger a deep sea discovery
 *
 * @returns 触发的发现物定义，或 null（未触发）
 */
export function rollDiscovery(): DiscoveryDef | null {
  // 按稀有度从高到低依次判定（传说最优先判定，概率最低）
  const rarities: DiscoveryRarity[] = ['legendary', 'epic', 'rare', 'common'];

  for (const rarity of rarities) {
    if (Math.random() < TRIGGER_CHANCE[rarity]) {
      // 从该稀有度池中随机选取
      const pool = DISCOVERY_DEFS.filter((d) => d.rarity === rarity);
      if (pool.length === 0) continue;
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }

  return null;
}

/**
 * 获取稀有度显示配置
 * Get rarity display configuration
 */
export function getRarityConfig(rarity: DiscoveryRarity): {
  label: string;
  color: string;
  glowColor: string;
} {
  switch (rarity) {
    case 'common':
      return { label: '常见', color: 'text-slate-300', glowColor: 'shadow-slate-400/20' };
    case 'rare':
      return { label: '稀有', color: 'text-blue-300', glowColor: 'shadow-blue-400/30' };
    case 'epic':
      return { label: '史诗', color: 'text-violet-300', glowColor: 'shadow-violet-400/40' };
    case 'legendary':
      return { label: '传说', color: 'text-amber-300', glowColor: 'shadow-amber-400/50' };
  }
}
