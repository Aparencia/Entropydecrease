/**
 * @ai-context: 通用组件：GoldenErrorPanel。
 * F4：新增“历史错误模式”折叠区——本地统计（summarizeGoldenErrors）常驻，
 * AI 模式分析（useAIErrorPattern）可选增强，失败时静默回退本地统计。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button } from '@/components/ui';
import { AlertTriangle, RotateCcw, Clock, ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAIErrorPattern } from '@/lib/ai/hooks/useAIErrorPattern';
import { getGoldenErrorRecords, summarizeGoldenErrors } from '../lib/goldenErrorQueries';
import type { GoldenError } from '@/types/models';
import type { ErrorPatternItem } from '@/lib/ai/types';

/**
 * Golden Error 面板
 * v0.9.0: 展示高自信答错的卡片列表，支持重新学习
 */

export interface GoldenErrorPanelProps {
  errors: GoldenError[];
  /** 将指定 golden error 卡片加入复习队列 */
  onRelearn?: (flashcardId: string) => void;
  /** 关闭面板 */
  onClose?: () => void;
}

/** 错误模式类型的中文标签与配色 */
const PATTERN_META: Record<ErrorPatternItem['type'], { label: string; className: string }> = {
  concept_blind: { label: '概念盲区', className: 'text-red-600 bg-red-50 border-red-200/50' },
  concept_confusion: { label: '概念混淆', className: 'text-orange-600 bg-orange-50 border-orange-200/50' },
  overconfidence: { label: '过度自信', className: 'text-amber-600 bg-amber-50 border-amber-200/50' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function GoldenErrorPanel({ errors, onRelearn, onClose }: GoldenErrorPanelProps) {
  const prefersReduced = useReducedMotion();
  const [patternOpen, setPatternOpen] = useState(false);
  const [stats, setStats] = useState<{ total: number; repeatCount: number; deckCount: number } | null>(null);
  const [aiRequested, setAiRequested] = useState(false);
  const { patterns, loading: aiLoading, analyze } = useAIErrorPattern();

  /** 展开/收起历史错误模式区；首次展开时加载本地统计并触发可选 AI 分析 */
  const togglePattern = () => {
    const next = !patternOpen;
    setPatternOpen(next);
    if (next && stats === null) {
      getGoldenErrorRecords(30).then((records) => {
        const s = summarizeGoldenErrors(records);
        setStats({
          total: s.total,
          repeatCount: Object.keys(s.repeatOffenders).length,
          deckCount: Object.keys(s.byDeck).length,
        });
        if (records.length > 0 && !aiRequested) {
          setAiRequested(true);
          analyze(records);
        }
      }).catch(() => { /* 本地查询失败时静默，不影响主列表 */ });
    }
  };

  if (errors.length === 0) return null;

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReduced ? { duration: 0.01 } : { type: 'spring', stiffness: 300, damping: 28 }}
      className="w-full"
    >
      <Card padding="md" className="border-amber-400/30 bg-amber-50/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-kb-md bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-b2 font-semibold text-text-primary">高自信错误</h3>
              <p className="text-c1 text-text-tertiary">
                这些是你很有信心但答错的题目，值得重点复习
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-all"
            >
              &times;
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {errors.map((error, idx) => (
            <motion.div
              key={`${error.flashcardId}-${error.timestamp}`}
              initial={prefersReduced ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                prefersReduced
                  ? { duration: 0.01 }
                  : { type: 'spring', stiffness: 350, damping: 28, delay: idx * 0.05 }
              }
              className={cn(
                'flex items-start gap-3 p-3 rounded-kb-md',
                'bg-bg-secondary/80 border border-border/30',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-b3 text-text-primary font-medium truncate">
                  {error.correctAnswer.slice(0, 80)}
                </p>
                {error.userAnswer && (
                  <p className="text-c1 text-semantic-error mt-0.5 truncate">
                    你的回答: {error.userAnswer}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Clock className="w-3 h-3 text-text-tertiary" strokeWidth={1.5} />
                  <span className="text-c1 text-text-tertiary font-mono">{formatTime(error.timestamp)}</span>
                </div>
              </div>
              {onRelearn && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onRelearn(error.flashcardId)}
                  className={cn(
                    'flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-kb-md',
                    'text-c1 font-medium text-amber-600',
                    'bg-amber-50 hover:bg-amber-100 border border-amber-200/50',
                    'transition-all duration-200',
                  )}
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                  重学
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>

        {errors.length > 0 && onRelearn && (
          <div className="flex justify-center mt-3">
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              onClick={() => errors.forEach((e) => onRelearn(e.flashcardId))}
            >
              全部重新学习
            </Button>
          </div>
        )}

        {/* F4: 历史错误模式折叠区 */}
        <div className="mt-3 border-t border-amber-200/40 pt-2">
          <button
            onClick={togglePattern}
            className="w-full flex items-center justify-between px-1 py-1.5 text-c1 font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
              历史错误模式（近 30 天）
            </span>
            <ChevronDown
              className={cn('w-3.5 h-3.5 text-text-tertiary transition-transform duration-200', patternOpen && 'rotate-180')}
              strokeWidth={1.5}
            />
          </button>

          <AnimatePresence initial={false}>
            {patternOpen && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: prefersReduced ? 0.01 : 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-2 space-y-2">
                  {stats === null && aiLoading && (
                    <div className="flex items-center gap-2 text-c1 text-text-tertiary px-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                      正在整理你的错误历史…
                    </div>
                  )}

                  {stats !== null && (
                    <p className="text-c1 text-text-secondary px-1">
                      近 30 天共 <span className="font-semibold text-amber-600">{stats.total}</span> 次高自信答错，
                      分布在 {stats.deckCount} 个牌组；
                      {stats.repeatCount > 0
                        ? <>其中 <span className="font-semibold text-amber-600">{stats.repeatCount}</span> 张卡片反复出错，建议优先攻克。</>
                        : '暂无反复出错的卡片，保持节奏即可。'}
                    </p>
                  )}

                  {aiLoading && stats !== null && (
                    <div className="flex items-center gap-2 text-c1 text-text-tertiary px-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                      AI 正在分析错误模式…
                    </div>
                  )}

                  {patterns?.summary && (
                    <p className="text-c1 text-text-primary px-3 py-2 rounded-kb-md bg-bg-secondary/60 border border-border/30">
                      {patterns.summary}
                    </p>
                  )}

                  {patterns?.patterns.map((p, idx) => {
                    const meta = PATTERN_META[p.type] ?? PATTERN_META.concept_blind;
                    return (
                      <div key={idx} className="p-3 rounded-kb-md bg-bg-secondary/80 border border-border/30">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-c1 font-semibold px-2 py-0.5 rounded-full border', meta.className)}>
                            {meta.label}
                          </span>
                          {p.keywords.map((kw) => (
                            <span key={kw} className="text-c1 text-text-tertiary">#{kw}</span>
                          ))}
                        </div>
                        <p className="text-c1 text-text-secondary mt-1.5">{p.explanation}</p>
                        <p className="text-c1 text-text-primary mt-1">💡 {p.suggestion}</p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}
