/**
 * @ai-context: notes 功能模块 Hook：useAnalyzeBridge。
 */
import { useRef, useCallback } from 'react';

// ================================================================
// useAnalyzeBridge — 在 useCaptureSession 与 useCaptureAnalysis 之间
// 建立稳定的回调桥接，避免 hook 调用顺序的 TDZ 问题
// ================================================================

export function useAnalyzeBridge() {
  const analyzeRef = useRef<(() => void) | null>(null);
  const videoAnalyzeRef = useRef<((filePath?: string) => void) | null>(null);

  // 稳定引用，传给 useCaptureSession
  const stableAnalyze = useCallback(() => { analyzeRef.current?.(); }, []);
  const stableVideoAnalyze = useCallback((filePath?: string) => { videoAnalyzeRef.current?.(filePath); }, []);

  // 每次渲染后同步最新分析回调
  const updateAnalysis = useCallback((handlers: {
    handleAnalyze: () => void;
    handleVideoAnalyze: (filePath?: string) => void;
  }) => {
    analyzeRef.current = handlers.handleAnalyze;
    videoAnalyzeRef.current = handlers.handleVideoAnalyze;
  }, []);

  return { stableAnalyze, stableVideoAnalyze, updateAnalysis };
}
