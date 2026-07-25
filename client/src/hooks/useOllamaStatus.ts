/**
 * Ollama 本地推理状态 React Hook
 *
 * 封装 IPC 调用，提供 Ollama 状态检测、配置管理和模型拉取能力。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { OllamaStatus, OllamaConfig, OllamaPullProgress } from '@/types/ollama';

/** Hook 返回值 */
export interface UseOllamaStatusReturn {
  /** Ollama 服务状态 */
  status: OllamaStatus | null;
  /** 用户配置 */
  config: OllamaConfig | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 刷新状态 */
  refresh: (force?: boolean) => void;
  /** 更新配置 */
  setConfig: (partial: Partial<OllamaConfig>) => Promise<void>;
  /** 拉取模型 */
  pullModel: (modelName: string) => Promise<void>;
  /** 模型拉取进度（0-100），null 表示未在拉取 */
  pullProgress: OllamaPullProgress | null;
}

/**
 * Ollama 本地推理状态 Hook
 *
 * 用法：
 * ```tsx
 * const { status, config, refresh, setConfig, pullModel, pullProgress } = useOllamaStatus();
 * ```
 */
export function useOllamaStatus(): UseOllamaStatusReturn {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [config, setConfigState] = useState<OllamaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null);
  const mountedRef = useRef(true);

  // 检测是否运行在 Electron 环境
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.ollama;

  // 加载状态
  const fetchStatus = useCallback(async (force = false) => {
    if (!isElectron) {
      setLoading(false);
      return;
    }
    try {
      const result = await window.electronAPI.ollama.getStatus(force);
      if (mountedRef.current) {
        setStatus(result.status);
        setConfigState(result.config);
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [isElectron]);

  // 初始加载
  useEffect(() => {
    mountedRef.current = true;
    fetchStatus();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchStatus]);

  // 监听模型拉取进度
  useEffect(() => {
    if (!isElectron) return;
    const unsubscribe = window.electronAPI.ollama.onPullProgress((progress) => {
      if (mountedRef.current) {
        setPullProgress(progress as OllamaPullProgress);
        // 拉取完成后刷新状态
        if ((progress as OllamaPullProgress).status === 'complete') {
          setTimeout(() => fetchStatus(true), 500);
        }
      }
    });
    return unsubscribe;
  }, [isElectron, fetchStatus]);

  // 刷新
  const refresh = useCallback((force = true) => {
    setLoading(true);
    fetchStatus(force);
  }, [fetchStatus]);

  // 更新配置
  const updateConfig = useCallback(async (partial: Partial<OllamaConfig>) => {
    if (!isElectron) return;
    try {
      const updated = await window.electronAPI.ollama.setConfig(partial);
      if (mountedRef.current) {
        setConfigState(updated);
      }
    } catch (err) {
      console.error('[useOllamaStatus] Failed to update config:', err);
    }
  }, [isElectron]);

  // 拉取模型
  const pull = useCallback(async (modelName: string) => {
    if (!isElectron) return;
    setPullProgress({ model: modelName, status: 'downloading', percent: 0 });
    try {
      await window.electronAPI.ollama.pullModel(modelName);
    } catch (err) {
      if (mountedRef.current) {
        setPullProgress({
          model: modelName,
          status: 'error',
          percent: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, [isElectron]);

  return {
    status,
    config,
    loading,
    refresh,
    setConfig: updateConfig,
    pullModel: pull,
    pullProgress,
  };
}
