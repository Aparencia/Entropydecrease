/**
 * RitualStepReview — 回顾闪回步骤（记忆挑战卡 + 掌握标记）
 * Review flashback step (memory challenge card + mastery marks)
 *
 * @ai-context: RIT-05 主动提取——摘要默认毛玻璃遮罩，3s 倒计时或点击后
 * 揭示（测试效应）；RIT-06 三档掌握标记为受控状态由容器持有，揭示前后
 * 均可标记。本组件无副作用，数据经 props 注入。
 * @ai-context: RIT-05 active retrieval: excerpt starts blurred, revealed
 * by click or a 3s countdown. Mastery mark is controlled state owned by
 * the container. No side effects; data injected via props.
 */
import { useState, useEffect } from 'react';
import { BookOpen, Check, LineSquiggle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LastSessionData, MemoryEchoItem, RecallQuestion } from '../../types';
import type { MasteryMark } from '@/types/ritual';
import { MemoryEcho } from './MemoryEcho';

interface Props {
  lastSession?: LastSessionData;
  mastery: MasteryMark | null;
  onMasteryChange: (mark: MasteryMark) => void;
  /** 记忆回响时间线数据（B1.4，可空） */
  recentEchoes?: MemoryEchoItem[];
  /** AI 回顾小问（B1.2）；为空/null 时回退遮罩摘要基线（RIT-05） */
  recallQuestion?: RecallQuestion | null;
}

/** 遮罩自动揭示倒计时（秒），验收 A1.4：点击或 3s 倒计时后揭示 */
const REVEAL_COUNTDOWN_S = 3;

const MASTERY_OPTIONS: { mark: MasteryMark; icon: typeof Check; label: string; color: string }[] = [
  { mark: 'mastered',   icon: Check,        label: '已掌握', color: 'text-moss' },
  { mark: 'fuzzy',      icon: LineSquiggle, label: '模糊',   color: 'text-amber' },
  { mark: 'unmastered', icon: X,            label: '未掌握', color: 'text-semantic-error' },
];

export function RitualStepReview({ lastSession, mastery, onMasteryChange, recentEchoes = [], recallQuestion }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [countdown, setCountdown] = useState(REVEAL_COUNTDOWN_S);

  // 3s 倒计时自动揭示（每秒一次 setState，揭示后停止）
  useEffect(() => {
    if (revealed || !lastSession) return;
    if (countdown <= 0) { setRevealed(true); return; }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, revealed, lastSession]);

  return (
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

          {/* AI 回顾小问（B1.2）：先自问自答唤醒记忆，无则回退遮罩摘要 */}
          {recallQuestion && (
            <div className="rounded-kb-md border border-focus/30 bg-focus/5 p-3 flex flex-col gap-1.5">
              <p className="text-xs text-focus font-medium">💡 先回答这个问题</p>
              <p className="text-sm text-text-primary leading-snug">{recallQuestion.question}</p>
              {recallQuestion.reference && (
                <details className="text-xs text-text-tertiary">
                  <summary className="cursor-pointer hover:text-text-secondary">查看参考要点</summary>
                  <p className="mt-1 leading-snug">{recallQuestion.reference}</p>
                </details>
              )}
            </div>
          )}

          {/* 记忆挑战卡：遮罩态 → 揭示态 */}
          <button
            type="button"
            onClick={() => setRevealed(true)}
            disabled={revealed}
            aria-label={revealed ? undefined : '点击揭示上次学习内容'}
            className={cn('relative text-left rounded-kb-md', !revealed && 'cursor-pointer')}
          >
            <p
              aria-hidden={!revealed}
              className={cn(
                'text-sm text-text-secondary leading-relaxed line-clamp-4 transition-all duration-500',
                !revealed && 'blur-sm select-none opacity-70',
              )}
            >
              …{lastSession.noteExcerpt}
            </p>
            {!revealed && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="px-3 py-1.5 rounded-kb-full bg-bg-elevated/90 border border-border/60 text-xs text-text-secondary shadow-kb-sm">
                  先回忆一下内容…（{countdown}s 后揭示，点击立即查看）
                </span>
              </span>
            )}
          </button>

          {/* 掌握标记（揭示前后均可用） */}
          <div className="flex gap-2 mt-1" role="radiogroup" aria-label="掌握程度">
            {MASTERY_OPTIONS.map(({ mark, icon: Icon, label, color }) => (
              <button
                key={mark}
                type="button"
                role="radio"
                aria-checked={mastery === mark}
                onClick={() => onMasteryChange(mark)}
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
          <p className="text-xs text-text-tertiary">
            标记为「模糊 / 未掌握」会自动为你安排一张今日复习卡
          </p>
        </div>
      ) : (
        <div className="rounded-kb-lg border border-dashed border-border/60 p-6 text-center">
          <p className="text-sm text-text-tertiary">还没有学习记录，开始新旅程吧 ✨</p>
        </div>
      )}

      {/* 记忆回响时间线（B1.4） */}
      <MemoryEcho items={recentEchoes} />
    </div>
  );
}
