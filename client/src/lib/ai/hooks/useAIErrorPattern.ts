/**
 * AI 错误模式分析 Hook
 *
 * @ai-context: F4 功能的 React Hook 包装：从本地黄金错误记录组装请求，
 * 经 aiPluginLoader 调用网关/本地 Ollama 分析错误模式；AI 不可用时返回
 * null，调用方回退到本地纯统计（summarizeGoldenErrors）。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import type { ErrorPatternResult } from '../types';
import type { GoldenErrorRecord } from '@/features/flashcards/lib/goldenErrorQueries';

const MAX_RECORDS_FOR_AI = 20;

export interface ErrorPatternState {
  patterns: ErrorPatternResult | null;
  loading: boolean;
  error: string | null;
}

/** 将本地黄金错误记录映射为网关请求载荷 */
function toPayload(records: GoldenErrorRecord[]) {
  return records.slice(0, MAX_RECORDS_FOR_AI).map((r) => ({
    flashcardId: r.review.cardId,
    correctAnswer: r.back,
    // 复习记录不含用户原始回答，用卡片正面作为上下文
    userAnswer: r.front,
  }));
}

/**
 * 错误模式分析 hook
 *
 * 输入：黄金错误历史记录（getGoldenErrorRecords 结果）
 * 输出：错误模式分类、高频错误卡片、趋势总结
 */
export function useAIErrorPattern() {
  const [state, setState] = useState<ErrorPatternState>({
    patterns: null,
    loading: false,
    error: null,
  });

  const analyze = useCallback(async (records: GoldenErrorRecord[]): Promise<ErrorPatternResult | null> => {
    if (records.length === 0) return null;
    setState({ patterns: null, loading: true, error: null });
    try {
      const result = await aiPluginLoader.analyzeErrorPatterns(toPayload(records));
      setState({ patterns: result, loading: false, error: null });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI 错误模式分析服务暂时不可用';
      setState({ patterns: null, loading: false, error: message });
      return null;
    }
  }, []);

  return { ...state, analyze };
}
