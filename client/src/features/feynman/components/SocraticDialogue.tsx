/**
 * 苏格拉底追问对话 UI — 苏格拉底对话风格重构
 * 品牌色聊天气泡 + AI思考波浪动画 + 多维反馈卡片
 *
 * @ai-context: 2026-07 拆分——雷达图/反馈卡片/详细评分在 SocraticFeedback；
 * 本文件保留对话气泡（AI 左侧/用户右侧）、思考波浪与输入区。
 * Enter 提交、Shift+Enter 换行为输入契约。
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/animation/springConfig';
import type { SocraticRound } from '../types';
import { MultiFeedbackCard, DimensionDetail } from './SocraticFeedback';

interface SocraticDialogueProps {
  rounds: SocraticRound[];
  currentRound: number;
  maxRounds: number;
  onSubmitAnswer: (answer: string) => void;
  loading: boolean;
  /** 当所有轮次完成时为 true */
  completed?: boolean;
}

function RoundBubble({ round }: { round: SocraticRound }) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <motion.div
      className="flex flex-col gap-kb-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.default}
    >
      {/* AI 问题气泡（左侧）— 品牌色背景圆角气泡 */}
      <div className="flex items-start gap-2.5 max-w-[88%]">
        <motion.div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-brand-500/20"
          whileHover={{ scale: 1.1 }}
        >
          <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
        </motion.div>
        <div className={cn(
          'px-4 py-3 rounded-2xl rounded-tl-md',
          'bg-brand-50/80 dark:bg-brand-950/40 border border-brand-200/30 dark:border-brand-700/30',
          'text-b2 text-text-primary leading-relaxed',
          'shadow-sm',
        )}>
          {round.aiQuestion}
        </div>
      </div>

      {/* 用户回答气泡（右侧） */}
      {round.userAnswer && (
        <motion.div
          className="flex items-start gap-2 max-w-[85%] self-end"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={SPRING.default}
        >
          <div
            className={cn(
              'px-4 py-3 rounded-2xl rounded-tr-md',
              'bg-bg-elevated border border-border/40',
              'text-text-primary leading-relaxed shadow-sm',
            )}
            style={{ fontSize: '15px' }}
          >
            {round.userAnswer}
          </div>
        </motion.div>
      )}

      {/* AI 反馈 */}
      {round.aiFeedback && (
        <div className="ml-10">
          <p className="text-b2 text-text-secondary leading-relaxed mb-2">
            {round.aiFeedback}
          </p>

          {/* 多维反馈卡片 */}
          {round.dimensions && <MultiFeedbackCard round={round} />}

          {/* 详细评分折叠 */}
          {round.dimensions && (
            <>
              <button
                onClick={() => setDetailOpen(!detailOpen)}
                className="flex items-center gap-1 text-c1 text-brand-500 hover:text-brand-600 transition-colors mt-2 mb-1"
              >
                {detailOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {detailOpen ? '收起详细评分' : '查看雷达图'}
              </button>

              <AnimatePresence>
                {detailOpen && <DimensionDetail dimensions={round.dimensions} />}
              </AnimatePresence>
            </>
          )}

          {/* 无维度评分时，hints 直接展示 */}
          {!round.dimensions && round.hints.length > 0 && (
            <div className="mt-1">
              {round.hints.map((h, i) => (
                <p key={i} className="text-c1 text-text-tertiary">💡 {h}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** AI 思考中的波浪动画 */
function AIThinkingWave() {
  return (
    <div className="flex items-start gap-2.5 max-w-[85%]">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-brand-500/20">
        <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-brand-50/80 dark:bg-brand-950/40 border border-brand-200/30 dark:border-brand-700/30">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-brand-500"
              animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SocraticDialogue({
  rounds, currentRound, maxRounds, onSubmitAnswer, loading, completed,
}: SocraticDialogueProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (!answer.trim() || loading) return;
    onSubmitAnswer(answer.trim());
    setAnswer('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-kb-md">
      {/* 轮次指示器 */}
      <div className="flex items-center gap-2 text-b2 text-text-tertiary">
        <span className="px-2.5 py-0.5 rounded-kb-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-c1 font-semibold">
          第 {currentRound}/{maxRounds} 轮
        </span>
        {completed && (
          <motion.span
            className="px-2.5 py-0.5 rounded-kb-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-c1 font-semibold"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING.bouncy}
          >
            ✓ 追问完成
          </motion.span>
        )}
      </div>

      {/* 对话流 */}
      <div className="flex flex-col gap-kb-lg">
        {rounds.map((round) => (
          <RoundBubble key={round.roundNumber} round={round} />
        ))}

        {/* AI 思考波浪动画 */}
        {loading && <AIThinkingWave />}
      </div>

      {/* 输入区（追问未完成时显示）— 底部固定风格 */}
      {!completed && (
        <motion.div
          className={cn(
            'flex items-end gap-2 p-3 rounded-2xl',
            'border border-border/40 bg-bg-elevated/80 backdrop-blur-sm',
            'focus-within:border-brand-400/50 focus-within:shadow-[0_0_16px_rgba(59,130,246,0.08)]',
            'transition-all duration-300',
          )}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING.gentle}
        >
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="写下你的思考..."
            rows={2}
            className={cn(
              'flex-1 px-3 py-2 bg-transparent outline-none resize-none',
              'text-b2 text-text-primary placeholder:text-text-tertiary/60',
            )}
          />
          <motion.button
            onClick={handleSubmit}
            disabled={!answer.trim() || loading}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            className={cn(
              'p-2.5 rounded-xl transition-all duration-200',
              answer.trim() && !loading
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25 hover:bg-brand-600'
                : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
            )}
          >
            {loading ? <AIThinkingIndicator size={4} gap={3} /> : <Send className="w-4 h-4" strokeWidth={1.5} />}
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
