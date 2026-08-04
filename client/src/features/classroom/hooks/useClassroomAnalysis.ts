/**
 * 课堂会话分析 hook（Path B 全量 / Path C 视频 / 增量合并）
 *
 * @ai-context: 从 useClassroomCapture 拆出。三条分析路径共用统一错误分类。
 * @ai-context: 增量优先策略——采集过程中每 5 张关键帧后台 analyzePartial，
 * 停止时优先 mergeNotes 快速合并（省去全量重发）；合并失败降级为本地
 * 拼接片段（零网络）；完全没有增量片段时才回退 analyzeSession 全量分析。
 * 分析完成后清空 keyframe.imageBase64 释放内存（单帧 base64 可达数百 KB）。
 */
import { useState, useCallback, useRef } from 'react';
import { analyzeSession, analyzeVideo, mergeNotes } from '@/lib/ai/sessionAnalyzer';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';
import type { SessionBundle, CaptureSidebarConfig, RecordingStatus } from '@/lib/capture';
import { classifyAnalysisError } from '../utils/analysisErrors';
import type { AnalysisErrorInfo } from '../utils/analysisErrors';

interface UseClassroomAnalysisOptions {
  language: CaptureSidebarConfig['language'];
  smartBundle: Partial<SessionBundle>;
  setSmartBundle: React.Dispatch<React.SetStateAction<Partial<SessionBundle>>>;
  videoFilePath: string | null;
  recordingStatus: RecordingStatus | null;
  /** 真实采集会话 ID（关联笔记与关键帧图片目录），缺省时持久化处退化为随机 UUID */
  captureSessionIdRef?: React.MutableRefObject<string | null>;
  /** 警告提示；action 可选，用于降级态附带操作按钮（如「重新合并」） */
  onWarn: (message: string, action?: { label: string; onClick: () => void }) => void;
}

export function useClassroomAnalysis({
  language, smartBundle, setSmartBundle, videoFilePath, recordingStatus, captureSessionIdRef, onWarn,
}: UseClassroomAnalysisOptions) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResult | null>(null);
  /** P0-1：结构化错误（类别+文案+操作建议），取代裸字符串 */
  const [analysisError, setAnalysisError] = useState<AnalysisErrorInfo | null>(null);
  /** P0-2：最近一次合并的 partials 快照，供 local-concat 降级后重试 merge */
  const lastPartialsRef = useRef<{ partials: string[]; durationMs: number; keyframeCount: number } | null>(null);

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
    // 留存快照：local-concat 降级后支持「重新合并」重试（P0-2）
    lastPartialsRef.current = { partials, durationMs, keyframeCount };
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
      onWarn('云端不可用，本次笔记为本地拼接，联网后可重新生成', {
        label: '重新合并',
        onClick: () => { void mergePartialNotes(partials, durationMs, keyframeCount); },
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [language, onWarn, captureSessionIdRef]);

  /** 用最近一次 partials 快照重跑合并（local-concat 降级后的重试入口） */
  const handleRetryMerge = useCallback(() => {
    const snapshot = lastPartialsRef.current;
    if (!snapshot) return;
    void mergePartialNotes(snapshot.partials, snapshot.durationMs, snapshot.keyframeCount);
  }, [mergePartialNotes]);

  const handleDismissAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
  }, []);

  return {
    isAnalyzing, analysisResult, analysisError,
    handleAnalyze, handleVideoAnalyze, mergePartialNotes, handleRetryMerge, handleDismissAnalysis,
  };
}
