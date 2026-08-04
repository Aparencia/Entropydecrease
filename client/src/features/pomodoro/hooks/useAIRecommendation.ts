/**
 * @ai-context: pomodoro 功能模块 Hook：useAIRecommendation。
 * T1：本地计算链优先使用 rhythmEngine 节律推荐（数据充足时），
 * 数据不足回退 adaptiveEngine 加权平均；AI 增强仍保持可选。
 */
import { useState, useCallback } from 'react';
import type { DurationHistoryData, DurationResult } from '@/lib/ai/types';
import { calculateLocalRecommendation, requestAIEnhancement } from '../lib/adaptiveEngine';
import { recommendRhythmDuration } from '../lib/rhythmEngine';

/** T1: 本地推荐优先走节律引擎，数据不足回退加权平均 */
function calculateLocalWithRhythm(history: DurationHistoryData): DurationResult {
  const rhythm = recommendRhythmDuration(history.sessions);
  if (rhythm.confidence === 'low') {
    return calculateLocalRecommendation(history);
  }
  return {
    recommendedDuration: rhythm.minutes,
    breakMinutes: 5,
    reasoning: rhythm.reasoning,
    confidence: rhythm.confidence,
    source: 'local_rule',
    isLocalFallback: true,
  };
}

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
      aiRecommendFn?: (data: DurationHistoryData, signal?: AbortSignal) => Promise<DurationResult>,
      lastRecommendation?: number,
    ) => {
      setLoading(true);
      setError(null);
      try {
        // 1. 立即计算本地推荐（零延迟，T1 节律优先）
        const local = calculateLocalWithRhythm(history);
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
        const fallback = calculateLocalWithRhythm(history);
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
