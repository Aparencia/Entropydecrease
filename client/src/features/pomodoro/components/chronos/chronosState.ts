/**
 * Chronos 时间生物 — 六态状态机
 *
 * 严格遵循设计详解《形态、交互与反馈》的状态机：
 * 沉睡(Idle)→呼吸(Ready)→专注(Focus)→短休/长休→（循环/回沉睡）。
 * 本模块只做 store 状态 → 生物态的纯映射，不含渲染逻辑（样式/模式分离规范）。
 *
 * @ai-context: 状态映射单一来源；PomodoroPage/ImmersiveTimer 交互与
 * ChronosCreature 渲染共用同一状态语义。
 */

/** 时间生物状态（设计详解五态；ending 由 progress 派生，不独立成态） */
export type ChronosState = 'asleep' | 'breathing' | 'focus' | 'short_break' | 'long_break';

export interface ChronosStateInput {
  /** 激活标记：false=沉睡，true=呼吸（已激活待开始） */
  isArmed: boolean;
  isRunning: boolean;
  isPaused: boolean;
  phase: 'work' | 'short_break' | 'long_break';
  /** 1 分钟迈步进行中：迈步期间显示呼吸（心跳聚合仪式），而非专注 */
  isStepDive?: boolean;
}

/**
 * store 状态 → 生物态映射
 *
 * - 休息阶段（无论运行/暂停）→ 对应休息形态（种子/大树）
 * - 1 分钟迈步运行中 → 呼吸（心跳聚合仪式，迈步即"呼吸开始计时"）
 * - work 运行中 → 专注（白炽星体）
 * - work 暂停或已激活未开始 → 呼吸（心跳待开始）
 * - 未激活 → 沉睡（余烬蓄能）
 */
export function toChronosState(input: ChronosStateInput): ChronosState {
  if (input.phase === 'short_break') return 'short_break';
  if (input.phase === 'long_break') return 'long_break';
  // 1 分钟迈步期间显示呼吸（心跳聚合仪式），不进入专注
  if (input.isStepDive && input.isRunning) return 'breathing';
  if (input.isRunning) return 'focus';
  if (input.isPaused || input.isArmed) return 'breathing';
  return 'asleep';
}

/** 状态指示元数据：中文名、图标（设计详解 emoji）与交互提示 */
export interface ChronosStateLabel {
  name: string;
  icon: string;
  hint: string;
}

export const CHRONOS_STATE_LABELS: Record<ChronosState, ChronosStateLabel> = {
  asleep: { name: '沉睡', icon: '🌑', hint: '点击激活' },
  breathing: { name: '呼吸', icon: '🌕', hint: '点击开始 1 分钟迈步' },
  focus: { name: '专注', icon: '🔥', hint: '点击暂停 · 长按放弃' },
  short_break: { name: '短休', icon: '🌱', hint: '点击提前结束' },
  long_break: { name: '长休', icon: '🌳', hint: '点击提前结束' },
};
