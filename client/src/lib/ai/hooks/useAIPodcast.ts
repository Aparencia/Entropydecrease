/**
 * @ai-context: 播客生成器 Hook：调用 AI 网关生成学习播客内容。
 */
import { useState, useCallback } from 'react';
import { aiClient } from '@/lib/http/apiClient';
import type { PodcastData, PodcastSegment, SpeakerRole } from '../types';

const FALLBACK_PODCAST: PodcastData = {
  title: '知识小酌',
  segments: [
    { speaker: 'host', text: '欢迎收听今天的知识小酌，我们来聊聊一个有趣的话题。', duration: 15 },
    { speaker: 'guest', text: '感谢邀请。这个话题确实有很多值得探讨的地方。', duration: 20 },
    { speaker: 'host', text: '让我们从最基础的概念开始，逐步深入。', duration: 10 },
  ],
  totalDuration: 45,
  guestIntro: '一位虚拟知识分享者',
};

/** 合法角色集合：AI 返回未知 speaker 时回退 narrator（防渲染崩溃） */
const SPEAKER_ROLES: readonly SpeakerRole[] = ['host', 'guest'];

/** 校验并归一化 AI 返回的 speaker 值 */
function normalizeSpeaker(raw: string): SpeakerRole {
  return SPEAKER_ROLES.includes(raw as SpeakerRole) ? (raw as SpeakerRole) : 'host';
}

export function useAIPodcast() {
  const [podcast, setPodcast] = useState<PodcastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const generatePodcast = useCallback(async (topic: string, depth?: 'basic' | 'advanced') => {
    setLoading(true);
    setError(null);
    setIsFallback(false);

    try {
      const result = await aiClient.post<{
        title: string; segments: Array<{ speaker: string; text: string; duration?: number }>;
        total_duration?: number; guest_intro?: string;
      }>('/api/v1/ai/podcast', { topic, depth: depth || 'basic' });

      const mapped: PodcastData = {
        title: result.title,
        segments: (result.segments || []).map(s => ({
          speaker: normalizeSpeaker(s.speaker),
          text: s.text,
          duration: s.duration,
        })),
        totalDuration: result.total_duration,
        guestIntro: result.guest_intro,
      };
      setPodcast(mapped);
      return mapped;
    } catch {
      setIsFallback(true);
      const fallback = { ...FALLBACK_PODCAST, title: `${topic} — 知识小酌` };
      setPodcast(fallback);
      setError('AI 播客服务不可用，已使用默认播客内容');
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  return { podcast, loading, error, isFallback, generatePodcast };
}