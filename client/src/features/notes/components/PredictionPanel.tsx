/**
 * 预测驱动学习面板 — 从笔记工具栏触发，展示 AI 预测题卡片
 * FEAT-023
 *
 * @ai-context: 通用组件：PredictionPanel。
 */
import { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Send, ChevronRight, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIPredict } from '@/lib/ai/useAI';
import type { PredictionPrompt } from '@/lib/ai/types';
import { PredictionResult } from './PredictionResult';
import { db } from '@/lib/storage/database';
import type { PredictionRecord } from '@/types/models';

interface PredictionPanelProps {
  noteId: string;
  noteContent: string;
  onClose: () => void;
}

type Phase = 'idle' | 'loading' | 'guessing' | 'revealed';

interface PredictionItem extends PredictionPrompt {
  userGuess: string;
  accuracy?: 'correct' | 'partial' | 'incorrect';
}

/** 骨架屏 */
function SkeletonCards() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-kb-lg p-4 bg-bg-secondary/60 backdrop-blur-sm border border-border/30 animate-pulse"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="h-4 w-3/4 bg-bg-tertiary rounded-kb-sm mb-3" />
          <div className="h-3 w-1/2 bg-bg-tertiary rounded-kb-sm" />
        </div>
      ))}
    </div>
  );
}

export function PredictionPanel({ noteId, noteContent, onClose }: PredictionPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [historyRecords, setHistoryRecords] = useState<PredictionRecord[]>([]);
  const { loading, error, predict } = useAIPredict();

  // 加载该笔记的历史预测记录，用于跨会话回顾
  useEffect(() => {
    db.predictions
      .where('noteId')
      .equals(noteId)
      .reverse()
      .sortBy('createdAt')
      .then((records) => setHistoryRecords(records as PredictionRecord[]))
      .catch(() => { /* 加载历史记录失败不阻塞主流程 */ });
  }, [noteId]);

  const handleGenerate = useCallback(async () => {
    setPhase('loading');
    try {
      const result = await predict(noteId, noteContent);
      if (!result?.predictions?.length) {
        setPhase('idle');
        return;
      }
      const items: PredictionItem[] = result.predictions.map((p) => ({
        ...p,
        userGuess: '',
        accuracy: undefined,
      }));
      setPredictions(items);
      setPhase('guessing');
    } catch {
      setPhase('idle');
    }
  }, [noteId, noteContent, predict]);

  const handleGuessChange = useCallback((index: number, value: string) => {
    setPredictions((prev) =>
      prev.map((p, i) => (i === index ? { ...p, userGuess: value } : p)),
    );
  }, []);

  const handleReveal = useCallback(() => {
    setPredictions((prev) =>
      prev.map((p) => {
        if (!p.userGuess.trim()) return { ...p, accuracy: 'incorrect' as const };
        const guess = p.userGuess.toLowerCase().trim();
        const answer = p.expectedAnswer.toLowerCase().trim();
        // 简单的准确度判定：完全包含→correct，部分关键词匹配→partial，否则→incorrect
        if (answer.includes(guess) || guess.includes(answer)) {
          return { ...p, accuracy: 'correct' as const };
        }
        const guessWords = new Set(guess.split(/\s+/));
        const answerWords = answer.split(/\s+/);
        const matchRatio = answerWords.filter((w) => guessWords.has(w)).length / Math.max(answerWords.length, 1);
        if (matchRatio >= 0.3) return { ...p, accuracy: 'partial' as const };
        return { ...p, accuracy: 'incorrect' as const };
      }),
    );
    setPhase('revealed');
  }, []);

  // 揭示答案后将预测结果持久化到 IndexedDB，供跨会话回顾
  const handleRevealAndSave = useCallback(async () => {
    handleReveal();
    // 延迟保存以确保 predictions state 已更新为揭示后的状态
    setTimeout(async () => {
      try {
        const record: PredictionRecord = {
          id: crypto.randomUUID(),
          noteId,
          predictions: predictions.map((p) => ({
            question: p.question,
            expectedAnswer: p.expectedAnswer,
            difficulty: p.difficulty,
            relatedConcepts: p.relatedConcepts,
            userGuess: p.userGuess,
            accuracy: p.accuracy,
          })),
          createdAt: new Date(),
        };
        await db.predictions.put(record);
        // 将新记录追加到历史列表
        setHistoryRecords((prev) => [record, ...prev]);
      } catch {
        // 持久化失败不阻塞用户交互
      }
    }, 100);
  }, [handleReveal, noteId, predictions]);

  const allGuessed = predictions.length > 0 && predictions.every((p) => p.userGuess.trim().length > 0);

  return (
    <div
      className={cn(
        'fixed top-0 right-0 h-full w-full max-w-md z-50',
        'bg-bg-elevated/80 backdrop-blur-xl border-l border-border/40',
        'shadow-kb-lg flex flex-col',
        'animate-[kb-slide-in-right_0.3s_ease-out]',
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-kb-lg py-4 border-b border-border/40 flex-shrink-0">
        <h2 className="text-h3 font-semibold text-text-primary flex items-center gap-2">
          <Sparkles className="w-icon-md h-icon-md text-brand-500" strokeWidth={1.5} />
          预测驱动学习
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
          aria-label="关闭"
        >
          <X className="w-icon-md h-icon-md" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-kb-lg py-kb-md">
        {phase === 'idle' && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-kb-md text-center">
            <Sparkles className="w-10 h-10 text-brand-400/50" strokeWidth={1} />
            <p className="text-b2 text-text-secondary">
              AI 将根据你的笔记内容，预测你可能被问到的问题
            </p>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 rounded-kb-md text-b2 font-medium',
                'bg-brand-600 text-text-inverse shadow-kb-shadow-brand',
                'hover:bg-brand-700 active:scale-95 transition-all duration-kb-fast',
                loading && 'opacity-60 cursor-not-allowed',
              )}
            >
              <Sparkles className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
              {loading ? '生成中…' : '生成预测题'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-kb-md p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
            {error}
            <button onClick={handleGenerate} className="ml-2 underline text-brand-600 hover:text-brand-700">
              重试
            </button>
          </div>
        )}

        {phase === 'loading' && <SkeletonCards />}

        {(phase === 'guessing' || phase === 'revealed') && (
          <div className="flex flex-col gap-3">
            {predictions.map((pred, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-kb-lg p-4 border transition-all duration-kb-normal',
                  'bg-bg-elevated/60 backdrop-blur-sm',
                  phase === 'revealed' && pred.accuracy === 'correct'
                    ? 'border-[var(--kb-moss-green)]/40 bg-[var(--kb-moss-green)]/5'
                    : phase === 'revealed' && pred.accuracy === 'partial'
                      ? 'border-[var(--kb-amber)]/40 bg-[var(--kb-amber)]/5'
                      : 'border-border/30',
                )}
                style={{ animation: `stagger-in 0.3s ease-out ${idx * 75}ms both` }}
              >
                {/* 问题 */}
                <div className="flex items-start gap-2 mb-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-kb-full bg-brand-100 text-brand-600 text-c1 font-semibold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-b2 text-text-primary font-medium leading-relaxed">{pred.question}</p>
                </div>

                {/* 用户猜测输入 */}
                {phase === 'guessing' && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pred.userGuess}
                      onChange={(e) => handleGuessChange(idx, e.target.value)}
                      placeholder="写下你的猜测..."
                      className={cn(
                        'flex-1 px-3 py-2 rounded-kb-md text-b2',
                        'bg-bg-secondary border border-border/50',
                        'text-text-primary placeholder:text-text-tertiary/60',
                        'focus:outline-none focus:ring-2 focus:ring-brand-300/50 focus:border-brand-400',
                        'transition-all duration-kb-fast',
                      )}
                    />
                  </div>
                )}

                {/* 揭示后的对比 */}
                {phase === 'revealed' && (
                  <div className="flex flex-col gap-2 mt-1">
                    <div className="flex items-start gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-text-tertiary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-b3 text-text-tertiary mb-0.5">你的回答</p>
                        <p className="text-b2 text-text-secondary">{pred.userGuess || '（未作答）'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-brand-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-b3 text-text-tertiary mb-0.5">参考答案</p>
                        <p className="text-b2 text-text-primary">{pred.expectedAnswer}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 结果统计 */}
        {phase === 'revealed' && (
          <PredictionResult
            predictions={predictions.map((p) => ({
              question: p.question,
              userGuess: p.userGuess,
              aiAnswer: p.expectedAnswer,
              accuracy: p.accuracy,
            }))}
          />
        )}

        {/* 历史预测记录回顾 — 从 IndexedDB 加载的过往预测结果 */}
        {phase === 'idle' && historyRecords.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-1.5 mb-3">
              <History className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.5} />
              <span className="text-b3 text-text-tertiary font-medium">历史预测记录</span>
            </div>
            <div className="flex flex-col gap-2">
              {historyRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-kb-md p-3 bg-bg-secondary/40 border border-border/20"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-c1 text-text-tertiary">
                      {new Date(record.createdAt).toLocaleDateString()} {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-c1 text-brand-600 font-medium">
                      {record.predictions.filter((p) => p.accuracy === 'correct').length}/{record.predictions.length} 正确
                    </span>
                  </div>
                  <div className="text-c1 text-text-secondary/70 truncate">
                    {record.predictions.map((p) => p.question).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {phase === 'guessing' && (
        <div className="px-kb-lg py-3 border-t border-border/40 flex-shrink-0">
          <button
            onClick={handleRevealAndSave}
            disabled={!allGuessed}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-kb-md text-b2 font-medium',
              'transition-all duration-kb-fast',
              allGuessed
                ? 'bg-brand-600 text-text-inverse shadow-kb-shadow-brand hover:bg-brand-700 active:scale-[0.98]'
                : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
            )}
          >
            <Send className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
            提交猜测并揭示答案
          </button>
        </div>
      )}

      {phase === 'revealed' && (
        <div className="px-kb-lg py-3 border-t border-border/40 flex-shrink-0">
          <button
            onClick={() => { setPhase('idle'); setPredictions([]); }}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-kb-md text-b2 font-medium',
              'bg-bg-secondary text-text-secondary border border-border/50',
              'hover:bg-bg-tertiary hover:text-text-primary active:scale-[0.98]',
              'transition-all duration-kb-fast',
            )}
          >
            <Sparkles className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
            再来一轮
          </button>
        </div>
      )}
    </div>
  );
}
