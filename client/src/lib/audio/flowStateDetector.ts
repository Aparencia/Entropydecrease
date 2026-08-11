/**
 * 心流状态检测器
 *
 * @ai-context: 心流音乐引擎（3.8）——从番茄钟阶段 + 专注信号检测心流状态。
 * 纯函数实现：状态由调用方持有并传回，便于单元测试。
 * 心流状态：未开始 → 浅层专注 → 深度心流 → 注意力分散 → 休息
 */
import type { Phase } from '@/features/pomodoro/store/pomodoroStoreTypes';

/** 心流状态枚举 */
export type FlowState = 'not_started' | 'shallow_focus' | 'deep_flow' | 'distracted' | 'break';

/** 心流状态标签（中文） */
export const FLOW_STATE_LABELS: Record<FlowState, string> = {
  not_started: '未开始',
  shallow_focus: '浅层专注',
  deep_flow: '深度心流',
  distracted: '注意力分散',
  break: '休息',
};

/** 心流检测器状态 */
export interface FlowDetectorState {
  state: FlowState;
  /** 进入当前状态的时刻（ms） */
  enteredAt: number;
  /** 连续深度专注累计时间（秒） */
  deepFocusSeconds: number;
  /** 连续分心累计时间（秒） */
  distractionSeconds: number;
}

/** 创建初始状态 */
export function createFlowDetector(): FlowDetectorState {
  return {
    state: 'not_started',
    enteredAt: Date.now(),
    deepFocusSeconds: 0,
    distractionSeconds: 0,
  };
}

/** 进入深度心流所需的最小连续专注时间（秒） */
const DEEP_FOCUS_THRESHOLD_SEC = 120;
/** 标记为分心所需的连续分心时间（秒） */
const DISTRACTED_THRESHOLD_SEC = 30;

/** 分心分数阈值（低于此值视为专注） */
const FOCUS_THRESHOLD = 20;

/**
 * 评估心流状态（纯函数）
 * @param prev - 前一次检测器状态
 * @param phase - 当前番茄钟阶段
 * @param isRunning - 是否运行中
 * @param focusScore - 当前专注守护灵分心分数（0-100，低=专注）
 * @param intervalMs - 本次评估间隔（ms）
 * @returns 新检测器状态
 */
export function evaluateFlowState(
  prev: FlowDetectorState,
  phase: Phase,
  isRunning: boolean,
  focusScore: number,
  intervalMs: number,
): FlowDetectorState {
  const intervalSec = intervalMs / 1000;
  const isDeep = focusScore < FOCUS_THRESHOLD;

  let deepFocusSeconds = prev.deepFocusSeconds;
  let distractionSeconds = prev.distractionSeconds;

  // H5: 进入休息阶段时重置累计计数器——否则首次达到 deep_flow 后，
  // 后续每个 work 会话开头 2 秒就再次判定 deep_flow，心流检测永久失真
  if (phase === 'short_break' || phase === 'long_break') {
    deepFocusSeconds = 0;
    distractionSeconds = 0;
  } else if (phase === 'work' && isRunning) {
    if (isDeep) {
      deepFocusSeconds += intervalSec;
      distractionSeconds = 0;
    } else {
      distractionSeconds += intervalSec;
      deepFocusSeconds = 0;
    }
  }

  // 确定状态
  let newState: FlowState;

  if (phase === 'short_break' || phase === 'long_break') {
    newState = 'break';
  } else if (!isRunning && phase === 'work') {
    // 未开始或暂停
    newState = prev.state === 'not_started' ? 'not_started' : 'shallow_focus';
  } else if (distractionSeconds >= DISTRACTED_THRESHOLD_SEC) {
    newState = 'distracted';
  } else if (deepFocusSeconds >= DEEP_FOCUS_THRESHOLD_SEC) {
    newState = 'deep_flow';
  } else if (phase === 'work' && isRunning) {
    newState = 'shallow_focus';
  } else {
    newState = 'not_started';
  }

  return {
    state: newState,
    enteredAt: prev.state !== newState ? Date.now() : prev.enteredAt,
    deepFocusSeconds,
    distractionSeconds,
  };
}

/**
 * 根据心流状态获取推荐音乐曲风
 */
export function getMusicForFlowState(state: FlowState): string {
  switch (state) {
    case 'deep_flow':
      return 'rain';      // 平稳雨声，维持深度专注
    case 'shallow_focus':
      return 'stream';    // 流水声，帮助进入状态
    case 'distracted':
      return 'campfire';  // 篝火声，舒缓平静
    case 'break':
      return 'morning-rhythm';  // 晨间韵律，促进心理脱离
    case 'not_started':
    default:
      return 'rain';
  }
}