/**
 * @ai-context: 概念拟人化 Hook：调用 AI 网关将概念拟人化为角色。
 */
import { useState, useCallback } from 'react';
import { aiClient } from '@/lib/http/apiClient';
import type { PersonaData, RelationshipDrama, RelationshipType } from '../types';

const FALLBACK_PERSONA: PersonaData = {
  concept: '概念',
  name: '未知角色',
  personality: '温和而有耐心，喜欢用比喻解释复杂问题',
  backstory: '作为一个知识概念，一直在默默等待被理解',
  catchphrase: '换个角度看看，也许会有新的发现',
  relationships: [],
};

export function useAIPersonify() {
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const personify = useCallback(async (concept: string, context?: string) => {
    setLoading(true);
    setError(null);
    setIsFallback(false);

    try {
      const result = await aiClient.post<{
        concept: string; name: string; personality: string;
        backstory: string; catchphrase: string;
        relationships: Array<{
          target_concept: string; relationship: string; story: string;
        }>;
        appearance?: string;
      }>('/api/v1/ai/personify', { concept, context: context || '' });

      const mapped: PersonaData = {
        concept: result.concept,
        name: result.name,
        personality: result.personality,
        backstory: result.backstory,
        catchphrase: result.catchphrase,
        relationships: (result.relationships || []).map(r => ({
          targetConcept: r.target_concept,
          relationship: r.relationship as RelationshipType,
          story: r.story,
        })),
        appearance: result.appearance,
      };
      setPersona(mapped);
      return mapped;
    } catch {
      setIsFallback(true);
      const fallback = { ...FALLBACK_PERSONA, concept };
      setPersona(fallback);
      setError('AI 拟人化服务不可用，已使用默认角色');
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  return { persona, loading, error, isFallback, personify };
}