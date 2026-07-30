/**
 * StartupRitual — 学习启动仪式容器（呼吸容器编排 + a11y，无业务副作用）
 * Startup ritual container (breathing orchestration + a11y, no side effects)
 *
 * @ai-context: v0.26.0 A2——BreathingProvider 包裹全程步骤区（RIT-01 呼吸即
 * 容器），相位/整圈事件经 useBreathGuideSound 驱动引导音（RIT-14）。完成
 * 后切入 'complete' 收尾屏（RitualComplete：今日卡/火种/光尘）。容器只做
 * 编排、受控状态与 a11y（RIT-22/24），副作用由页面层经 ritualService 执行。
 * @ai-context: BreathingProvider wraps all steps; completion switches to a
 * summary screen. Container does orchestration/state/a11y only.
 */
import { useState, useRef, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { LastSessionData, MicroGoal, QuickTag, RitualOutcome, RitualSkipScope, RitualPlan, MemoryEchoItem, RecallQuestion } from '../types';
import type { MasteryMark } from '@/types/ritual';
import { useRitualMachine } from '../hooks/useRitualMachine';
import { useRitualA11y } from '../hooks/useRitualA11y';
import { useBreathGuideSound } from '../hooks/useBreathGuideSound';
import { BreathingProvider } from './ritual/BreathingProvider';
import { RitualStepReview } from './ritual/RitualStepReview';
import { RitualStepGoal } from './ritual/RitualStepGoal';
import { RitualStepBreathing } from './ritual/RitualStepBreathing';
import { RitualComplete } from './ritual/RitualComplete';
import { RitualSkipMenu } from './ritual/RitualSkipMenu';
import { RitualFooter } from './ritual/RitualFooter';

interface Props {
  onComplete: (outcome: RitualOutcome) => void;
  onSkip: (scope: RitualSkipScope) => void;
  lastSession?: LastSessionData;
  quickTags?: QuickTag[];
  /** 含今天在内的火种连续天数（页面层预算） */
  streakDays?: number;
  /** 呼吸引导音初始开关（来自 RitualSettings.soundOn） */
  soundOn?: boolean;
  /** 静音开关变更回调（持久化到 RitualSettings） */
  onSoundToggle?: (on: boolean) => void;
  /** 自适应编排计划（B1.1，缺省走默认三步） */
  plan?: RitualPlan;
  /** 记忆回响时间线数据（B1.4） */
  recentEchoes?: MemoryEchoItem[];
  /** AI 回顾小问（B1.2）；null 时回退遮罩摘要 */
  recallQuestion?: RecallQuestion | null;
}

export default function StartupRitual(props: Props) {
  const {
    onComplete, onSkip, lastSession, quickTags = [], streakDays = 1,
    soundOn = false, onSoundToggle, plan, recentEchoes = [], recallQuestion = null,
  } = props;
  const machine = useRitualMachine(plan?.steps, plan?.planVariant);
  const [mastery, setMastery] = useState<MasteryMark | null>(null);
  const [goalText, setGoalText] = useState('');
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [cycleLit, setCycleLit] = useState(false);
  const [done, setDone] = useState(false);
  const [sound, setSound] = useState(soundOn);
  const cardRef = useRef<HTMLDivElement>(null);

  const { onPhaseChange, onCycleComplete } = useBreathGuideSound(sound);

  const buildOutcome = useCallback((): RitualOutcome => ({
    goal: goalText.trim() ? ({ text: goalText.trim(), tags: pickedTags } as MicroGoal) : undefined,
    masteryMark: mastery ?? undefined,
    durationMs: machine.getElapsedMs(),
    planVariant: machine.planVariant,
  }), [goalText, pickedTags, mastery, machine]);

  const handleNext = useCallback(() => {
    if (machine.isLast) { setDone(true); return; }
    machine.next();
  }, [machine]);

  const handlePickTag = useCallback((tag: QuickTag) => {
    setGoalText(tag.text);
    setPickedTags((prev) => (prev.includes(tag.text) ? prev : [...prev, tag.text]));
  }, []);

  const toggleSound = useCallback(() => {
    setSound((s) => { onSoundToggle?.(!s); return !s; });
  }, [onSoundToggle]);

  /* a11y：初始聚焦 + Esc/Enter 快捷键 + Tab 焦点陷阱（RIT-24） */
  const handleKeyDown = useRitualA11y(cardRef, () => onSkip('once'), handleNext);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="学习启动仪式"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md mx-4 backdrop-blur-xl bg-bg-elevated/80 rounded-kb-xl shadow-kb-lg border border-border/40 overflow-hidden outline-none"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-focus/[0.04] via-transparent to-accent-400/[0.03] pointer-events-none" />
        {!done && <RitualSkipMenu onSkip={onSkip} />}

        {/* 呼吸引导音开关（左上） */}
        {!done && (
          <button
            type="button"
            onClick={toggleSound}
            aria-label={sound ? '关闭呼吸引导音' : '开启呼吸引导音'}
            title={sound ? '关闭引导音' : '开启引导音'}
            className="absolute top-4 left-4 z-10 p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
          >
            {sound ? <Volume2 className="w-4 h-4" strokeWidth={1.5} /> : <VolumeX className="w-4 h-4" strokeWidth={1.5} />}
          </button>
        )}

        <BreathingProvider onPhaseChange={onPhaseChange} onCycleComplete={onCycleComplete}>
          <div className="relative px-8 pt-10 pb-8 flex flex-col gap-6">
            {done ? (
              <RitualComplete
                goal={buildOutcome().goal}
                masteryMark={mastery ?? undefined}
                streakDays={streakDays}
                onEnter={() => onComplete(buildOutcome())}
              />
            ) : (
              <>
                {machine.currentStep === 'review' && (
                  <RitualStepReview lastSession={lastSession} mastery={mastery} onMasteryChange={setMastery} recentEchoes={recentEchoes} recallQuestion={recallQuestion} />
                )}
                {machine.currentStep === 'goal' && (
                  <RitualStepGoal
                    goalText={goalText}
                    onGoalChange={setGoalText}
                    quickTags={quickTags}
                    onPickTag={handlePickTag}
                    onSubmit={handleNext}
                  />
                )}
                {machine.currentStep === 'breathing' && (
                  <RitualStepBreathing onFirstCycleComplete={() => setCycleLit(true)} />
                )}
                <RitualFooter
                  totalSteps={machine.steps.length}
                  stepIndex={machine.stepIndex}
                  isLast={machine.isLast}
                  cycleLit={cycleLit}
                  requireCycle={machine.isLast && machine.currentStep === 'breathing'}
                  onNext={handleNext}
                />
              </>
            )}
          </div>
        </BreathingProvider>
      </div>

      <style>{`
        @keyframes fade-in-up {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
