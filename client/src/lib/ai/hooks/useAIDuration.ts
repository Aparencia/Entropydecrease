/**
 * @ai-context: Duration 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { type AIState, INITIAL_STATE } from './types';
import type { DurationResult, DurationHistoryData, DurationOptions } from '../types';

/**
 * AI 深潜推荐 hook（自动降级到本地引擎）
 */
export function useAIDuration() {
  const [state, setState] = useState<AIState<DurationResult>>({
    ...INITIAL_STATE,
  });

  const recommend = useCallback(async (historyData: DurationHistoryData, options?: DurationOptions) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.recommendDuration(historyData, options);
      setState({ data: result, loading: false, error: null, isFallback: result.isLocalFallback, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : '深潜推荐失败');
      setState({ data: null, loading: false, error: msg, isFallback: true, needsConfig: false });
      throw error;
    }
  }, []);

  return { ...state, recommend };
}
