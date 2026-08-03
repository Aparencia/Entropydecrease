/**
 * useAIQuiz — N1 课程级迷你测试生成 hook
 *
 * @ai-context: N1 功能的 React Hook 包装：将多篇笔记合并文本送网关生成
 * 混合题型测试；AI 不可用时返回 null，由调用方决定降级（如禁用入口）。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import type { QuizGenResult } from '../types';

/** 合并文本上限（与网关侧一致，控制 token 消耗） */
const MAX_NOTES_TEXT_LEN = 6000;

export interface QuizState {
  quiz: QuizGenResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * 迷你测试生成 hook
 */
export function useAIQuiz() {
  const [state, setState] = useState<QuizState>({
    quiz: null,
    loading: false,
    error: null,
  });

  const generate = useCallback(async (notesText: string): Promise<QuizGenResult | null> => {
    const text = notesText.trim().slice(0, MAX_NOTES_TEXT_LEN);
    if (text.length < 30) {
      setState({ quiz: null, loading: false, error: '笔记内容太少，无法生成测试' });
      return null;
    }
    setState({ quiz: null, loading: true, error: null });
    try {
      const result = await aiPluginLoader.generateQuiz(text);
      if (!result.questions || result.questions.length === 0) {
        setState({ quiz: null, loading: false, error: '未能生成有效题目，请稍后重试' });
        return null;
      }
      setState({ quiz: result, loading: false, error: null });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI 测试生成服务暂时不可用';
      setState({ quiz: null, loading: false, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ quiz: null, loading: false, error: null });
  }, []);

  return { ...state, generate, reset };
}
