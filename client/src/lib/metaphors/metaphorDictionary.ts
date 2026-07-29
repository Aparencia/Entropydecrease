/**
 * 隐喻文案词典 — 集中管理所有功能模块的深海隐喻映射
 * @ai-context 提供功能名称到隐喻文案的统一映射，空状态随机文案生成
 */

// ─────────────────────────────────────────────────────────────
// 隐喻映射表
// ─────────────────────────────────────────────────────────────

export const METAPHOR_MAP = {
  // 核心功能模块
  pomodoro: '深潜',
  notes: '结礁',
  flashcards: '反衰减呼吸',
  feynman: '浮出水面',
  inspiration: '萤火海沟',
  capture: '回声定位',
  dashboard: '深海仪表盘',

  // 设置页模块隐喻
  settings: {
    data: '引擎室',
    ai: '声呐校准',
    profile: '航海日志',
    general: '驾驶舱',
  },

  // 状态隐喻
  status: {
    studying: '深潜中',
    resting: '浮出水面',
    reviewing: '反衰减呼吸',
    completed: '抵达深渊',
  },

  // 空状态文案（每个模块多条，随机选用）
  emptyStates: {
    notes: [
      '尚未结礁，开始记录你的第一片知识珊瑚',
      '知识的礁石等待你的第一块基石',
    ],
    flashcards: [
      '尚无卡片等待反衰减呼吸',
      '开始创建，让知识抵抗遗忘的潮汐',
    ],
    feynman: [
      '尚无知识浮出水面',
      '选择一篇笔记，让理解浮出深海',
    ],
    inspiration: [
      '萤火尚未亮起',
      '收集微小的闪烁，它们终将照亮整片夜空',
    ],
    pomodoro: [
      '尚无深潜记录',
      '开始你的第一次深潜，探索知识的深海',
    ],
  },
} as const;

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/** 顶层功能模块键 */
export type MetaphorModuleKey =
  | 'pomodoro'
  | 'notes'
  | 'flashcards'
  | 'feynman'
  | 'inspiration'
  | 'capture'
  | 'dashboard';

/** 设置页模块键 */
export type SettingsModuleKey = keyof typeof METAPHOR_MAP.settings;

/** 状态键 */
export type StatusKey = keyof typeof METAPHOR_MAP.status;

/** 空状态模块键 */
export type EmptyStateKey = keyof typeof METAPHOR_MAP.emptyStates;

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 获取功能模块的隐喻名称
 * @param module 模块键（pomodoro / notes / flashcards 等）
 * @returns 对应的隐喻文案
 *
 * @example
 * getMetaphorName('pomodoro') // '深潜'
 * getMetaphorName('notes')    // '结礁'
 */
export function getMetaphorName(module: MetaphorModuleKey): string {
  return METAPHOR_MAP[module];
}

/**
 * 获取设置页模块的隐喻名称
 * @param module 设置子模块键（data / ai / profile / general）
 * @returns 对应的隐喻文案
 *
 * @example
 * getSettingsMetaphor('ai') // '声呐校准'
 */
export function getSettingsMetaphor(module: SettingsModuleKey): string {
  return METAPHOR_MAP.settings[module];
}

/**
 * 获取状态隐喻
 * @param status 状态键
 * @returns 对应的状态文案
 *
 * @example
 * getStatusMetaphor('studying') // '深潜中'
 */
export function getStatusMetaphor(status: StatusKey): string {
  return METAPHOR_MAP.status[status];
}

/**
 * 获取空状态文案（从候选列表中随机选择一条）
 * @param module 模块键（notes / flashcards / feynman / inspiration / pomodoro）
 * @returns 随机选取的空状态文案
 *
 * @example
 * getEmptyStateText('notes') // '尚未结礁，开始记录你的第一片知识珊瑚'
 */
export function getEmptyStateText(module: EmptyStateKey): string {
  const candidates: readonly string[] = METAPHOR_MAP.emptyStates[module];
  if (!candidates || candidates.length === 0) {
    return '这里空空如也';
  }
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

/**
 * 检查给定模块是否属于顶层功能模块（排除 settings / status / emptyStates）
 * @param key 任意字符串
 * @returns 是否为有效的 MetaphorModuleKey
 */
export function isTopLevelModule(key: string): key is MetaphorModuleKey {
  const topLevel: readonly string[] = [
    'pomodoro', 'notes', 'flashcards', 'feynman',
    'inspiration', 'capture', 'dashboard',
  ];
  return topLevel.includes(key);
}
