/**
 * @ai-context: TagContent 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';

/**
 * AI 内容打标 hook
 */
export function useAITagContent() {
  const [state, setState] = useState<AIState<{ contentNature: string; cognitiveDepth: string; subject: string }>>({
    ...INITIAL_STATE,
  });

  const tagContent = useCallback(async (content: string) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.tagContent(content);
      const mapped = {
        contentNature: result.contentNature,
        cognitiveDepth: result.cognitiveDepth,
        subject: result.subject,
      };
      setState({ data: mapped, loading: false, error: null, isFallback: false, needsConfig: false });
      return mapped;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error));
      return null;
    }
  }, []);

  return { ...state, tagContent };
}
