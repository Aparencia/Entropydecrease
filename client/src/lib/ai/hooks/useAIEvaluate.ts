/**
 * @ai-context: Evaluate 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { getLocalFallbackMessage } from '../LocalFallback';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { EvaluateResult, EvaluateOptions } from '../types';

/**
 * AI 费曼评估 hook
 */
export function useAIEvaluate() {
  const [state, setState] = useState<AIState<EvaluateResult>>({
    ...INITIAL_STATE,
  });

  const evaluate = useCallback(async (concept: string, explanation: string, options?: EvaluateOptions) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.evaluateExplanation(concept, explanation, options);
      soundPlayer.play('ai_analysis_done');
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, getLocalFallbackMessage('evaluate')));
      throw error;
    }
  }, []);

  return { ...state, evaluate };
}
