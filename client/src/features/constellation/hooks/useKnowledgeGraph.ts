/**
 * 知识星座数据 Hook（30s 轮询 + 焦点事件失效）
 * Knowledge constellation data hook
 *
 * @ai-context: 阶段 B 数据接线。经 knowledge:get-graph 获取三路原始
 * 数据（主进程只读聚合，limit 封顶 100），在渲染进程用纯函数层
 * buildKnowledgeGraph 派生图谱（派生规则单测覆盖）。轮询 30s 一档；
 * 窗口重新聚焦/页面回到可见时立即刷新（事件驱动失效的轻量实现）。
 * 失败静默降级：保留旧图不闪断，星座是外壳增强项不影响主流程。
 *
 * @ai-context: Polls the read-only graph aggregate every 30s and
 * refreshes on window focus. Failures keep the previous graph.
 */
import { useCallback, useEffect, useState } from 'react';
import { buildKnowledgeGraph, type KnowledgeGraph } from '../lib/knowledgeGraph';
import type { KnowledgeGraphData } from '../types';

/** 轮询间隔（毫秒） / Poll interval */
const POLL_MS = 30_000;

export interface UseKnowledgeGraphResult {
  /** 派生图谱；首载失败或尚无数据时为 null（组件自行降级展示） */
  graph: KnowledgeGraph | null;
  /** 仅首载为 true；后台刷新不闪烁 */
  loading: boolean;
  /** 最近一次失败原因（成功或首载前为 null） */
  error: string | null;
  /** 手动触发一次刷新 */
  refresh: () => Promise<void>;
}

/** 知识星座数据 Hook / Knowledge constellation data hook */
export function useKnowledgeGraph(pollMs: number = POLL_MS): UseKnowledgeGraphResult {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!window.electronAPI?.invoke) return;
    try {
      // IPC 返回形状见 features/constellation/types.ts（结构化类型断言）
      const data = await window.electronAPI.invoke('knowledge:get-graph') as KnowledgeGraphData;
      setGraph(buildKnowledgeGraph(data));
      setError(null);
    } catch (err) {
      // 失败静默：保留旧图避免星座闪断
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, pollMs);
    const onFocus = () => { void load(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, pollMs]);

  return { graph, loading, error, refresh: load };
}
