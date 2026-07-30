/**
 * @ai-context: OptimizeCard 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { getLocalFallbackMessage } from '../LocalFallback';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { OptimizeCardResult } from '../types';

/**
 * AI 闪卡优化 hook
 */
export function useAIOptimizeCard() {
  const [state, setState] = useState<AIState<OptimizeCardResult>>({
    ...INITIAL_STATE,
  });

  const optimize = useCallback(async (front: string, back: string) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.optimizeCard(front, back);
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, getLocalFallbackMessage('optimize_card')));
    }
  }, []);

  return { ...state, optimize };
}
