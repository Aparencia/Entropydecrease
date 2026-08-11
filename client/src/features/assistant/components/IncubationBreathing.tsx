/**
 * T4 孵化呼吸引导浮层 — 卡壳后的 3 分钟轻体力放松
 * Incubation breathing overlay — 3-minute micro-break after getting stuck
 *
 * @ai-context: 复用仪式呼吸组件（BreathingProvider + RitualStepBreathing），
 * 不重造 RAF 循环。3 分钟自动倒计时（可提前关闭，可逆原则）；完成时
 * 静默提示"随时回到任务"。降级模式（reduced-motion/低帧）由 Provider
 * 内部处理为 1Hz 倒计时圆环。
 * @ai-context: Reuses the ritual breathing stack (single RAF source); a
 * 3-minute countdown with early-close keeps the break reversible.
 */
import { useEffect, useState } from 'react';
import { Wind, X, Check } from 'lucide-react';
import { BreathingProvider } from '@/features/dashboard/components/ritual/BreathingProvider';
import { RitualStepBreathing } from '@/features/dashboard/components/ritual/RitualStepBreathing';
import { Button } from '@/components/ui';

/** 孵化休息时长（秒）：3 分钟轻体力引导 */
const INCUBATION_SECONDS = 180;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function IncubationBreathing({ open, onClose }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(INCUBATION_SECONDS);
  const [finished, setFinished] = useState(false);

  // 打开时重置倒计时
  useEffect(() => {
    if (open) {
      setSecondsLeft(INCUBATION_SECONDS);
      setFinished(false);
    }
  }, [open]);

  // 3 分钟倒计时（挂起/后台时自然减速，不强求精确）
  useEffect(() => {
    if (!open || finished) return;
    const timer = setTimeout(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setFinished(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [open, finished, secondsLeft]);

  if (!open) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="bg-bg-primary/95 fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 p-6 backdrop-blur-2xl">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 text-focus">
          <Wind className="w-5 h-5" strokeWidth={1.5} />
          <span className="text-b1 font-semibold text-text-primary">孵化时刻</span>
        </div>
        <p className="max-w-xs text-center text-c1 text-text-secondary">
          卡壳不是停滞，是潜意识在孵化。用 3 分钟呼吸放松，让思路自己浮上来。
        </p>
      </div>

      <BreathingProvider>
        <RitualStepBreathing onFirstCycleComplete={() => { /* 首圈完成仅点亮视觉，无需额外动作 */ }} />
      </BreathingProvider>

      {!finished ? (
        <div className="flex flex-col items-center gap-3">
          {/* 倒计时条 */}
          <div className="h-1 w-64 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-500 to-brand-500 transition-all duration-1000"
              style={{ width: `${(secondsLeft / INCUBATION_SECONDS) * 100}%` }}
            />
          </div>
          <span className="text-c1 text-text-tertiary tabular-nums">
            {minutes}:{String(seconds).padStart(2, '0')} · 随时可提前回到任务
          </span>
          <Button variant="ghost" size="sm" icon={<X className="w-3.5 h-3.5" />} onClick={onClose}>
            回到任务
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="w-4 h-4" />
            <span className="text-b2 font-medium">放松完成——现在回到任务，思路会更清晰</span>
          </div>
          <Button variant="primary" size="md" onClick={onClose}>
            回到任务
          </Button>
        </div>
      )}
    </div>
  );
}
