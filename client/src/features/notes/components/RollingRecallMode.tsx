/**
 * 滚书背诵法 — 4 轮渐进回忆模式
 *
 * @ai-context: 4 轮渐进式回忆：通读标记 → 精读理解 → 闭卷回忆 → 默写输出。
 * 进度跟踪器展示 4 轮，Fibonacci 间隔提示（1→2→3→5→8→13 天）。
 * 纯本地状态，无持久化。
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, BookMarked, Brain, Pencil, Check, ArrowRight, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

type RecallRound = 1 | 2 | 3 | 4;

const ROUND_META: Record<RecallRound, { label: string; icon: typeof BookOpen; desc: string; color: string }> = {
  1: { label: '通读标记', icon: BookOpen, desc: '通读笔记，标记关键点', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  2: { label: '精读理解', icon: BookMarked, desc: '精读并用自己的话总结理解', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  3: { label: '闭卷回忆', icon: Brain, desc: '合上笔记，凭记忆回答问题', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  4: { label: '默写输出', icon: Pencil, desc: '凭记忆完整默写', color: 'text-accent-500 bg-accent-500/10 border-accent-500/20' },
};

const FIBONACCI_HINTS = [1, 2, 3, 5, 8, 13];

/** 获取当前轮次对应的 Fibonacci 复习提示 */
function getFibonacciHint(round: RecallRound): string {
  const hints = FIBONACCI_HINTS.slice(0, round + 2);
  return `建议复习间隔：${hints.join(' → ')} 天`;
}

interface RollingRecallModeProps {
  noteContent: string;
  noteTitle?: string;
  className?: string;
  onClose?: () => void;
}

export default function RollingRecallMode({ noteContent, noteTitle, className, onClose }: RollingRecallModeProps) {
  const [currentRound, setCurrentRound] = useState<RecallRound>(1);
  const [completedRounds, setCompletedRounds] = useState<RecallRound[]>([]);
  // M3: ref 同步镜像 completedRounds——双击「完成本轮」时以 ref 实时判定当前轮
  // 是否已完成，避免闭包过期导致同轮重复完成、跳轮
  const completedRoundsRef = useRef<RecallRound[]>([]);

  // 与状态保持同步（restart 等路径）
  useEffect(() => {
    completedRoundsRef.current = completedRounds;
  }, [completedRounds]);
  const [keyPoints, setKeyPoints] = useState('');
  const [summary, setSummary] = useState('');
  const [recallAnswer, setRecallAnswer] = useState('');
  const [writeOutput, setWriteOutput] = useState('');

  const handleCompleteRound = () => {
    // M3: 双击防抖——当前轮已完成则直接忽略重复点击；setCurrentRound 使用 updater 形式
    if (completedRoundsRef.current.includes(currentRound)) return;
    completedRoundsRef.current = [...completedRoundsRef.current, currentRound] as RecallRound[];
    setCompletedRounds(completedRoundsRef.current);
    if (currentRound < 4) {
      setCurrentRound((round) => (round + 1) as RecallRound);
    }
  };

  const handleRestart = () => {
    setCurrentRound(1);
    setCompletedRounds([]);
    completedRoundsRef.current = [];
    setKeyPoints('');
    setSummary('');
    setRecallAnswer('');
    setWriteOutput('');
  };

  const allDone = completedRounds.length === 4;

  return (
    <div className={cn('flex flex-col rounded-2xl border border-border/20 bg-bg-elevated/50', className)}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold text-text-primary">{noteTitle || '滚书背诵法'}</span>
        </div>
        <div className="flex items-center gap-2">
          {allDone && (
            <button
              onClick={handleRestart}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
              重新开始
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-tertiary/30 transition-colors">
              <span className="text-text-tertiary text-[16px]">&times;</span>
            </button>
          )}
        </div>
      </div>

      {/* 进度跟踪器 */}
      <div className="px-4 py-3 border-b border-border/10">
        <div className="flex items-center justify-between">
          {([1, 2, 3, 4] as RecallRound[]).map((round, i) => {
            const meta = ROUND_META[round];
            const Icon = meta.icon;
            const isCompleted = completedRounds.includes(round);
            const isCurrent = currentRound === round && !isCompleted;

            return (
              <div key={round} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                      isCompleted
                        ? 'bg-emerald-500/20 text-emerald-500 border-2 border-emerald-500'
                        : isCurrent
                          ? meta.color + ' border-2'
                          : 'bg-bg-tertiary/30 text-text-tertiary border-2 border-border/20',
                    )}
                  >
                    {isCompleted ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Icon className="w-4 h-4" strokeWidth={1.5} />}
                  </div>
                  <span className={cn(
                    'text-[10px] mt-1',
                    isCompleted ? 'text-emerald-500 font-medium' : isCurrent ? 'text-text-primary font-medium' : 'text-text-tertiary',
                  )}>
                    {meta.label}
                  </span>
                </div>
                {i < 3 && (
                  <div className={cn(
                    'flex-1 h-px mx-2',
                    completedRounds.includes(round as RecallRound) ? 'bg-emerald-500/50' : 'bg-border/20',
                  )} />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-text-tertiary text-center mt-2">{getFibonacciHint(currentRound)}</p>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {allDone ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-emerald-500" strokeWidth={2} />
              </div>
              <h3 className="text-[16px] font-semibold text-text-primary mb-2">4 轮全部完成！</h3>
              <p className="text-[13px] text-text-secondary">
                知识已经深深印入你的大脑。按照 Fibonacci 间隔进行复习，记忆会更加牢固。
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={currentRound}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {/* Round 1: 通读标记 */}
              {currentRound === 1 && (
                <>
                  <div className="rounded-xl bg-bg-elevated/30 border border-border/10 p-3 max-h-[200px] overflow-y-auto">
                    <p className="text-[12px] text-text-secondary leading-relaxed whitespace-pre-wrap">{noteContent}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-tertiary mb-1">标记关键点（用逗号分隔）</p>
                    <textarea
                      value={keyPoints}
                      onChange={e => setKeyPoints(e.target.value)}
                      placeholder="记录你发现的关键知识点..."
                      rows={3}
                      className="w-full rounded-xl border border-border/20 bg-bg-elevated/30 p-3 text-[13px] text-text-primary placeholder:text-text-tertiary/60 outline-none resize-none focus:border-blue-500/40 transition-colors"
                    />
                  </div>
                </>
              )}

              {/* Round 2: 精读理解 */}
              {currentRound === 2 && (
                <>
                  <div className="rounded-xl bg-bg-elevated/30 border border-border/10 p-3 max-h-[150px] overflow-y-auto">
                    <p className="text-[12px] text-text-secondary leading-relaxed whitespace-pre-wrap">{noteContent}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-tertiary mb-1">用自己的话总结理解</p>
                    <textarea
                      value={summary}
                      onChange={e => setSummary(e.target.value)}
                      placeholder="尝试用自己的语言重新组织这段内容..."
                      rows={4}
                      className="w-full rounded-xl border border-border/20 bg-bg-elevated/30 p-3 text-[13px] text-text-primary placeholder:text-text-tertiary/60 outline-none resize-none focus:border-emerald-500/40 transition-colors"
                    />
                  </div>
                </>
              )}

              {/* Round 3: 闭卷回忆 */}
              {currentRound === 3 && (
                <div>
                  <p className="text-[11px] text-text-tertiary mb-2">
                    合上笔记，凭记忆回答：这段内容讲了什么？核心概念是什么？
                  </p>
                  <textarea
                    value={recallAnswer}
                    onChange={e => setRecallAnswer(e.target.value)}
                    placeholder="在不看原文的情况下，回忆并写下你的理解..."
                    rows={6}
                    className="w-full rounded-xl border border-border/20 bg-bg-elevated/30 p-3 text-[13px] text-text-primary placeholder:text-text-tertiary/60 outline-none resize-none focus:border-amber-500/40 transition-colors"
                  />
                </div>
              )}

              {/* Round 4: 默写输出 */}
              {currentRound === 4 && (
                <div>
                  <p className="text-[11px] text-text-tertiary mb-2">
                    终极挑战：凭记忆默写整段内容，尽可能接近原文。
                  </p>
                  <textarea
                    value={writeOutput}
                    onChange={e => setWriteOutput(e.target.value)}
                    placeholder="尽最大努力凭记忆写出完整内容..."
                    rows={8}
                    className="w-full rounded-xl border border-border/20 bg-bg-elevated/30 p-3 text-[13px] text-text-primary placeholder:text-text-tertiary/60 outline-none resize-none focus:border-accent-500/40 transition-colors"
                  />
                </div>
              )}

              {/* 完成本轮按钮 */}
              <button
                onClick={handleCompleteRound}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all',
                  currentRound === 1
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : currentRound === 2
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : currentRound === 3
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-cyber text-text-inverse hover:bg-cyber/90',
                )}
              >
                <Check className="w-4 h-4" strokeWidth={2} />
                完成本轮，进入下一轮
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}