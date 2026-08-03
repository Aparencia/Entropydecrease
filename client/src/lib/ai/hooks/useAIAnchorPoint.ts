/**
 * @ai-context: AnchorPoint 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { resolveAIFallback, setAICache, FallbackLevel } from '../aiServiceFallback';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { AnchorPoint } from '../types';

/**
 * AI 记忆锚点生成 hook
 *
 * 从笔记内容中提取知识锚点（核心概念 + 关联提示 + 记忆技巧）
 * 接入 aiServiceFallback 进行缓存降级
 */
export function useAIAnchorPoint() {
  const [state, setState] = useState<AIState<{ anchorPoints: AnchorPoint[] }>>({
    ...INITIAL_STATE,
  });

  const generateAnchorPoints = useCallback(async (
    noteId: string,
    content: string,
    options?: { silent?: boolean },
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    const cacheKey = `anchor_point:${noteId}`;
    try {
      const result = await aiPluginLoader.generateAnchorPoint(noteId, content);
      // 番茄专注场景传 silent：定时锚点提醒不应播放音效打断专注
      if (!options?.silent) soundPlayer.play('ai_analysis_done');
      setAICache(cacheKey, result);
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      // 尝试缓存降级
      const fallback = resolveAIFallback<{ anchorPoints: AnchorPoint[] }>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setState(resolveAIErrorState(error, {
        message: 'AI 锚点生成服务暂时不可用',
        suggestion: '您可以手动标记笔记中的关键概念作为锚点',
      }));
      return null;
    }
  }, []);

  return { ...state, generateAnchorPoints };
}
