/**
 * @ai-context: Flashcards 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { getLocalFallbackMessage } from '../LocalFallback';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { FlashcardResult, FlashcardOptions } from '../types';

/**
 * AI 闪卡生成 hook
 */
export function useAIFlashcards() {
  const [state, setState] = useState<AIState<FlashcardResult>>({
    ...INITIAL_STATE,
  });

  const generate = useCallback(async (content: string, options?: FlashcardOptions) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.generateFlashcards(content, options);
      soundPlayer.play('ai_analysis_done');
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, getLocalFallbackMessage('flashcard')));
      throw error;
    }
  }, []);

  return { ...state, generate };
}
