/**
 * 学习规划器 — Hook（生成/加载/勾选/重生成）
 *
 * @ai-context: 今日计划生成链路：已存在则直接加载；否则先调 AI 网关
 * （ai_learning_plan IPC，本地 Ollama 降级），AI 失败或返回空时回退
 * 本地规则规划（buildLocalPlan，离线可用）。错误不抛出——UI 保持
 * 可用，来源以 plan.source 区分。
 * @ai-context: Daily plan hook: loads today's plan, generates via AI when
 * missing, falls back to local rule planning on AI failure (offline-first).
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  buildLocalPlan, buildPlanContextText, loadPlan, planFromAI,
  savePlan, todayISO,
} from '../lib/planRepository';
import type { LearningPlan } from '../types';

export interface UseLearningPlanReturn {
  plan: LearningPlan | null;
  loading: boolean;
  /** 重新生成（AI 优先，失败回退本地） */
  regenerate: () => Promise<void>;
  /** 勾选/取消任务完成 */
  toggleDone: (itemId: string) => void;
}

export function useLearningPlan(): UseLearningPlanReturn {
  const { session } = useAuth();
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [loading, setLoading] = useState(true);

  /** 生成计划：AI 优先，本地规则兜底 */
  const generate = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const ctx = await buildPlanContextText();
      let next: LearningPlan | null = null;

      // AI 路径（Electron 可用时；失败/空结果静默回退）
      if (window.electronAPI) {
        try {
          const resp = await window.electronAPI.invoke('ai_learning_plan', {
            masterySummary: ctx.masterySummary,
            dueCounts: ctx.dueCounts,
            peakHours: ctx.peakHours,
            weeklyGoalMinutes: ctx.weeklyGoalMinutes,
            todayMinutes: ctx.todayMinutes,
            authToken: session?.access_token ?? null,
          }) as {
            date?: string;
            items?: Array<{ module: string; title?: string; minutes?: number; task?: string; reason?: string; order?: number }>;
            note?: string;
            status?: string;
          };
          next = planFromAI(resp);
        } catch {
          next = null;
        }
      }

      // 本地规则兜底（离线可用）
      if (!next) {
        next = await buildLocalPlan();
      }

      savePlan(next);
      setPlan(next);
    } catch {
      // 极端情况下保证 UI 可用：本地规则也应兜底
      try {
        const fallback = await buildLocalPlan();
        savePlan(fallback);
        setPlan(fallback);
      } catch {
        setPlan(null);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    const existing = loadPlan(todayISO());
    if (existing) {
      setPlan(existing);
      setLoading(false);
    } else {
      void generate();
    }
  }, [generate]);

  const regenerate = useCallback(async () => {
    await generate();
  }, [generate]);

  const toggleDone = useCallback((itemId: string) => {
    // updater 必须为纯函数：StrictMode 下 React 会双调用 updater 探测副作用，
    // 若在 updater 内读改写 localStorage，第二次调用会基于已写入的存储读到
    // 翻转后的状态，导致勾选被反向撤销（dev 模式失效）。
    // 持久化统一收敛到下方 useEffect（plan 变化时写回），updater 只做内存更新。
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
      };
    });
  }, []);

  // 持久化：plan 变化（勾选/生成）后写回 localStorage（幂等，失败静默）
  useEffect(() => {
    if (plan) savePlan(plan);
  }, [plan]);

  return { plan, loading, regenerate, toggleDone };
}
