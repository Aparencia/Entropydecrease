/**
 * ClosedBookTest — N2 合书测试模式
 *
 * @ai-context: 编辑器内容被遮罩隐藏后，AI 基于笔记文本生成 3-5 个回忆问题
 * （复用 useAIFeynmanQuestion），用户作答后"合书对照"解除遮罩核对原文。
 * 提取练习（retrieval practice）：主动回忆比被动重读更能巩固记忆。
 * AI 不可用时降级为空白自由回忆区，保证本地可用。
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { EyeOff, Eye, X } from 'lucide-react';
import { useAIFeynmanQuestion } from '@/lib/ai/useAI';
import type { FeynmanQuestionItem } from '@/lib/ai/types';

/** 送入 AI 的笔记文本上限（控制 token 消耗） */
const MAX_TEXT_LEN = 3000;
/** AI 可用时的最少内容要求 */
const MIN_TEXT_LEN = 100;

interface ClosedBookTestProps {
  noteTitle: string;
  /** 编辑器实时纯文本 */
  noteText: string;
  /** 合书对照：解除遮罩显示原文 */
  onReveal: () => void;
  /** 结束合书测试 */
  onClose: () => void;
}

export function ClosedBookTest({ noteTitle, noteText, onReveal, onClose }: ClosedBookTestProps) {
  const { loading, generateQuestions } = useAIFeynmanQuestion();
  const [questions, setQuestions] = useState<FeynmanQuestionItem[]>([]);
  const [fallback, setFallback] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [freeRecall, setFreeRecall] = useState('');

  // 挂载时尝试 AI 出题；失败或内容不足则降级为自由回忆
  useEffect(() => {
    const text = noteText.trim().slice(0, MAX_TEXT_LEN);
    if (text.length < MIN_TEXT_LEN) {
      setFallback(true);
      return;
    }
    let cancelled = false;
    generateQuestions(noteTitle || '这篇笔记', text)
      .then((result) => {
        if (cancelled) return;
        const qs = result?.questions?.slice(0, 5) ?? [];
        if (qs.length === 0) {
          setFallback(true);
        } else {
          setQuestions(qs);
          setAnswers(new Array(qs.length).fill(''));
        }
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAnswer = (index: number, value: string) => {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const answered = fallback
    ? freeRecall.trim().length > 0
    : answers.some((a) => a.trim().length > 0);

  return (
    <div className="max-w-[640px] mx-auto my-kb-lg p-kb-lg rounded-kb-lg bg-bg-primary/95 backdrop-blur-xl border border-border/40 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <EyeOff className="w-4 h-4 text-brand-600" strokeWidth={1.5} />
          <span className="text-b1 font-semibold text-text-primary">合书测试</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-colors"
          aria-label="结束合书测试"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
      <p className="text-c1 text-text-secondary mb-4">
        笔记已隐藏，试着凭记忆回答下面的问题，然后对照原文查漏补缺。
      </p>

      {/* AI 出题中 */}
      {loading && !fallback && (
        <div className="flex flex-col items-center gap-3 py-8">
          <AIThinkingIndicator size={5} gap={4} />
          <p className="text-b2 text-text-secondary">正在回忆线索出题…</p>
        </div>
      )}

      {/* 降级：自由回忆区 */}
      {fallback && !loading && (
        <div className="flex flex-col gap-3">
          <p className="text-b2 text-text-primary">
            不看笔记，把你记得的核心内容写下来：
          </p>
          <textarea
            value={freeRecall}
            onChange={(e) => setFreeRecall(e.target.value)}
            placeholder="凭记忆写下这篇笔记的要点…"
            rows={8}
            autoFocus
            className="w-full px-3 py-2 rounded-kb-md border border-border/40 bg-bg-secondary text-b2 text-text-primary outline-none focus:border-focus resize-none"
          />
        </div>
      )}

      {/* AI 问题列表 */}
      {!fallback && questions.length > 0 && (
        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <p className="text-b2 text-text-primary font-medium">
                {i + 1}. {q.question}
              </p>
              {q.focus && <p className="text-c1 text-text-tertiary">提示：{q.focus}</p>}
              <textarea
                value={answers[i] ?? ''}
                onChange={(e) => setAnswer(i, e.target.value)}
                placeholder="写下你的答案…"
                rows={2}
                className="w-full px-3 py-2 rounded-kb-md border border-border/40 bg-bg-secondary text-b2 text-text-primary outline-none focus:border-focus resize-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* 操作区 */}
      <div className="flex items-center justify-between gap-2 mt-5">
        <p className="text-c1 text-text-tertiary">
          {answered ? '写得不错，对照原文看看？' : '先试着写点什么，哪怕只言片语'}
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="secondary" onClick={onClose}>结束测试</Button>
          <Button icon={<Eye className="w-4 h-4" strokeWidth={1.5} />} onClick={onReveal}>
            合书对照
          </Button>
        </div>
      </div>
    </div>
  );
}
