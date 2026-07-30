/**
 * @ai-context: Rescue 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { resolveAIFallback, setAICache, FallbackLevel } from '../aiServiceFallback';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { RescueContext, ResourceLink } from '../types';

/**
 * AI 学习救援 hook
 *
 * 当用户在学习过程中卡住时，提供三级递进帮助：
 * 1. 提示线索（引导性提示）
 * 2. 简化问题（拆解子问题）
 * 3. 替代路径（全新解决思路）
 *
 * 接入 aiServiceFallback 进行缓存降级
 */
export function useAIRescue() {
  const [state, setState] = useState<AIState<{
    hints: string[]; resources: ResourceLink[]; alternativeApproach?: string;
  }>>({
    ...INITIAL_STATE,
  });

  const rescue = useCallback(async (context: RescueContext) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    const cacheKey = `rescue:${context.topic.slice(0, 100)}:${context.stuckPoint?.slice(0, 50) || 'default'}`;
    try {
      const result = await aiPluginLoader.rescue(context);
      setAICache(cacheKey, result);
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<typeof state.data>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setState(resolveAIErrorState(error, {
        message: 'AI 学习救援服务暂时不可用',
        suggestion: '试试先放下这个问题，过一会儿再回来思考，或者从基础概念重新开始',
      }));
      return null;
    }
  }, []);

  return { ...state, rescue };
}
