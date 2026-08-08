/**
 * 首潜引导条（L1）— 底部常驻微光伴航，带做完整学习循环
 *
 * @ai-context: 完成检测 = 轮询 checkProgress（数据基线差值），与各模块
 * UI 零耦合；轮询仅在 diving 阶段挂载（3s 间隔 + 窗口聚焦触发）。
 * 跳过用可见按钮而非 Esc——Esc 已被 AppLayout 用于退出模块，不抢占。
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';
import { DIVE_STEPS, getDiveStep, orderStepsByProfile } from './diveSteps';
import { getCurrentStep, useFirstDiveStore } from './useFirstDiveStore';
import { MicroLight } from './MicroLight';

const PROGRESS_POLL_MS = 3000;
const PRAISE_VISIBLE_MS = 4200;

export function FirstDiveGuide() {
  const { profile, completedSteps, justCompleted, checkProgress, skipDive, clearJustCompleted } =
    useFirstDiveStore();
  const startMiniDive = usePomodoroStore((s) => s.startMiniDive);
  const pomodoroRunning = usePomodoroStore((s) => s.isRunning);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [showPraise, setShowPraise] = useState(false);

  const currentStepId = getCurrentStep(profile, completedSteps);
  const currentStep = currentStepId ? getDiveStep(currentStepId) : null;
  const orderedSteps = useMemo(
    () => (profile ? orderStepsByProfile(profile) : DIVE_STEPS),
    [profile],
  );

  // ── 进度轮询：仅 diving 阶段挂载 ──
  useEffect(() => {
    const timer = setInterval(() => { checkProgress().catch(() => {}); }, PROGRESS_POLL_MS);
    const onFocus = () => { checkProgress().catch(() => {}); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [checkProgress]);

  // ── praise 展示：步骤刚完成时露出几秒 ──
  useEffect(() => {
    if (!justCompleted) return;
    setShowPraise(true);
    const timer = setTimeout(() => {
      setShowPraise(false);
      clearJustCompleted();
    }, PRAISE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [justCompleted, clearJustCompleted]);

  const onPrimaryAction = () => {
    if (!currentStep) return;
    if (!pathname.startsWith(currentStep.route)) {
      navigate(currentStep.route);
      return;
    }
    // 已在深潜页且当前步骤是迷你潜水 → 直接替用户按下开始
    if (currentStep.id === 'pomodoro' && !pomodoroRunning) {
      startMiniDive();
    }
  };

  const primaryLabel = (() => {
    if (!currentStep) return '';
    if (!pathname.startsWith(currentStep.route)) return '带我去';
    if (currentStep.id === 'pomodoro') return pomodoroRunning ? '潜水中…' : '开始 3 分钟迷你深潜';
    return '就在这页，试试吧';
  })();

  const praiseText = justCompleted ? getDiveStep(justCompleted).praise : '';

  return (
    <motion.div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] w-[min(560px,calc(100vw-2rem))]"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.5, ease: [0, 0, 0.2, 1] }}
    >
      <div className={cn(
        'rounded-2xl px-5 py-4',
        'bg-[#0A1826]/92 backdrop-blur-2xl border border-cyber/15',
        'shadow-[0_8px_32px_rgba(4,10,20,0.5),0_0_24px_rgba(6,182,212,0.08)]',
      )}>
        <AnimatePresence mode="wait">
          {showPraise ? (
            /* 步骤完成的回应 */
            <motion.div
              key="praise"
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <MicroLight size={16} />
              <p className="text-[13px] text-cyber/85 leading-relaxed">{praiseText}</p>
            </motion.div>
          ) : currentStep ? (
            /* 当前步骤引导 */
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <div className="flex items-start gap-3">
                <MicroLight size={16} className="mt-1" />
                <p className="flex-1 text-[13px] text-white/80 leading-relaxed">
                  {currentStep.instruction}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-3">
                {/* 潜航进度点 */}
                <div className="flex items-center gap-1.5 mr-auto" aria-label="首潜进度">
                  {orderedSteps.map((s) => (
                    <span
                      key={s.id}
                      title={s.title}
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-500',
                        completedSteps.includes(s.id)
                          ? 'w-5 bg-cyber/80'
                          : s.id === currentStep.id
                            ? 'w-3.5 bg-cyber/40 animate-pulse'
                            : 'w-1.5 bg-white/15',
                      )}
                    />
                  ))}
                </div>
                <button
                  onClick={skipDive}
                  className="text-[12px] text-white/30 hover:text-white/60 transition-colors px-2 py-1.5"
                >
                  先跳过
                </button>
                <button
                  onClick={onPrimaryAction}
                  disabled={currentStep.id === 'pomodoro' && pomodoroRunning && pathname.startsWith(currentStep.route)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium',
                    'bg-cyber/90 text-text-inverse hover:bg-cyber transition-colors',
                    'shadow-[0_2px_12px_rgba(6,182,212,0.35)]',
                    'disabled:opacity-50 disabled:pointer-events-none',
                  )}
                >
                  {currentStep.id === 'pomodoro' && pathname.startsWith(currentStep.route)
                    ? <Play className="w-3.5 h-3.5" strokeWidth={2} />
                    : <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />}
                  {primaryLabel}
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
