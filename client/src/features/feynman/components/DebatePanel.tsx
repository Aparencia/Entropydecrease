/**
 * 辩论面板 — AI 辩论对手 UI
 *
 * @ai-context: 展示辩论轮次（AI 论点 vs 用户反驳），4 种辩论类型选择，
 * 输入区、轮次历史、评分展示。AI 不可用时使用本地降级辩论模板。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Swords, Send, Trophy, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIDebate } from '@/lib/ai/hooks/useAIDebate';
import type { DebateType } from '@/lib/ai/types';

const DEBATE_TYPES: { value: DebateType; label: string; desc: string }[] = [
  { value: 'academic', label: '学术', desc: '基于证据和逻辑的学术辩论' },
  { value: 'policy', label: '政策', desc: '围绕政策可行性与效果的辩论' },
  { value: 'value', label: '价值', desc: '探讨价值观与道德判断' },
  { value: 'speculative', label: '思辨', desc: '开放式的思想实验与推演' },
];

interface DebatePanelProps {
  topic: string;
  onClose: () => void;
}

export default function DebatePanel({ topic, onClose }: DebatePanelProps) {
  const { rounds, loading, error, totalScore, isFallback, startDebate, submitCounter } = useAIDebate();
  const [debateType, setDebateType] = useState<DebateType>('academic');
  const [userInput, setUserInput] = useState('');
  const [debateStarted, setDebateStarted] = useState(false);

  const handleStartDebate = () => {
    setDebateStarted(true);
    void startDebate(topic, debateType);
  };

  const handleSubmit = () => {
    if (!userInput.trim() || loading) return;
    const currentRound = rounds.length;
    void submitCounter(topic, debateType, userInput.trim(), currentRound);
    setUserInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[600px] rounded-2xl border border-border/20 bg-bg-base/95 backdrop-blur-sm">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-violet-500" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold text-text-primary">AI 辩论对手</span>
          {isFallback && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">降级</span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-tertiary/30 transition-colors" aria-label="关闭">
          <X className="w-4 h-4 text-text-tertiary" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 主题展示 */}
        <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-3">
          <p className="text-[12px] text-text-tertiary mb-1">辩论主题</p>
          <p className="text-[14px] font-medium text-text-primary">{topic}</p>
        </div>

        {/* 辩论类型选择（未开始时） */}
        {!debateStarted && (
          <div className="space-y-2">
            <p className="text-[12px] text-text-tertiary">选择辩论类型</p>
            <div className="grid grid-cols-2 gap-2">
              {DEBATE_TYPES.map((dt) => (
                <button
                  key={dt.value}
                  onClick={() => setDebateType(dt.value)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-all',
                    debateType === dt.value
                      ? 'border-violet-500/40 bg-violet-500/10'
                      : 'border-border/20 bg-bg-elevated/30 hover:border-border/40',
                  )}
                >
                  <p className="text-[13px] font-medium text-text-primary">{dt.label}</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">{dt.desc}</p>
                </button>
              ))}
            </div>
            <button
              onClick={handleStartDebate}
              className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-[13px] font-medium hover:bg-violet-600 transition-colors"
            >
              开始辩论
            </button>
          </div>
        )}

        {/* 辩论轮次 */}
        {debateStarted && (
          <>
            {/* 评分展示 */}
            {totalScore > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-2.5">
                <Trophy className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                <span className="text-[12px] text-text-secondary">
                  当前得分：<span className="font-semibold text-emerald-500">{totalScore}</span>
                </span>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/5 border border-red-500/15 p-2.5">
                <AlertCircle className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                <span className="text-[12px] text-red-500">{error}</span>
              </div>
            )}

            {/* 轮次历史 */}
            <AnimatePresence>
              {rounds.map((round) => (
                <motion.div
                  key={round.roundNumber}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-500 font-medium">
                      第 {round.roundNumber} 轮
                    </span>
                    {round.score !== undefined && (
                      <span className="text-[10px] text-text-tertiary">得分：{round.score}</span>
                    )}
                  </div>
                  {/* AI 论点 */}
                  <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-3">
                    <p className="text-[11px] text-violet-500 font-medium mb-1">AI 论点</p>
                    <p className="text-[13px] text-text-primary leading-relaxed">{round.aiArgument}</p>
                  </div>
                  {/* 用户反驳 */}
                  {round.userCounter && (
                    <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3 ml-4">
                      <p className="text-[11px] text-blue-500 font-medium mb-1">你的反驳</p>
                      <p className="text-[13px] text-text-primary leading-relaxed">{round.userCounter}</p>
                    </div>
                  )}
                  {/* AI 回应 */}
                  {round.aiRebuttal && (
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 ml-2">
                      <p className="text-[11px] text-amber-500 font-medium mb-1">AI 回应</p>
                      <p className="text-[13px] text-text-primary leading-relaxed">{round.aiRebuttal}</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <div className="flex items-center gap-2 text-text-tertiary py-2">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                <span className="text-[12px]">AI 正在思考论点...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 输入区 */}
      {debateStarted && (
        <div className="border-t border-border/10 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-border/20 bg-bg-elevated/50 p-2 focus-within:border-violet-400/50 transition-colors">
            <textarea
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="提出你的反驳..."
              rows={2}
              className="flex-1 px-2 py-1 bg-transparent outline-none resize-none text-[13px] text-text-primary placeholder:text-text-tertiary/60"
            />
            <button
              onClick={handleSubmit}
              disabled={!userInput.trim() || loading}
              className={cn(
                'p-2 rounded-lg transition-all',
                userInput.trim() && !loading
                  ? 'bg-violet-500 text-white hover:bg-violet-600'
                  : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
              )}
            >
              <Send className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}