/**
 * @ai-context: Predict 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { resolveAIFallback, setAICache, FallbackLevel } from '../aiServiceFallback';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { PredictionPrompt } from '../types';

/**
 * AI 学习预测 hook
 *
 * 基于笔记内容预测用户可能被问到的问题，
 * 帮助主动思考后续知识和应用场景。
 *
 * 接入 aiServiceFallback 进行缓存降级
 */
export function useAIPredict() {
  const [state, setState] = useState<AIState<{ predictions: PredictionPrompt[] }>>({
    ...INITIAL_STATE,
  });

  const predict = useCallback(async (noteId: string, content: string) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    const cacheKey = `predict:${noteId}`;
    try {
      const result = await aiPluginLoader.predictQuestion(noteId, content);
      soundPlayer.play('ai_analysis_done');
      setAICache(cacheKey, result);
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<{ predictions: PredictionPrompt[] }>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setState(resolveAIErrorState(error, {
        message: 'AI 学习预测服务暂时不可用',
        suggestion: '您可以尝试思考"这个知识点接下来会学什么"来自主预测',
      }));
      return null;
    }
  }, []);

  return { ...state, predict };
}
