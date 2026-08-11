/**
 * @ai-context: Debate 功能的 React Hook 包装：调用 aiClient 辩论端点，提供本地降级。
 */
import { useState, useCallback, useRef } from 'react';
import { aiClient } from '@/lib/http/apiClient';
import type { DebateRound, DebateResult, DebateType } from '../types';

const LOCAL_DEBATE_RESPONSES: Record<DebateType, string[]> = {
  academic: [
    '从学术角度看，这个观点忽略了关键的前提假设。让我从方法论角度提出质疑。',
    '你的论证建立在未经验证的因果假设上。在学术讨论中，这需要更严格的证据支撑。',
    '有趣的观点，但你是否考虑过替代解释？科学方法要求我们排除其他可能性。',
  ],
  policy: [
    '这个政策方案的实施成本可能远超预期。让我从可行性角度提出几点质疑。',
    '政策的 unintended consequences 往往被低估。你是否考虑过潜在的负面外部性？',
    '从执行层面看，这个方案面临几个现实障碍。让我们逐条分析。',
  ],
  value: [
    '你的价值判断默认了一个特定的道德框架。但不同的伦理体系会得出不同的结论。',
    '这个价值观立场在普遍性和特殊性之间存在张力。如何平衡这两者？',
    '你的论证诉诸某种直觉，但直觉在不同文化背景下可能截然不同。',
  ],
  speculative: [
    '如果从这个前提继续推演，会得出一个有趣的悖论。你准备好面对这个矛盾了吗？',
    '你的假设本身值得质疑。让我们做一个思想实验，看看它是否真的成立。',
    '这个想法很有创意，但它是否经得起 Occam\'s Razor 的检验？',
  ],
};

export function useAIDebate() {
  const [rounds, setRounds] = useState<DebateRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [isFallback, setIsFallback] = useState(false);
  // H4: 同步 in-flight 守卫——loading 是异步 setState，双击提交时闭包旧值
  // 会两次通过检查导致分数重复累加；用 ref 同步拦截
  const submittingRef = useRef(false);

  const startDebate = useCallback(async (topic: string, debateType: DebateType) => {
    setLoading(true);
    setError(null);
    setIsFallback(false);
    setRounds([]);
    setTotalScore(0);

    try {
      const result = await aiClient.post<{
        rounds: Array<{
          round_number: number; ai_argument: string; user_counter: string;
          ai_rebuttal?: string; score?: number;
        }>;
        total_score: number; scoring_breakdown: string;
        status: string; topic: string; debate_type: string;
      }>('/api/v1/ai/debate', { topic, debate_type: debateType });

      const mapped: DebateRound[] = (result.rounds || []).map(r => ({
        roundNumber: r.round_number,
        aiArgument: r.ai_argument,
        userCounter: r.user_counter,
        aiRebuttal: r.ai_rebuttal,
        score: r.score,
      }));

      setRounds(mapped);
      setTotalScore(result.total_score);
      return { rounds: mapped, totalScore: result.total_score, scoringBreakdown: result.scoring_breakdown } as DebateResult;
    } catch {
      // 本地降级：提供结构化辩论响应
      setIsFallback(true);
      const localResponses = LOCAL_DEBATE_RESPONSES[debateType] || LOCAL_DEBATE_RESPONSES.academic;
      const localRound: DebateRound = {
        roundNumber: 1,
        aiArgument: localResponses[0],
        userCounter: '',
        score: 5,
      };
      setRounds([localRound]);
      setTotalScore(5);
      return {
        rounds: [localRound],
        topic,
        debateType,
        totalScore: 5,
        scoringBreakdown: 'AI 服务不可用，使用本地辩论模板',
        status: 'fallback',
      } as DebateResult;
    } finally {
      setLoading(false);
    }
  }, []);

  const submitCounter = useCallback(async (
    topic: string, debateType: DebateType, userCounter: string, roundNumber: number,
  ) => {
    // H4: 同步守卫——进行中的提交直接拒绝（loading state 异步更新无法防双击）
    if (submittingRef.current) return null;
    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await aiClient.post<{
        rebuttal: string; score: number; next_round?: { round_number: number; ai_argument: string };
      }>('/api/v1/ai/debate/counter', {
        topic, debate_type: debateType, user_counter: userCounter, round_number: roundNumber,
      });

      setRounds(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(r => r.roundNumber === roundNumber);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], userCounter, aiRebuttal: result.rebuttal, score: result.score };
        }
        return updated;
      });
      setTotalScore(prev => prev + (result.score || 0));

      if (result.next_round) {
        const newRound: DebateRound = {
          roundNumber: result.next_round.round_number,
          aiArgument: result.next_round.ai_argument,
          userCounter: '',
          score: undefined,
        };
        setRounds(prev => [...prev, newRound]);
      }

      return result;
    } catch {
      // H4: 错误必须可见——原实现 catch 从不 setError，AI 失败时用户
      // 只看到无响应的按钮；本地降级时也提示已降级
      setIsFallback(true);
      setError('AI 辩论服务不可用，已使用本地辩论模板');
      const localResponses = LOCAL_DEBATE_RESPONSES[debateType] || LOCAL_DEBATE_RESPONSES.academic;
      const rebuttalIdx = roundNumber % localResponses.length;
      const localRebuttal = localResponses[rebuttalIdx];

      setRounds(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(r => r.roundNumber === roundNumber);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], userCounter, aiRebuttal: localRebuttal, score: 5 };
        }
        return updated;
      });
      setTotalScore(prev => prev + 5);

      // 添加下一轮
      const nextRound: DebateRound = {
        roundNumber: roundNumber + 1,
        aiArgument: localResponses[(rebuttalIdx + 1) % localResponses.length],
        userCounter: '',
      };
      setRounds(prev => [...prev, nextRound]);

      return { rebuttal: localRebuttal, score: 5, next_round: { round_number: roundNumber + 1, ai_argument: nextRound.aiArgument } };
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }, []);

  return { rounds, loading, error, totalScore, isFallback, startDebate, submitCounter };
}