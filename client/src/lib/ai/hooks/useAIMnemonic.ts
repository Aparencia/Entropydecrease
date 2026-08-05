/**
 * @ai-context: 记忆术生成器 Hook：调用 AI 网关为闪卡内容生成记忆助记符。
 */
import { useState, useCallback } from 'react';
import { aiClient } from '@/lib/http/apiClient';
import type { MnemonicData, MnemonicType } from '../types';

const FALLBACK_MNEMONICS: Record<string, MnemonicData> = {
  default: {
    type: 'story',
    text: '把这个概念和你已经熟悉的事物联系起来，编一个简短的故事。',
    hint: '联想越离奇，记忆越深刻',
    effectivenessScore: 5,
  },
};

export function useAIMnemonic() {
  const [mnemonic, setMnemonic] = useState<MnemonicData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const generateMnemonic = useCallback(async (front: string, back: string) => {
    setLoading(true);
    setError(null);
    setIsFallback(false);

    try {
      const result = await aiClient.post<{
        type: string; text: string; hint?: string;
        visual_clue?: string; effectiveness_score?: number;
      }>('/api/v1/ai/mnemonic', { front, back });

      const mapped: MnemonicData = {
        type: result.type as MnemonicType,
        text: result.text,
        hint: result.hint,
        visualClue: result.visual_clue,
        effectivenessScore: result.effectiveness_score,
      };
      setMnemonic(mapped);
      return mapped;
    } catch {
      setIsFallback(true);
      const fallback = { ...FALLBACK_MNEMONICS.default };
      setMnemonic(fallback);
      setError('AI 记忆术服务不可用，已使用默认助记方法');
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mnemonic, loading, error, isFallback, generateMnemonic };
}