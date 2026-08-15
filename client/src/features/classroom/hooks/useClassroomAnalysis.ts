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
import { oralCleanup } from '@/lib/capture/oralCleanup';

/** 对分析结果做口语书面化后处理（P1-4），返回新 result */
function withOralCleanup(result: AnalyzeResult): AnalyzeResult {
  if (!result.content) return result;
  return { ...result, content: oralCleanup(result.content) };
}

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
    // 守卫：关键帧或音频段任一非空即可分析（audio 模式无关键帧，
    // analyzeSession 会以首音频段为时间基准并补充转写——此前仅判
    // keyframes 导致 audio 会话无法全量分析）
    if (!smartBundle.keyframes?.length && !smartBundle.audioSegments?.length) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const fullBundle: SessionBundle = {
        keyframes: smartBundle.keyframes ?? [],
        audioSegments: smartBundle.audioSegments ?? [],
        timeline: smartBundle.timeline ?? [],
        duration: smartBundle.duration ?? 0,
      };
      const result = await analyzeSession(fullBundle, {
        language,
        sessionId: captureSessionIdRef?.current ?? undefined,
      });
      setAnalysisResult(withOralCleanup(result));
      // 全量分析完成，释放所有 keyframe imageBase64 内存；
      // P0-6：转写失败段的 audioBase64（回退补转写窗口已过）一并剥离
      setSmartBundle((prev) => ({
        ...prev,
        keyframes: (prev.keyframes ?? []).map((kf) => ({ ...kf, imageBase64: '' })),
        audioSegments: (prev.audioSegments ?? []).map((s) => (s.audioBase64 ? { ...s, audioBase64: '' } : s)),
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
      setAnalysisResult(withOralCleanup(result));
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
      setAnalysisResult(withOralCleanup(result));
    } catch {
      // 降级：本地拼接片段笔记（无需 AI，零网络，避免全量重发）
      // 为每个片段插入分隔标题，避免拼接后内容边界不清
      const localContent = oralCleanup(partials
        .map((p, idx) => `## 片段 ${idx + 1}\n\n${p.trim()}`)
        .join('\n\n---\n\n'));
      setAnalysisResult({
        content: localContent,
        keyframesAnalyzed: keyframeCount,
        modelUsed: 'local-concat',
      });
      onWarn('云端不可用，本次笔记为本地拼接，联网后可重新生成', {
        label: '重新合并',
        onClick: () => { void mergePartialNotes(partials, durationMs, keyframeCount); },
      });
    } finally {
      setIsAnalyzing(false);
      // P0-6 会话结束释放：合并/本地拼接完成后失败段 audioBase64 不再需要
      // （回退补转写窗口已过），统一剥离防长课堂无界累积
      setSmartBundle((prev) => ({
        ...prev,
        audioSegments: (prev.audioSegments ?? []).map((s) => (s.audioBase64 ? { ...s, audioBase64: '' } : s)),
      }));
    }
  }, [language, onWarn, captureSessionIdRef, setSmartBundle]);

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
