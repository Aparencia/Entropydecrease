/** @file 学习分析聚合 Hook — Worker 通信 + 状态管理 + 刷新接口 *
 * @ai-context: dashboard 功能模块 Hook：useLearningAnalytics。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalyticsAggregate } from '../types/analytics';
import type { AggregateInput } from '../utils/aggregator';
import { pomodoroSessionStore, flashcardStore, flashcardReviewStore } from '@/lib/storage';
import { useNoteStore } from '@/features/notes/store/useNoteStore';
import { useFeynmanStore } from '@/features/feynman/store/useFeynmanStore';

/** Hook 返回类型 */
export interface UseLearningAnalyticsReturn {
  data: AnalyticsAggregate | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * 学习分析聚合 Hook — 创建 Worker，收集各 store 数据后发送聚合请求
 * @param days 统计天数，默认 30
 */
export function useLearningAnalytics(days = 30): UseLearningAnalyticsReturn {
  const [data, setData] = useState<AnalyticsAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const daysRef = useRef(days);
  daysRef.current = days;
  const mountedRef = useRef(true);

  /** 从各 store 收集数据并发送给 Worker */
  const fetchData = useCallback(async (worker: Worker) => {
    setLoading(true); setError(null);
    try {
      // 竞态修复：挂载时 notes/feynmanNotes 可能尚未加载完成（loadNotes 异步），
      // 直接聚合会按空数据计算——学习画像出勤率/持续性恒 0。先确保数据就绪。
      const noteState = useNoteStore.getState();
      if (noteState.notes.length === 0 && !noteState.isLoading) {
        await noteState.loadNotes();
      }
      const feynmanState = useFeynmanStore.getState();
      if (feynmanState.notes.length === 0 && !feynmanState.isLoading) {
        await feynmanState.loadNotes();
      }
      const notes = useNoteStore.getState().notes;
      const feynmanNotes = useFeynmanStore.getState().notes;
      const [sessions, flashcards, reviews] = await Promise.all([
        pomodoroSessionStore.getAll(), flashcardStore.getAll(), flashcardReviewStore.getAll(),
      ]);
      const input: AggregateInput = { sessions, notes, flashcards, feynmanNotes, reviews };
      worker.postMessage({ type: 'aggregate', payload: { data: input, days: daysRef.current } });
    } catch (err) {
      setError(`数据加载失败: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('@/workers/analyticsWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    mountedRef.current = true;
    worker.addEventListener('message', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      if (e.data.type === 'result') { setData(e.data.data); setLoading(false); }
      else if (e.data.type === 'error') { setError(e.data.message); setLoading(false); }
    });
    fetchData(worker);
    return () => { mountedRef.current = false; worker.terminate(); workerRef.current = null; };
  }, [fetchData]);

  const refresh = useCallback(() => {
    if (workerRef.current && mountedRef.current) fetchData(workerRef.current);
  }, [fetchData]);

  return { data, loading, error, refresh };
}
