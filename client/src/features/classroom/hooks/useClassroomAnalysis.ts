/**
 * 课堂会话分析 hook（Path B 全量 / Path C 视频 / 增量合并）
 *
 * @ai-context: 从 useClassroomCapture 拆出。三条分析路径共用统一错误分类。
 * @ai-context: 增量优先策略——采集过程中每 5 张关键帧后台 analyzePartial，
 * 停止时优先 mergeNotes 快速合并（省去全量重发）；合并失败降级为本地
 * 拼接片段（零网络）；完全没有增量片段时才回退 analyzeSession 全量分析。
 * 分析完成后清空 keyframe.imageBase64 释放内存（单帧 base64 可达数百 KB）。
 */
import { useState, useCallback } from 'react';
import { analyzeSession, analyzeVideo, mergeNotes } from '@/lib/ai/sessionAnalyzer';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';
import type { SessionBundle, CaptureSidebarConfig, RecordingStatus } from '@/lib/capture';

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

interface UseClassroomAnalysisOptions {
  language: CaptureSidebarConfig['language'];
  smartBundle: Partial<SessionBundle>;
  setSmartBundle: React.Dispatch<React.SetStateAction<Partial<SessionBundle>>>;
  videoFilePath: string | null;
  recordingStatus: RecordingStatus | null;
  /** 真实采集会话 ID（关联笔记与关键帧图片目录），缺省时持久化处退化为随机 UUID */
  captureSessionIdRef?: React.MutableRefObject<string | null>;
  onWarn: (message: string) => void;
}

export function useClassroomAnalysis({
  language, smartBundle, setSmartBundle, videoFilePath, recordingStatus, captureSessionIdRef, onWarn,
}: UseClassroomAnalysisOptions) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  /** Path B：全量分析（无增量片段时的回退路径） */
  const handleAnalyze = useCallback(async () => {
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
      const result = await analyzeSession(fullBundle, {
        language,
        sessionId: captureSessionIdRef?.current ?? undefined,
      });
      setAnalysisResult(result);
      // 全量分析完成，释放所有 keyframe imageBase64 内存
      setSmartBundle((prev) => ({
        ...prev,
        keyframes: (prev.keyframes ?? []).map((kf) => ({ ...kf, imageBase64: '' })),
      }));
    } catch (err) {
      setAnalysisError(classifyAnalysisError(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [smartBundle, language, setSmartBundle, captureSessionIdRef]);

  /** Path C：视频分析 */
  const handleVideoAnalyze = useCallback(async (filePath?: string) => {
    const targetPath = filePath ?? videoFilePath;
    if (!targetPath) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const result = await analyzeVideo(targetPath, {
        duration: recordingStatus?.duration,
        language,
      });
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(classifyAnalysisError(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [videoFilePath, recordingStatus?.duration, language]);

  /** 增量片段合并为完整笔记；失败时本地拼接降级 */
  const mergePartialNotes = useCallback(async (partials: string[], durationMs: number, keyframeCount: number) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await mergeNotes(partials, {
        duration: durationMs / 1000,
        language,
        sessionId: captureSessionIdRef?.current ?? undefined,
      });
      setAnalysisResult(result);
    } catch {
      // 降级：本地拼接片段笔记（无需 AI，零网络，避免全量重发）
      // 为每个片段插入分隔标题，避免拼接后内容边界不清
      setAnalysisResult({
        content: partials
          .map((p, idx) => `## 片段 ${idx + 1}\n\n${p.trim()}`)
          .join('\n\n---\n\n'),
        keyframesAnalyzed: keyframeCount,
        modelUsed: 'local-concat',
      });
      onWarn('AI 合并不可用，已直接拼接片段笔记');
    } finally {
      setIsAnalyzing(false);
    }
  }, [language, onWarn, captureSessionIdRef]);

  const handleDismissAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
  }, []);

  return {
    isAnalyzing, analysisResult, analysisError,
    handleAnalyze, handleVideoAnalyze, mergePartialNotes, handleDismissAnalysis,
  };
}
