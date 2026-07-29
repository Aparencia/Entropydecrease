/**
 * @ai-context: pomodoro 功能模块：adaptiveEngine。
 */
import type { DurationHistoryData, DurationResult } from '@/lib/ai/types';

/**
 * 本地规则引擎：基于加权平均计算推荐番茄时长
 */
export function calculateLocalRecommendation(history: DurationHistoryData): DurationResult {
  const sessions = history.sessions.filter((s) => s.completed);

  if (sessions.length === 0) {
    return {
      recommendedDuration: 25,
      breakMinutes: 5,
      reasoning: '默认推荐25分钟深潜',
      confidence: 'low',
      source: 'local_rule',
      isLocalFallback: true,
    };
  }

  // 近7天加权：越近的记录权重越高
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  let weightedSum = 0;
  let weightTotal = 0;

  for (const s of sessions) {
    const age = now - new Date(s.date).getTime();
    // 7天内线性递减权重，7天外权重为0.3
    const weight = age <= sevenDaysMs ? 1 - (age / sevenDaysMs) * 0.7 : 0.3;
    weightedSum += s.duration * weight;
    weightTotal += weight;
  }

  const avgDuration = weightTotal > 0 ? weightedSum / weightTotal : sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length;

  return {
    recommendedDuration: Math.round(avgDuration),
    breakMinutes: 5,
    reasoning: `基于最近${sessions.length}次记录的加权平均时长`,
    confidence: sessions.length >= 7 ? 'high' : sessions.length >= 3 ? 'medium' : 'low',
    source: 'local_rule',
    isLocalFallback: true,
  };
}

/**
 * AI增强请求：3秒超时自动fallback到本地规则引擎
 * 并约束推荐变化幅度（与上次差异 ≤ ±5分钟）
 */
export async function requestAIEnhancement(
  history: DurationHistoryData,
  aiRecommendFn: (data: DurationHistoryData) => Promise<DurationResult>,
  lastRecommendation?: number,
): Promise<DurationResult> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI请求超时')), 3000),
    );

    const result = await Promise.race([aiRecommendFn(history), timeoutPromise]);

    // 推荐变化约束：与上次差异 ≤ ±5分钟
    if (lastRecommendation != null && Math.abs(result.recommendedDuration - lastRecommendation) > 5) {
      const clamped = lastRecommendation + Math.sign(result.recommendedDuration - lastRecommendation) * 5;
      result.recommendedDuration = clamped;
      result.reasoning += '（已限制变化幅度）';
    }

    return result;
  } catch {
    return calculateLocalRecommendation(history);
  }
}
