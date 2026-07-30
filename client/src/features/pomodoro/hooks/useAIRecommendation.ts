/**
 * @ai-context: pomodoro 功能模块 Hook：useAIRecommendation。
 */
import { useState, useCallback } from 'react';
import type { DurationHistoryData, DurationResult } from '@/lib/ai/types';
import { calculateLocalRecommendation, requestAIEnhancement } from '../lib/adaptiveEngine';

/**
 * 独立的 AI 番茄钟推荐 Hook
 *
 * 先返回本地规则引擎结果（即时响应），再尝试 AI 增强。
 * 不依赖 usePomodoroStore，可在任意组件中使用。
 */
export function useAIRecommendation() {
  const [recommendation, setRecommendation] = useState<DurationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRecommendation = useCallback(
    async (
      history: DurationHistoryData,
      aiRecommendFn?: (data: DurationHistoryData) => Promise<DurationResult>,
      lastRecommendation?: number,
    ) => {
      setLoading(true);
      setError(null);
      try {
        // 1. 立即计算本地推荐（零延迟）
        const local = calculateLocalRecommendation(history);
        setRecommendation(local);

        // 2. 若提供了 AI 函数，尝试 AI 增强（3秒超时自动 fallback）
        if (aiRecommendFn) {
          const enhanced = await requestAIEnhancement(
            history,
            aiRecommendFn,
            lastRecommendation,
          );
          setRecommendation(enhanced);
          return enhanced;
        }

        return local;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '获取推荐失败';
        setError(msg);
        // 确保兜底为本地推荐
        const fallback = calculateLocalRecommendation(history);
        setRecommendation(fallback);
        return fallback;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { recommendation, loading, error, getRecommendation };
}
