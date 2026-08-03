/**
 * useAIContentTier — N5 策略性遗忘标记（内容分层）hook
 *
 * @ai-context: N5 功能的 React Hook 包装：将笔记文本送网关分为
 * 核心/支撑/细节三层；AI 不可用时返回 null，由调用方降级（隐藏入口）。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import type { ContentTierResult } from '../types';

/** 笔记文本上限（与网关侧一致，控制 token 消耗） */
const MAX_TEXT_LEN = 6000;

export interface ContentTierState {
  tier: ContentTierResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * 内容分层 hook
 */
export function useAIContentTier() {
  const [state, setState] = useState<ContentTierState>({
    tier: null,
    loading: false,
    error: null,
  });

  const analyze = useCallback(async (notesText: string): Promise<ContentTierResult | null> => {
    const text = notesText.trim().slice(0, MAX_TEXT_LEN);
    if (text.length < 30) {
      setState({ tier: null, loading: false, error: '笔记内容太少，无法分层' });
      return null;
    }
    setState({ tier: null, loading: true, error: null });
    try {
      const result = await aiPluginLoader.contentTier(text);
      if (!result.core || result.core.length === 0) {
        setState({ tier: null, loading: false, error: '未能生成有效分层，请稍后重试' });
        return null;
      }
      setState({ tier: result, loading: false, error: null });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI 内容分层服务暂时不可用';
      setState({ tier: null, loading: false, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ tier: null, loading: false, error: null });
  }, []);

  return { ...state, analyze, reset };
}
