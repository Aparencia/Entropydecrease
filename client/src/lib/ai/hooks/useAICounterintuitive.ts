/**
 * @ai-context: 反直觉发现器 Hook：每日获取反直觉事实，按日期缓存到 localStorage。
 */
import { useState, useCallback } from 'react';
import { aiClient } from '@/lib/http/apiClient';
import type { CounterintuitiveFact } from '../types';

const CACHE_KEY = 'counterintuitive_daily';
const FALLBACK_FACTS: CounterintuitiveFact[] = [
  {
    fact: '人在感到疲惫时反而更容易产生创意。',
    explanation: '当大脑执行功能下降时，过滤机制变弱，更多非常规联想得以浮现，这被称为"灵感悖论"。',
    domain: '认知科学',
    surpriseLevel: 7,
  },
  {
    fact: '刻意练习并不总是最有效的学习方式。',
    explanation: '间隔重复和交错练习（interleaving）在长期记忆保持上优于单纯的大量刻意练习，尽管后者在短期内感觉更有效。',
    domain: '学习科学',
    surpriseLevel: 8,
  },
  {
    fact: '写下错误比写下正确答案更能加深记忆。',
    explanation: '生成效应（generation effect）表明，主动回忆和犯错后的修正过程比被动阅读正确答案更能强化神经连接。',
    domain: '记忆研究',
    surpriseLevel: 6,
  },
];

function getTodayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCachedFact(): CounterintuitiveFact | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date: string; fact: CounterintuitiveFact };
    if (parsed.date === getTodayDate()) return parsed.fact;
    return null;
  } catch {
    return null;
  }
}

function setCachedFact(fact: CounterintuitiveFact): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date: getTodayDate(), fact }));
  } catch { /* 静默 */ }
}

export function useAICounterintuitive() {
  const [fact, setFact] = useState<CounterintuitiveFact | null>(getCachedFact);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const fetchFact = useCallback(async () => {
    // 检查当日缓存
    const cached = getCachedFact();
    if (cached) {
      setFact(cached);
      setError(null);
      setIsFallback(false);
      return cached;
    }

    setLoading(true);
    setError(null);
    setIsFallback(false);

    try {
      const result = await aiClient.post<{
        fact: string; explanation: string; source?: string;
        domain?: string; surprise_level?: number;
      }>('/api/v1/ai/counterintuitive', {});

      const mapped: CounterintuitiveFact = {
        fact: result.fact,
        explanation: result.explanation,
        source: result.source,
        domain: result.domain,
        surpriseLevel: result.surprise_level,
      };
      setCachedFact(mapped);
      setFact(mapped);
      return mapped;
    } catch {
      // 本地降级
      setIsFallback(true);
      const fallbackIdx = new Date().getDate() % FALLBACK_FACTS.length;
      const fallback = FALLBACK_FACTS[fallbackIdx];
      setCachedFact(fallback);
      setFact(fallback);
      setError('AI 服务不可用，已展示本地反直觉事实');
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fact, loading, error, isFallback, fetchFact };
}