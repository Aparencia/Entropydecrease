/**
 * 深化区 — Phase 3
 * 5 个纵深角度卡片，引导用户从不同维度深入理解概念
 *
 * @ai-context: 通用组件：DeepeningZone。
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { GitCompareArrows, Ban, Wrench, Landmark, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DeepeningAngle {
  key: string;
  label: string;
  question: string;
  icon: React.ReactNode;
  color: string;
}

interface DeepeningZoneProps {
  /** AI 生成的深化角度（可选覆盖默认） */
  customAngles?: DeepeningAngle[];
  /** 用户提交的深化回答 */
  onSubmit: (answers: Record<string, string>) => void;
  loading?: boolean;
}

const DEFAULT_ANGLES: DeepeningAngle[] = [
  { key: 'analogy', label: '类比', question: '这个概念像什么？能用生活中什么东西来比喻？', icon: <GitCompareArrows className="w-icon-sm h-icon-sm" strokeWidth={1.5} />, color: 'text-blue-500 bg-blue-500/10' },
  { key: 'counter', label: '反例', question: '什么情况下这个概念不成立？有例外吗？', icon: <Ban className="w-icon-sm h-icon-sm" strokeWidth={1.5} />, color: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
  { key: 'apply', label: '应用', question: '在实际生活或工作中，这个概念怎么用？', icon: <Wrench className="w-icon-sm h-icon-sm" strokeWidth={1.5} />, color: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
  { key: 'history', label: '历史', question: '这个概念是怎么来的？谁发现的？为什么？', icon: <Landmark className="w-icon-sm h-icon-sm" strokeWidth={1.5} />, color: 'text-cyan-600 bg-cyan-500/10 dark:text-cyan-400' },
  { key: 'debate', label: '争议', question: '关于这个概念，有什么不同的看法或争论？', icon: <Flame className="w-icon-sm h-icon-sm" strokeWidth={1.5} />, color: 'text-orange-600 bg-orange-500/10 dark:text-orange-400' },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.95 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as const },
  },
};

export default function DeepeningZone({ customAngles, onSubmit, loading }: DeepeningZoneProps) {
  const angles = customAngles ?? DEFAULT_ANGLES;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleToggle = (key: string) => {
    setExpandedKey(prev => prev === key ? null : key);
  };

  const handleAnswerChange = (key: string, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    // 过滤掉空回答
    const filtered = Object.fromEntries(
      Object.entries(answers).filter(([, v]) => v.trim().length > 0),
    );
    onSubmit(filtered);
  };

  const answeredCount = Object.values(answers).filter(v => v.trim().length > 0).length;

  return (
    <motion.div
      className="flex flex-col gap-kb-md"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {angles.map((angle) => {
        const isExpanded = expandedKey === angle.key;
        return (
          <motion.div
            key={angle.key}
            variants={cardVariants}
            className={cn(
              'rounded-kb-lg border overflow-hidden transition-all duration-kb-fast',
              isExpanded
                ? 'border-brand-500/40 bg-bg-elevated shadow-[var(--kb-shadow-brand)]'
                : 'border-border/40 bg-bg-elevated/80 hover:border-border/60',
            )}
          >
            {/* 卡片头部 */}
            <button
              onClick={() => handleToggle(angle.key)}
              className="w-full flex items-center gap-3 p-kb-md text-left"
            >
              <div className={cn('w-8 h-8 rounded-kb-md flex items-center justify-center', angle.color)}>
                {angle.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-b1 font-semibold text-text-primary">{angle.label}</h3>
                <p className="text-c1 text-text-tertiary truncate">{angle.question}</p>
              </div>
              <div className="flex items-center gap-2">
                {answers[angle.key]?.trim() && (
                  <span className="text-c1 text-emerald-500 font-medium">已答</span>
                )}
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-text-tertiary" />
                  : <ChevronDown className="w-4 h-4 text-text-tertiary" />
                }
              </div>
            </button>

            {/* 展开的输入区 */}
            {isExpanded && (
              <motion.div
                className="px-kb-md pb-kb-md"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                <textarea
                  value={answers[angle.key] ?? ''}
                  onChange={e => handleAnswerChange(angle.key, e.target.value)}
                  placeholder={angle.question}
                  rows={4}
                  className={cn(
                    'w-full p-3 rounded-kb-md',
                    'bg-bg-secondary border border-border/40',
                    'text-b2 text-text-primary placeholder:text-text-tertiary/60',
                    'outline-none resize-none',
                    'focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all duration-kb-fast',
                  )}
                />
              </motion.div>
            )}
          </motion.div>
        );
      })}

      {/* 提交按钮 */}
      <div className="flex items-center justify-between pt-kb-sm">
        <span className="text-c1 text-text-tertiary">
          已完成 {answeredCount}/{angles.length} 个角度
        </span>
        <button
          onClick={handleSubmit}
          disabled={answeredCount === 0 || loading}
          className={cn(
            'px-5 py-2.5 rounded-kb-md text-b2 font-medium transition-all duration-kb-fast',
            answeredCount > 0 && !loading
              ? 'bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.97] shadow-[var(--kb-shadow-brand)]'
              : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
          )}
        >
          {loading ? '保存中...' : `保存为浮出水面概念 (${answeredCount})`}
        </button>
      </div>
    </motion.div>
  );
}
