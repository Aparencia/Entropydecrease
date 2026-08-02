/**
 * @ai-context: FeynmanEvaluateAnswers 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import { withTimeout } from './withTimeout';
import type { FeynmanAnswerEvalResult } from '../types';

/**
 * AI 费曼回答评估 hook — 评估理解度
 */
export function useAIFeynmanEvaluateAnswers() {
  const [state, setState] = useState<AIState<FeynmanAnswerEvalResult>>({
    ...INITIAL_STATE,
  });

  const evaluateAnswers = useCallback(async (
    concept: string,
    questions: string[],
    answers: string[],
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await withTimeout(aiPluginLoader.evaluateFeynmanAnswers(concept, questions, answers));
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, {
        message: 'AI 评估服务暂时不可用',
        suggestion: '您可以对照标准答案自行检查回答的准确性',
      }));
      throw error;
    }
  }, []);

  /** v0.30: 清空状态（配合“重置 AI 反馈”） */
  const clear = useCallback(() => setState({ ...INITIAL_STATE }), []);

  return { ...state, evaluateAnswers, clear };
}
