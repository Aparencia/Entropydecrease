/**
 * @ai-context: 通用组件：StartupRitual。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, Target, Wind, Check, LineSquiggle, X, ChevronRight, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MicroGoal, LastSessionData, MasteryMark, RitualStep } from '../types';
import { calculateBreathingPhase } from '../utils/breathing';

interface Props {
  onComplete: (goal?: MicroGoal) => void;
  onSkip: () => void;
  lastSession?: LastSessionData;
}

const STEPS: RitualStep[] = ['review', 'goal', 'breathing'];

/* ── 掌握标记按钮 ── */
const MASTERY_OPTIONS: { mark: MasteryMark; icon: typeof Check; label: string; color: string }[] = [
  { mark: 'mastered',   icon: Check,    label: '已掌握', color: 'text-moss' },
  { mark: 'fuzzy',      icon: LineSquiggle,    label: '模糊',   color: 'text-amber' },
  { mark: 'unmastered', icon: X,        label: '未掌握', color: 'text-semantic-error' },
];

export default function StartupRitual({ onComplete, onSkip, lastSession }: Props) {
  const [step, setStep] = useState(0);
  const [mastery, setMastery] = useState<MasteryMark | null>(null);
  const [goalText, setGoalText] = useState('');
  const [breathingElapsed, setBreathingElapsed] = useState(0);

  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  /* ── 呼吸动画 RAF ── */
  useEffect(() => {
    if (step !== 2) return;
    startRef.current = performance.now();
    function tick(now: number) {
      setBreathingElapsed(now - startRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [step]);

  const breathing = calculateBreathingPhase(breathingElapsed);

  const next = useCallback(() => {
    if (step < 2) { setStep((s) => s + 1); return; }
    // 最后一步完成
    const goal: MicroGoal | undefined = goalText.trim()
      ? { text: goalText.trim(), tags: [] }
      : undefined;
    onComplete(goal);
  }, [step, goalText, onComplete]);

  const currentStep = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm">
      {/* 玻璃拟态主卡片 */}
      <div className="relative w-full max-w-md mx-4 backdrop-blur-xl bg-bg-elevated/80 rounded-kb-xl shadow-kb-lg border border-border/40 overflow-hidden">
        {/* 顶部渐变蒙版 */}
        <div className="absolute inset-0 bg-gradient-to-br from-focus/[0.04] via-transparent to-accent-400/[0.03] pointer-events-none" />

        {/* 跳过按钮 */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
          title="跳过仪式"
        >
          <SkipForward className="w-4 h-4" strokeWidth={1.5} />
        </button>

        <div className="relative px-8 pt-10 pb-8 flex flex-col gap-6">
          {/* ── Step 1: 回顾闪回 ── */}
          {currentStep === 'review' && (
            <div className="flex flex-col gap-5 animate-[fade-in-up_0.4s_ease-out]">
              <div className="flex items-center gap-2 text-focus">
                <BookOpen className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-sm font-semibold">回顾闪回</span>
              </div>
              {lastSession ? (
                <div className="rounded-kb-lg border border-border/50 bg-bg-secondary/30 p-5 flex flex-col gap-3">
                  <p className="text-xs text-text-tertiary uppercase tracking-wide">上次学到</p>
                  <h3 className="text-base font-semibold text-text-primary leading-tight">
                    {lastSession.noteTitle}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed line-clamp-4">
                    …{lastSession.noteExcerpt}
                  </p>
                  {/* 掌握标记 */}
                  <div className="flex gap-2 mt-1">
                    {MASTERY_OPTIONS.map(({ mark, icon: Icon, label, color }) => (
                      <button
                        key={mark}
                        onClick={() => setMastery(mark)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-kb-full text-xs font-medium border transition-all duration-200',
                          mastery === mark
                            ? `${color} border-current bg-current/10`
                            : 'text-text-tertiary border-border hover:border-text-tertiary',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-kb-lg border border-dashed border-border/60 p-6 text-center">
                  <p className="text-sm text-text-tertiary">还没有学习记录，开始新旅程吧 ✨</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: 微目标 ── */}
          {currentStep === 'goal' && (
            <div className="flex flex-col gap-5 animate-[fade-in-up_0.4s_ease-out]">
              <div className="flex items-center gap-2 text-focus">
                <Target className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-sm font-semibold">设定微目标</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                  placeholder="本次我要完成 ____"
                  autoFocus
                  className={cn(
                    'w-full px-4 py-3.5 rounded-kb-lg',
                    'bg-bg-secondary/40 border border-border/60',
                    'text-text-primary text-sm placeholder:text-text-tertiary/70',
                    'outline-none focus:border-focus/60 focus:ring-2 focus:ring-focus/20',
                    'transition-all duration-200',
                  )}
                />
              </div>
              <p className="text-xs text-text-tertiary">写下一个具体、可衡量的小目标，帮助自己聚焦注意力</p>
            </div>
          )}

          {/* ── Step 3: Box Breathing ── */}
          {currentStep === 'breathing' && (
            <div className="flex flex-col gap-5 items-center animate-[fade-in-up_0.4s_ease-out]">
              <div className="flex items-center gap-2 text-focus">
                <Wind className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-sm font-semibold">Box Breathing</span>
              </div>

              {/* 方形呼吸动画区 */}
              <div className="relative w-44 h-44 my-2">
                {/* 方形轨道（虚线） */}
                <div className="absolute inset-2 rounded-kb-sm border border-dashed border-focus/20" />

                {/* 移动方块 — CSS @keyframes 方形路径 */}
                <div
                  className="absolute w-5 h-5 rounded-kb-sm bg-focus shadow-[0_0_16px_rgba(59,130,246,0.5)]"
                  style={{
                    animation: 'box-breath-path 16s linear infinite',
                    willChange: 'transform',
                    top: 0,
                    left: 0,
                  }}
                />

                {/* 中心阶段文字 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    key={breathing.phase}
                    className="text-xl font-semibold text-focus animate-[fade-in-up_0.3s_ease-out]"
                  >
                    {breathing.phaseLabel}
                  </span>
                  <span className="text-xs text-text-tertiary mt-1 tabular-nums">
                    第 {breathing.cycleCount + 1} 圈
                  </span>
                </div>
              </div>

              <p className="text-xs text-text-tertiary text-center max-w-xs">
                跟随方块的节奏：吸气 4 秒 → 屏息 4 秒 → 呼气 4 秒 → 屏息 4 秒
              </p>
            </div>
          )}

          {/* ── 底部操作区 ── */}
          <div className="flex items-center justify-between pt-2">
            {/* 步骤指示器 */}
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-all duration-300',
                    i === step
                      ? 'bg-focus w-4'
                      : i < step
                        ? 'bg-focus/50'
                        : 'bg-border',
                  )}
                />
              ))}
            </div>

            <button
              onClick={next}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-kb-full text-sm font-medium',
                'bg-focus text-white',
                'hover:bg-focus/90 active:scale-95',
                'transition-all duration-200',
              )}
            >
              {step === 2 ? '开始学习' : '下一步'}
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* CSS @keyframes 注入（方形路径 translate 动画） */}
      <style>{`
        @keyframes box-breath-path {
          0%   { transform: translate(0, 0); }
          25%  { transform: translate(calc(100% + 128px), 0); }
          50%  { transform: translate(calc(100% + 128px), calc(100% + 128px)); }
          75%  { transform: translate(0, calc(100% + 128px)); }
          100% { transform: translate(0, 0); }
        }
        @keyframes fade-in-up {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
