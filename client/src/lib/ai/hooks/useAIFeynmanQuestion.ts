/**
 * @ai-context: FeynmanQuestion 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import { withTimeout } from './withTimeout';
import type { FeynmanQuestionResult } from '../types';

/**
 * AI 费曼反问 hook — 生成追问
 */
export function useAIFeynmanQuestion() {
  const [state, setState] = useState<AIState<FeynmanQuestionResult>>({
    ...INITIAL_STATE,
  });

  const generateQuestions = useCallback(async (concept: string, explanation: string) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await withTimeout(aiPluginLoader.generateFeynmanQuestions(concept, explanation));
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, {
        message: 'AI 追问生成服务暂时不可用',
        suggestion: '您可以尝试自问"这个概念的核心是什么"来深入理解',
      }));
      throw error;
    }
  }, []);

  /** v0.30: 清空状态（配合“重置 AI 反馈”） */
  const clear = useCallback(() => setState({ ...INITIAL_STATE }), []);

  return { ...state, generateQuestions, clear };
}
