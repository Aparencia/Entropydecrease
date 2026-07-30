/**
 * RitualStepBreathing — Box Breathing 步骤（消费呼吸容器 + 生命体 + 呼气寄语）
 * Box breathing step (consumes BreathingProvider + creature + whispers)
 *
 * @ai-context: v0.26.0 A2——不再自持 RAF，改为消费 BreathingProvider 的
 * useBreathing（单一 RAF 源，RIT-01/23）。标准模式渲染主题化生命体
 * BreathingCreature（RIT-13）+ 呼气相位寄语（RIT-20）；降级模式（reduced
 * -motion/低帧）自跑 1Hz 倒计时圆环（RIT-16）。首圈完成经 onFirstCycle
 * Complete 通知容器点亮按钮（RIT-17）。
 * @ai-context: Consumes the single-RAF breathing context; standard mode
 * shows the themed creature + exhale whisper, degraded mode shows a 1Hz
 * countdown ring. First cycle notifies the container.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { Wind } from 'lucide-react';
import { useBreathing, CYCLE_MS } from './breathingContext';
import { BreathingCreature } from './BreathingCreature';
import { pickWhisper } from '../../utils/breathWhispers';

interface Props {
  /** 首圈完成时回调一次（RIT-17 一圈点亮） */
  onFirstCycleComplete: () => void;
}

export function RitualStepBreathing({ onFirstCycleComplete }: Props) {
  const { breathing, completedCycles, degraded } = useBreathing();
  const [secondsLeft, setSecondsLeft] = useState(CYCLE_MS / 1000);
  const notifiedRef = useRef(false);

  // 呼气相位寄语（每次呼气取一条，随圈数递增避免重复）
  const whisper = useMemo(
    () => pickWhisper(completedCycles),
    [completedCycles],
  );

  /* ── 标准模式：监听 Provider 的整圈计数 ── */
  useEffect(() => {
    if (degraded) return;
    if (completedCycles >= 1 && !notifiedRef.current) {
      notifiedRef.current = true;
      onFirstCycleComplete();
    }
  }, [degraded, completedCycles, onFirstCycleComplete]);

  /* ── 降级模式：自跑 1Hz 倒计时（RIT-16） ── */
  useEffect(() => {
    if (!degraded) return;
    if (secondsLeft <= 0) {
      if (!notifiedRef.current) { notifiedRef.current = true; onFirstCycleComplete(); }
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [degraded, secondsLeft, onFirstCycleComplete]);

  return (
    <div className="flex flex-col gap-5 items-center animate-[fade-in-up_0.4s_ease-out]">
      <div className="flex items-center gap-2 text-focus">
        <Wind className="w-5 h-5" strokeWidth={1.5} />
        <span className="text-sm font-semibold">Box Breathing</span>
      </div>

      {degraded ? (
        /* ── 降级：静态倒计时圆环 ── */
        <div className="relative w-44 h-44 my-2 flex items-center justify-center">
          <div className="absolute inset-2 rounded-full border-2 border-focus/20" />
          <div className="flex flex-col items-center" aria-live="polite">
            <span className="text-3xl font-semibold text-focus tabular-nums">{secondsLeft}</span>
            <span className="text-xs text-text-tertiary mt-1">秒后完成一圈呼吸</span>
          </div>
        </div>
      ) : (
        /* ── 标准：主题化生命体 + 相位文字 ── */
        <div className="relative w-44 h-44 my-2">
          <BreathingCreature />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span
              key={breathing.phase + completedCycles}
              aria-live="polite"
              className="text-xl font-semibold text-focus animate-[fade-in-up_0.3s_ease-out]"
            >
              {breathing.phaseLabel}
            </span>
            <span className="text-xs text-text-tertiary mt-1 tabular-nums">
              第 {completedCycles + 1} 圈
            </span>
          </div>
        </div>
      )}

      {/* 呼气相位寄语（仅呼气时淡入，RIT-20） */}
      <p className="text-xs text-focus/70 text-center max-w-xs h-4 transition-opacity duration-500">
        {!degraded && breathing.phase === 'exhale' ? whisper : ''}
      </p>

      <p className="text-xs text-text-tertiary text-center max-w-xs">
        跟随节奏：吸气 4 秒 → 屏息 4 秒 → 呼气 4 秒 → 屏息 4 秒
      </p>
    </div>
  );
}
