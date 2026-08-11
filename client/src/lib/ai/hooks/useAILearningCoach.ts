/**
 * @ai-context: 学习教练 Hook：调用 AI 网关生成周计划。
 */
import { useState, useCallback } from 'react';
import { aiClient } from '@/lib/http/apiClient';
import type { WeeklyCoachPlan, CoachDayTask } from '../types';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function buildLocalPlan(weeklyStats?: string): WeeklyCoachPlan {
  const days: CoachDayTask[] = WEEKDAYS.map((day, i) => ({
    day,
    tasks: i < 5
      ? ['复习到期卡片（15分钟）', '深潜一个番茄钟（25分钟）']
      : ['回顾本周所学（20分钟）', '自由探索感兴趣的主题（15分钟）'],
    focus: i < 5 ? '巩固基础' : '拓展视野',
    estimatedMinutes: i < 5 ? 40 : 35,
  }));

  return {
    weekLabel: '本周计划',
    days,
    weeklyGoal: weeklyStats || '保持每天至少 30 分钟的有效学习',
    encouragement: '稳步前进，比昨天更好就是胜利。',
  };
}

export function useAILearningCoach() {
  const [plan, setPlan] = useState<WeeklyCoachPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const generatePlan = useCallback(async (weeklyStats?: string) => {
    setLoading(true);
    setError(null);
    setIsFallback(false);

    try {
      const result = await aiClient.post<{
        week_label: string; days: Array<{
          day: string; tasks: string[]; focus: string; estimated_minutes: number;
        }>;
        weekly_goal: string; encouragement: string;
      }>('/api/v1/ai/learning-coach', { weekly_stats: weeklyStats || '' });

      const mapped: WeeklyCoachPlan = {
        weekLabel: result.week_label,
        days: (result.days || []).map(d => ({
          day: d.day,
          tasks: d.tasks,
          focus: d.focus,
          estimatedMinutes: d.estimated_minutes,
        })),
        weeklyGoal: result.weekly_goal,
        encouragement: result.encouragement,
      };
      setPlan(mapped);
      return mapped;
    } catch {
      setIsFallback(true);
      const fallback = buildLocalPlan(weeklyStats);
      setPlan(fallback);
      setError('AI 学习教练服务不可用，已使用本地规划规则');
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  return { plan, loading, error, isFallback, generatePlan };
}