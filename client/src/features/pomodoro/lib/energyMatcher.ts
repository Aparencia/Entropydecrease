/**
 * 精力-任务匹配器（T5）
 *
 * @ai-context: 纯本地算法：基于 rhythmEngine 的时段效率档位，映射当前
 * 时段适合的学习任务类型（认知负荷理论：高精力做高负荷任务，低精力
 * 做低负荷任务）。零 AI 依赖。
 */
import {
  buildHourlyCurve,
  getEnergyLevel,
  type RhythmSession,
  type EnergyLevel,
} from './rhythmEngine';

/** 任务建议 */
export interface TaskSuggestion {
  /** 建议的任务类型标签 */
  label: string;
  /** 建议说明（正向语言） */
  description: string;
  /** 应用内跳转路由 */
  route: string;
}

/** 各精力档位对应的任务建议（认知负荷从高到低） */
const TASK_BY_LEVEL: Record<EnergyLevel, TaskSuggestion> = {
  high: {
    label: '费曼讲解 / 攻克难题',
    description: '现在是你的高效时段，适合深度理解新概念或挑战难题',
    route: '/feynman',
  },
  medium: {
    label: '笔记整理',
    description: '当前状态平稳，适合整理笔记、梳理知识结构',
    route: '/notes',
  },
  low: {
    label: '闪卡复习',
    description: '精力偏低时，轻量的闪卡复习同样是在前进',
    route: '/flashcards',
  },
};

/**
 * 根据历史会话数据，给出当前时段的任务建议
 *
 * @param sessions 历史专注会话
 * @param now 当前时间（可注入便于测试）
 */
export function matchTaskToEnergy(
  sessions: RhythmSession[],
  now: Date = new Date(),
): TaskSuggestion {
  const curve = buildHourlyCurve(sessions, now);
  const level = getEnergyLevel(curve, now.getHours());
  return TASK_BY_LEVEL[level];
}
