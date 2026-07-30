/**
 * useBreathGuideSound — 呼吸引导音播放 gate / Breath guide sound gate
 *
 * @ai-context: RIT-14（决策 8）——将 BreathingProvider 的相位/整圈事件映射
 * 为引导音播放。双重 gate：仅在 enabled（仪式内静音开关）为真时播放，且
 * 播放走 soundPlayer.play（尊重全局音效设置/静音）。返回相位与整圈两个
 * 回调，供 Provider 的 onPhaseChange/onCycleComplete 使用。
 * @ai-context: Maps breathing phase/cycle events to guide sounds; gated by
 * an in-ritual toggle and the global sound settings.
 */
import { useCallback } from 'react';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { BreathingPhase } from '../types';

const PHASE_SOUND: Record<BreathingPhase, string> = {
  inhale: 'ritual_breath_inhale',
  hold1: 'ritual_breath_hold',
  exhale: 'ritual_breath_exhale',
  hold2: 'ritual_breath_hold',
};

export function useBreathGuideSound(enabled: boolean) {
  const onPhaseChange = useCallback((phase: BreathingPhase) => {
    if (!enabled) return;
    soundPlayer.play(PHASE_SOUND[phase], { throttleMs: 0 });
  }, [enabled]);

  const onCycleComplete = useCallback(() => {
    if (!enabled) return;
    soundPlayer.play('ritual_breath_cycle', { throttleMs: 0 });
  }, [enabled]);

  return { onPhaseChange, onCycleComplete };
}
