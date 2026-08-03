/**
 * useAIConceptPrecheck — E1 概念预检 hook（错误概念先破后立）
 *
 * @ai-context: E1 功能的 React Hook 包装：费曼讲解前基于目标概念与
 * 历史薄弱点生成 1-2 个探测性问题；AI 不可用时静默返回 null（可跳过）。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import type { ConceptPrecheckResult } from '../types';

/** 历史薄弱点摘要上限（与网关侧一致，控制 token 消耗） */
const MAX_WEAK_HISTORY_LEN = 2000;

export interface ConceptPrecheckState {
  result: ConceptPrecheckResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * 概念预检 hook
 */
export function useAIConceptPrecheck() {
  const [state, setState] = useState<ConceptPrecheckState>({
    result: null,
    loading: false,
    error: null,
  });

  const precheck = useCallback(async (concept: string, weakHistory?: string): Promise<ConceptPrecheckResult | null> => {
    const trimmedConcept = concept.trim();
    const trimmedHistory = (weakHistory ?? '').trim().slice(0, MAX_WEAK_HISTORY_LEN);
    if (!trimmedConcept) {
      setState({ result: null, loading: false, error: null });
      return null;
    }
    setState({ result: null, loading: true, error: null });
    try {
      const result = await aiPluginLoader.conceptPrecheck(trimmedConcept, trimmedHistory || undefined);
      setState({ result, loading: false, error: null });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI 概念预检服务暂时不可用';
      setState({ result: null, loading: false, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ result: null, loading: false, error: null });
  }, []);

  return { ...state, precheck, reset };
}
