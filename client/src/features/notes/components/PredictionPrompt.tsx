/**
 * PredictionPrompt — 预测题前置组件
 * PredictionPrompt — Pre-learning prediction questions
 *
 * @ai-context: 打开新笔记或空笔记时，弹出预测性问题让用户先写下猜测，
 * 提交猜测后揭示笔记正文，利用预测编码机制增强学习效果。
 * 基于 useAIPredict 调用 AI 网关 /api/v1/ai/predict 路由。
 * @ai-context: Shows prediction questions when opening a new/empty note.
 * User writes guesses before seeing content, leveraging predictive coding.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAIPredict } from '@/lib/ai/hooks/useAIPredict';
import { useToast } from '@/components/ui';

interface PredictionPromptProps {
  noteTitle: string;
  noteContent: string;
  noteId: string;
  /** 关闭后标记为已处理，不再重复弹出 */
  onDismiss: () => void;
}

export function PredictionPrompt({ noteTitle, noteContent, noteId, onDismiss }: PredictionPromptProps) {
  const { predict, loading: predictLoading } = useAIPredict();
  const { toast } = useToast();
  const [predictions, setPredictions] = useState<Array<{ question: string; guess: string }>>([]);
  const [revealed, setRevealed] = useState(false);

  // 检查是否为空笔记（首次打开）
  const isEmpty = !noteContent || noteContent.length < 50;

  // 生成预测题
  const handleGenerate = useCallback(async () => {
    if (!noteId) return;
    toast({ type: 'info', message: 'AI 正在生成预测题…', duration: 1500 });
    const result = await predict(noteId, noteContent || noteTitle);
    if (result?.predictions?.length) {
      setPredictions(result.predictions.map((p: { question: string }) => ({ question: p.question, guess: '' })));
    } else {
      toast({ type: 'warning', message: '暂无法生成预测题，可跳过直接开始', silent: true });
      onDismiss();
    }
  }, [noteId, noteContent, noteTitle, predict, toast, onDismiss]);

  const updateGuess = (index: number, value: string) => {
    setPredictions((prev) => prev.map((p, i) => (i === index ? { ...p, guess: value } : p)));
  };

  const handleReveal = () => {
    setRevealed(true);
  };

  if (revealed || !isEmpty) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-4 rounded-xl border border-brand-300/30 bg-brand-50/10 p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold text-text-primary">预测驱动学习</span>
          <span className="text-c1 text-text-tertiary">—— 先猜后学，记忆更深刻</span>
        </div>

        {predictions.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-b2 text-text-secondary">
              关于「{noteTitle || '这篇笔记'}」的内容，你了解多少？先让 AI 出几个预测题，写下你的猜测再看笔记正文。
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={predictLoading}>
                {predictLoading ? 'AI 思考中…' : '生成预测题'}
              </Button>
              <Button variant="secondary" size="sm" onClick={onDismiss}>
                跳过，直接开始
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {predictions.map((p, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <p className="text-b2 text-text-primary font-medium">
                  {i + 1}. {p.question}
                </p>
                <div className="flex gap-2">
                  <input
                    value={p.guess}
                    onChange={(e) => updateGuess(i, e.target.value)}
                    placeholder="写下你的猜测…"
                    className="flex-1 px-3 py-1.5 rounded-kb-md border border-border/40 bg-bg-secondary text-b2 text-text-primary outline-none focus:border-focus"
                  />
                  {p.guess && (
                    <span className="flex items-center text-c1 text-text-tertiary">
                      <Send className="w-3 h-3" strokeWidth={1.5} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-1">
              <Button size="sm" onClick={handleReveal}>
                我已写下猜测，开始学习
              </Button>
              <Button variant="secondary" size="sm" onClick={onDismiss}>
                跳过
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}