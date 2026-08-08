/**
 * AI 合书测试智能出题 hook
 * AI closed-book test smart question generation hook
 *
 * @ai-context: 支持选择题/填空题/简答题三种题型。AI 出题失败降级为
 * 自由回忆。测试结果反馈到 contentTierStore。
 * @ai-context: Supports choice/fill/essay question types. Falls back to
 * free recall on AI failure. Results feed into contentTierStore.
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';

export type QuizQuestionType = 'choice' | 'fill' | 'essay';

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  /** 选择题选项 */
  options?: string[];
  /** 正确答案 */
  answer: string;
  userAnswer?: string;
  isCorrect?: boolean;
}

interface UseAIClosedBookReturn {
  loading: boolean;
  questions: QuizQuestion[];
  generate: (title: string, text: string, types: QuizQuestionType[]) => Promise<QuizQuestion[]>;
  evaluate: (questions: QuizQuestion[]) => QuizQuestion[];
  clear: () => void;
}

const MAX_TEXT = 3000;
const MIN_TEXT = 100;

export function useAIClosedBook(): UseAIClosedBookReturn {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const { toast } = useToast();

  const generate = useCallback(async (title: string, text: string, types: QuizQuestionType[]): Promise<QuizQuestion[]> => {
    const trimmed = text.trim().slice(0, MAX_TEXT);
    if (trimmed.length < MIN_TEXT) {
      toast({ type: 'info', message: '内容太少，使用自由回忆模式', silent: true });
      return [];
    }
    setLoading(true);

    try {
      const typeLabels = { choice: '选择题（4个选项）', fill: '填空题', essay: '简答题' };
      const typeDesc = types.map((t) => typeLabels[t]).join('、');
      const prompt = `基于以下笔记内容，生成 3-5 道${typeDesc}。
返回 JSON 数组（不要其他内容），每项格式：
{type: "choice"|"fill"|"essay", question: "题目", options: ["A", "B", "C", "D"], answer: "正确答案"}

笔记标题：${title}
笔记内容：${trimmed}`;

      const result = await aiPluginLoader.summarizeNote(prompt, { style: 'outline' });
      const summary = result?.summary || '';

      let parsed: QuizQuestion[] = [];
      try {
        const cleaned = summary.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const start = cleaned.indexOf('[');
        const end = cleaned.lastIndexOf(']');
        if (start !== -1 && end > start) {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        }
      } catch { /* fallback to empty */ }

      const qs = parsed.slice(0, 5).map((q) => ({ ...q, id: crypto.randomUUID() }));
      setQuestions(qs);
      toast({ type: 'success', message: `已生成 ${qs.length} 道题目`, silent: true });
      setLoading(false);
      return qs;
    } catch {
      toast({ type: 'info', message: 'AI 出题失败，使用自由回忆', silent: true });
      setLoading(false);
      return [];
    }
  }, [toast]);

  const evaluate = useCallback((qs: QuizQuestion[]): QuizQuestion[] => {
    return qs.map((q) => {
      if (!q.userAnswer) return q;
      const correct = q.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
      return { ...q, isCorrect: correct };
    });
  }, []);

  const clear = useCallback(() => setQuestions([]), []);

  return { loading, questions, generate, evaluate, clear };
}

export default useAIClosedBook;