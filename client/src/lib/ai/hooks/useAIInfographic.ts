/**
 * @ai-context: 信息图生成器 Hook：调用 AI 网关生成结构化信息图数据。
 */
import { useState, useCallback } from 'react';
import { aiClient } from '@/lib/http/apiClient';
import type { InfographicData } from '../types';

const FALLBACK_INFOGRAPHIC: InfographicData = {
  title: '知识概览',
  sections: [
    {
      title: '核心概念',
      points: ['这是知识的核心出发点', '理解它需要先掌握基础前提'],
      icon: '🎯',
    },
    {
      title: '关键要点',
      points: ['要点一：从不同角度理解', '要点二：建立知识之间的联系'],
      icon: '💡',
    },
    {
      title: '实践应用',
      points: ['将知识转化为行动', '在练习中加深理解'],
      icon: '⚡',
    },
  ],
  relations: [
    { from: '核心概念', to: '关键要点', label: '导出' },
    { from: '关键要点', to: '实践应用', label: '应用' },
  ],
  theme: 'academic',
};

export function useAIInfographic() {
  const [infographic, setInfographic] = useState<InfographicData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const generateInfographic = useCallback(async (topic: string, style?: 'academic' | 'tech' | 'warm') => {
    setLoading(true);
    setError(null);
    setIsFallback(false);

    try {
      const result = await aiClient.post<{
        title: string; sections: Array<{ title: string; points: string[]; icon?: string }>;
        relations: Array<{ from: string; to: string; label: string }>;
        theme: string;
      }>('/api/v1/ai/infographic', { topic, theme: style || 'academic' });

      const mapped: InfographicData = {
        title: result.title,
        sections: (result.sections || []).map(s => ({
          title: s.title,
          points: s.points,
          icon: s.icon,
        })),
        relations: (result.relations || []).map(r => ({
          from: r.from,
          to: r.to,
          label: r.label,
        })),
        theme: (['academic', 'tech', 'warm'].includes(result.theme) ? result.theme : 'academic') as 'academic' | 'tech' | 'warm',
      };
      setInfographic(mapped);
      return mapped;
    } catch {
      setIsFallback(true);
      const fallback = { ...FALLBACK_INFOGRAPHIC, title: `${topic} — 知识概览` };
      setInfographic(fallback);
      setError('AI 信息图服务不可用，已使用默认信息图');
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  return { infographic, loading, error, isFallback, generateInfographic };
}