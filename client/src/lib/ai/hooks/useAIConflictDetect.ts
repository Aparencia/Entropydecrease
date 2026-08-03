/**
 * useAIConflictDetect — N6 概念冲突检测 hook
 *
 * @ai-context: N6 功能的 React Hook 包装：比对新笔记与历史理解文本，
 * 返回概念冲突列表；AI 不可用或无历史时静默返回 null，不打扰用户。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import type { ConflictDetectResult } from '../types';

/** 新旧文本上限（与网关侧一致，控制 token 消耗） */
const MAX_TEXT_LEN = 3000;

export interface ConflictDetectState {
  conflicts: ConflictDetectResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * 概念冲突检测 hook
 */
export function useAIConflictDetect() {
  const [state, setState] = useState<ConflictDetectState>({
    conflicts: null,
    loading: false,
    error: null,
  });

  const detect = useCallback(async (newNoteText: string, historyText: string): Promise<ConflictDetectResult | null> => {
    const newText = newNoteText.trim().slice(0, MAX_TEXT_LEN);
    const history = historyText.trim().slice(0, MAX_TEXT_LEN);
    if (newText.length < 30 || history.length < 30) {
      setState({ conflicts: null, loading: false, error: null });
      return null;
    }
    setState({ conflicts: null, loading: true, error: null });
    try {
      const result = await aiPluginLoader.conflictDetect(newText, history);
      setState({ conflicts: result, loading: false, error: null });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI 概念冲突检测服务暂时不可用';
      setState({ conflicts: null, loading: false, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ conflicts: null, loading: false, error: null });
  }, []);

  return { ...state, detect, reset };
}
