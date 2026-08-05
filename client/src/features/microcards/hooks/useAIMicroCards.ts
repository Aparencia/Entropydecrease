/**
 * AI 微卡生成 Hook — 状态管理 + 离线降级
 * AI micro-card hook — state + graceful degradation
 *
 * @ai-context: generate() 调 aiClient 微卡链；网关不可达/空结果时降级为
 * 本地示例卡（isFallback=true，UI 显示"离线模式"提示，不弹错误）。
 * swipe() 只改本地状态（左滑已会 / 右滑不会 / 上滑深入）。
 * @ai-context: Falls back to local sample cards when the gateway is
 * unreachable; swipe() mutates local state only.
 */
import { useCallback, useState } from 'react';
import {
  fetchAIMicroCards,
  FALLBACK_MICRO_CARDS,
  type MicroCard,
  type MicroCardPayload,
  type MicroCardStatus,
} from '../lib/microCardApi';

function toCard(payload: MicroCardPayload, index: number, now: number): MicroCard {
  return {
    id: `mc_${now}_${index}`,
    front: payload.front,
    back: payload.back,
    tag: payload.tag,
    difficulty: (payload.difficulty ?? 2) as MicroCard['difficulty'],
    status: 'pending',
    createdAt: now,
  };
}

export function useAIMicroCards() {
  const [cards, setCards] = useState<MicroCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [topic, setTopic] = useState('');

  /** 生成一组微卡（失败 → 本地示例卡 + 离线标记） */
  const generate = useCallback(async (input: string): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setTopic(trimmed);
    setLoading(true);
    setIsFallback(false);
    try {
      const payloads = await fetchAIMicroCards(trimmed);
      if (!payloads || payloads.length === 0) throw new Error('empty');
      const now = Date.now();
      setCards(payloads.map((p, i) => toCard(p, i, now)));
    } catch {
      // 网关不可达 → 本地示例卡（离线模式，不打断微学习流）
      setIsFallback(true);
      const now = Date.now();
      setCards(FALLBACK_MICRO_CARDS.map((p, i) => toCard(p, i, now)));
    } finally {
      setLoading(false);
    }
  }, []);

  /** 处理一张卡（左滑已会 / 右滑不会 / 上滑深入） */
  const swipe = useCallback((cardId: string, status: MicroCardStatus): void => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status } : c)));
  }, []);

  return { cards, loading, isFallback, topic, setTopic, generate, swipe };
}
