/**
 * @ai-context: flashcards 功能模块页面：GenerativeReviewPage。
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Input, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useGenerativeReview, type ClozeMode } from '../hooks/useGenerativeReview';
import {
  ArrowLeft, BookOpen, Eye, RotateCcw, ChevronRight,
} from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { useNavigate } from 'react-router-dom';

/**
 * 生成式复习页面
 * v0.9.0: "先输入后揭示"模式 — 挖空文本 → 用户填写 → 揭示原文 → diff 对比高亮
 */
export default function GenerativeReviewPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const prefersReduced = useReducedMotion();

  const review = useGenerativeReview();

  // UI state
  const [inputText, setInputText] = useState('');
  const [clozeMode, setClozeMode] = useState<ClozeMode>('ratio');
  const [keywords, setKeywords] = useState('');
  const [ratio, setRatio] = useState(0.3);
  const [isInitialized, setIsInitialized] = useState(false);

  const springTransition = prefersReduced
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 300, damping: 28 };

  const handleInit = useCallback(() => {
    if (!inputText.trim()) {
      toast({ type: 'warning', message: '请输入要复习的文本内容' });
      return;
    }
    if (clozeMode === 'keyword' && !keywords.trim()) {
      toast({ type: 'warning', message: '请输入要挖空的关键词' });
      return;
    }
    review.initFromText(inputText, {
      mode: clozeMode,
      ratio,
      keywords: clozeMode === 'keyword' ? keywords.split(/[,，、\s]+/).filter(Boolean) : undefined,
    });
    setIsInitialized(true);
  }, [inputText, clozeMode, ratio, keywords, review, toast]);

  const handleReveal = useCallback(() => {
    const unfilled = review.clozeItems.filter((item) => !item.userInput.trim());
    if (unfilled.length > 0) {
      toast({ type: 'warning', message: `还有 ${unfilled.length} 个空未填写` });
    }
    review.reveal();
  }, [review, toast]);

  const handleReset = useCallback(() => {
    review.reset();
  }, [review]);

  const handleClearAll = useCallback(() => {
    review.clearAll();
    setIsInitialized(false);
    setInputText('');
  }, [review]);

  // Parse clozeText to render with placeholder inputs
  const renderClozeText = () => {
    if (!review.clozeText) return null;
    const parts: React.ReactNode[] = [];
    let remaining = review.clozeText;
    let partKey = 0;

    for (let i = 0; i < review.clozeItems.length; i++) {
      const placeholder = `___${i}___`;
      const idx = remaining.indexOf(placeholder);
      if (idx === -1) continue;

      // text before placeholder
      if (idx > 0) {
        parts.push(<span key={partKey++}>{remaining.slice(0, idx)}</span>);
      }

      const item = review.clozeItems[i];
      if (review.isRevealed) {
        // Show correct answer with diff coloring
        const isCorrect = item.userInput.trim().toLowerCase() === item.answer.trim().toLowerCase();
        parts.push(
          <span
            key={partKey++}
            className={cn(
              'inline-block px-1.5 py-0.5 rounded-kb-sm text-b2 font-medium',
              isCorrect
                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-400/30'
                : 'bg-rose-500/10 text-rose-600 border border-rose-400/30 line-through',
            )}
          >
            {item.answer}
          </span>,
        );
      } else {
        // Input field for user answer
        parts.push(
          <input
            key={partKey++}
            value={item.userInput}
            onChange={(e) => review.updateAnswer(i, e.target.value)}
            placeholder={`第${i + 1}空`}
            className={cn(
              'inline-block min-w-[60px] max-w-[160px] px-2 py-0.5 mx-0.5',
              'text-b2 font-medium text-center',
              'bg-brand-50/50 border-b-2 border-brand-400/50',
              'outline-none focus:border-brand-500 focus:bg-brand-50/80',
              'rounded-t-kb-sm transition-all duration-200',
            )}
            style={{ width: `${Math.max(item.answer.length * 1.2, 4)}ch` }}
          />,
        );
      }

      remaining = remaining.slice(idx + placeholder.length);
    }
    if (remaining) {
      parts.push(<span key={partKey++}>{remaining}</span>);
    }
    return parts;
  };

  // Accuracy percentage
  const accuracyPercent = review.accuracy !== null ? Math.round(review.accuracy * 100) : null;

  return (
    <motion.div
      className="flex flex-col h-full overflow-y-auto"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
      }}
    >
      {/* 顶栏 */}
      <motion.div
        className="flex items-center gap-3 px-kb-md py-3 flex-shrink-0 border-b border-border/30"
        variants={{ hidden: { opacity: 0, y: -10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      >
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <div className="flex-1">
          <h1 className="text-h2 font-semibold text-text-primary flex items-center gap-2">
            <ModuleRitualHeader title="生成式复习" sealChar="呼" sealColor="#7BC4B8" compact />
          </h1>
          <p className="text-c1 text-text-tertiary">先填写，后揭示 — 主动回忆加深记忆</p>
        </div>
      </motion.div>

      <div className="flex-1 px-kb-md py-kb-md max-w-2xl w-full mx-auto">
        {!isInitialized ? (
          /* ── 输入阶段 ── */
          <motion.div
            className="space-y-kb-md"
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: springTransition } }}
          >
            <Card padding="md" className="space-y-4">
              <div>
                <label className="text-b2 font-medium text-text-primary block mb-1.5">
                  输入复习内容
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="粘贴或输入你想要复习的文本内容..."
                  rows={6}
                  className={cn(
                    'w-full px-3 py-2.5 text-b2 rounded-kb-md',
                    'bg-bg-secondary border border-border/70',
                    'text-text-primary placeholder:text-text-tertiary',
                    'outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200/50',
                    'resize-y transition-all duration-200',
                  )}
                />
              </div>

              {/* 模式切换 */}
              <div>
                <label className="text-b2 font-medium text-text-primary block mb-1.5">挖空模式</label>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { if (clozeMode !== 'ratio') soundPlayer.play('ui_tab_switch'); setClozeMode('ratio'); }}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 px-3 rounded-kb-md border transition-all duration-200',
                      clozeMode === 'ratio'
                        ? 'bg-brand-500/10 border-brand-400/50 text-brand-600'
                        : 'bg-bg-secondary border-border/40 text-text-secondary hover:bg-bg-tertiary/40',
                    )}
                  >
                    <span className="text-b3 font-medium">按比例挖空</span>
                    <span className="text-c1 text-text-tertiary">随机挖空一定比例的词汇</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { if (clozeMode !== 'keyword') soundPlayer.play('ui_tab_switch'); setClozeMode('keyword'); }}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 px-3 rounded-kb-md border transition-all duration-200',
                      clozeMode === 'keyword'
                        ? 'bg-brand-500/10 border-brand-400/50 text-brand-600'
                        : 'bg-bg-secondary border-border/40 text-text-secondary hover:bg-bg-tertiary/40',
                    )}
                  >
                    <span className="text-b3 font-medium">按关键词挖空</span>
                    <span className="text-c1 text-text-tertiary">挖空指定的关键词</span>
                  </motion.button>
                </div>
              </div>

              {/* 模式配置 */}
              <AnimatePresence mode="wait">
                {clozeMode === 'ratio' ? (
                  <motion.div
                    key="ratio"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={springTransition}
                  >
                    <label className="text-b2 font-medium text-text-primary block mb-1.5">
                      挖空比例: {Math.round(ratio * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.7"
                      step="0.05"
                      value={ratio}
                      onChange={(e) => setRatio(parseFloat(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="keyword"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={springTransition}
                  >
                    <label className="text-b2 font-medium text-text-primary block mb-1.5">
                      关键词列表
                    </label>
                    <Input
                      placeholder="输入关键词，用逗号、顿号或空格分隔"
                      size="sm"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                onClick={handleInit}
                icon={<ChevronRight className="w-icon-sm h-icon-sm" strokeWidth={2} />}
                className="w-full"
              >
                开始生成式复习
              </Button>
            </Card>
          </motion.div>
        ) : (
          /* ── 复习阶段 ── */
          <motion.div
            className="space-y-kb-md"
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springTransition}
          >
            {/* 挖空文本区域 */}
            <Card padding="md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-b2 font-semibold text-text-primary flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
                  填写空白处
                </span>
                <span className="text-c1 text-text-tertiary">
                  {review.clozeItems.filter((i) => i.userInput.trim()).length}/{review.clozeItems.length} 已填写
                </span>
              </div>
              <div className={cn(
                'text-b1 leading-relaxed text-text-primary whitespace-pre-wrap',
                'p-4 rounded-kb-md bg-bg-secondary/60 border border-border/30',
              )}>
                {renderClozeText()}
              </div>
            </Card>

            {/* 揭示后的差异对比 */}
            <AnimatePresence>
              {review.isRevealed && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={springTransition}
                >
                  {/* 正确率面板 */}
                  <Card padding="md" className={cn(
                    'border-2',
                    accuracyPercent !== null && accuracyPercent >= 80
                      ? 'border-emerald-400/30 bg-emerald-50/20'
                      : accuracyPercent !== null && accuracyPercent >= 50
                        ? 'border-amber-400/30 bg-amber-50/20'
                        : 'border-rose-400/30 bg-rose-50/20',
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-b2 font-semibold text-text-primary">正确率</p>
                        <p className="text-c1 text-text-tertiary mt-0.5">
                          {review.stats.added} 处差异 / {review.stats.removed} 处遗漏 / {review.stats.unchanged} 处正确
                        </p>
                      </div>
                      <div className={cn(
                        'text-h1 font-bold',
                        accuracyPercent !== null && accuracyPercent >= 80
                          ? 'text-emerald-500'
                          : accuracyPercent !== null && accuracyPercent >= 50
                            ? 'text-amber-500'
                            : 'text-rose-500',
                      )}>
                        {accuracyPercent ?? 0}%
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              {!review.isRevealed ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleReset}
                    icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                    className="flex-1"
                  >
                    重置填写
                  </Button>
                  <Button
                    onClick={handleReveal}
                    icon={<Eye className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                    className="flex-1"
                  >
                    揭示答案
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleReset}
                    icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                    className="flex-1"
                  >
                    再试一次
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleClearAll}
                    className="flex-1"
                  >
                    更换内容
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
