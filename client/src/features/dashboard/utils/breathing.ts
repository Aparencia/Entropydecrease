/**
 * @ai-context: dashboard 功能模块：breathing。
 */
import type { BreathingPhase, BreathingState } from '../types';

/** 每阶段时长 4s，四阶段共 16s 一个循环 */
const PHASE_DURATION = 4000;
const TOTAL_CYCLE = 16000;

const PHASES: BreathingPhase[] = ['inhale', 'hold1', 'exhale', 'hold2'];

const PHASE_LABELS: Record<BreathingPhase, string> = {
  inhale: '吸气',
  hold1:  '屏息',
  exhale: '呼气',
  hold2:  '屏息',
};

/**
 * 根据经过的毫秒数计算当前呼吸阶段
 * @param elapsedMs 从动画开始起经过的毫秒数
 */
export function calculateBreathingPhase(elapsedMs: number): BreathingState {
  const cycleMs = elapsedMs % TOTAL_CYCLE;
  const cycleCount = Math.floor(elapsedMs / TOTAL_CYCLE);

  const phaseIndex = Math.min(Math.floor(cycleMs / PHASE_DURATION), 3);
  const phase = PHASES[phaseIndex];
  const phaseElapsed = cycleMs - phaseIndex * PHASE_DURATION;
  const phaseProgress = Math.min(phaseElapsed / PHASE_DURATION, 1);

  return {
    phase,
    phaseProgress,
    cycleCount,
    phaseLabel: PHASE_LABELS[phase],
  };
}
