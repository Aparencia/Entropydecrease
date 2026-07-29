/**
 * 采集会话 AI 分析 hook（Path B 智能包 / Path C 视频）
 *
 * @ai-context: 从 CaptureSidebar 拆出。两条分析路径共用统一的错误分类
 * （网络/超时/服务端/未知 → 中文提示），消除原文件两处重复。
 * Path B 分析 SessionBundle（关键帧+语音段），Path C 分析录制视频文件。
 */
import { useState, useCallback } from 'react';
import { analyzeSession, analyzeVideo } from '@/lib/ai/sessionAnalyzer';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';
import type { SessionBundle, CaptureSidebarConfig } from '@/lib/capture';

/** 分析异常统一分类为用户可读提示 */
function classifyAnalysisError(err: unknown): string {
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return '无法连接AI网关，请检查网络';
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return '分析超时，请重试或缩短录制时长';
  }
  if (err instanceof Error && err.message.includes('HTTP')) {
    return '服务端错误：' + err.message;
  }
  return err instanceof Error ? err.message : '未知分析错误';
}

export function useCaptureAnalysis(language: CaptureSidebarConfig['language']) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  /** @ai-context Path B：调用多模态分析接口，生成结构化课堂笔记 */
  const analyzeBundle = useCallback(async (smartBundle: Partial<SessionBundle>) => {
    if (!smartBundle.keyframes || smartBundle.keyframes.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const fullBundle: SessionBundle = {
        keyframes: smartBundle.keyframes,
        audioSegments: smartBundle.audioSegments ?? [],
        timeline: smartBundle.timeline ?? [],
        duration: smartBundle.duration ?? 0,
      };
      const result = await analyzeSession(fullBundle, { language });
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(classifyAnalysisError(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [language]);

  /** @ai-context Path C：调用视频多模态分析接口，生成结构化课堂笔记 */
  const analyzeVideoFile = useCallback(async (targetPath: string, duration?: number) => {
    if (!targetPath) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const result = await analyzeVideo(targetPath, { duration, language });
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(classifyAnalysisError(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [language]);

  const dismissAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
  }, []);

  return {
    isAnalyzing, analysisResult, analysisError,
    analyzeBundle, analyzeVideoFile, dismissAnalysis,
  };
}
