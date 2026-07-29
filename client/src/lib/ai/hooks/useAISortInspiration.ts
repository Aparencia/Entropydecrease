/**
 * @ai-context: SortInspiration 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { SortResult } from '../types';

/**
 * AI 灵感分拣 hook — 分析内容并推荐归类目标
 */
export function useAISortInspiration() {
  const [state, setState] = useState<AIState<SortResult>>({
    ...INITIAL_STATE,
  });

  const sortInspiration = useCallback(async (content: string, existingTags?: Record<string, string>) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.sortInspiration(content, existingTags);
      soundPlayer.play('ai_analysis_done');
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, {
        message: 'AI 灵感分拣服务暂时不可用',
        suggestion: '您可以根据内容类型手动选择归类到浮出水面/反衰减呼吸/结礁/待办',
      }));
      return null;
    }
  }, []);

  return { ...state, sortInspiration };
}
