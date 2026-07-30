/**
 * 课堂采集事件订阅 hook（提取结果 / 关键帧增量分析 / 流式 ASR / VAD / 录制）
 *
 * @ai-context: 从 useClassroomCapture 拆出。集中订阅 captureEventBus 与
 * Electron IPC 帧流。
 * @ai-context: 关键帧到达时做两件事：①首帧触发一次 AI 课程识别（失败静默
 * 降级到规则模式）②累积到 5 帧后台 analyzePartial，完成后清空该批
 * imageBase64 释放内存（边采边分析，停止时只需合并片段而非全量重发）。
 * @ai-context: 语音段就绪后经信号量限流转写；实时转录列表 FIFO 上限 200 条，
 * 防止长课堂内存无限增长。ASR 连续失败 3 次提示用户。
 */
import { useState, useEffect, useRef } from 'react';
import { captureEventBus } from '@/lib/capture';
import type {
  CaptureManager,
  ExtractedSegment,
  SessionStatus,
  ScreenshotData,
  CapturePath,
  SessionBundle,
  KeyFrame,
  RecordingStatus,
  VideoRecording,
  VADStats,
  CaptureSidebarConfig,
  CourseMeta,
  AudioSegment,
} from '@/lib/capture';
import { analyzePartial } from '@/lib/ai/sessionAnalyzer';
import { detectCourseFromFrame } from '@/lib/ai/courseDetector';
import { transcribeWithRetry, toAsrLanguage, useAsrSemaphore } from '../utils/asrTranscriber';

/** 触发一次增量分析所需的关键帧数 */
const INCREMENTAL_BATCH_SIZE = 5;
/** 实时转录列表上限（FIFO） */
const MAX_LIVE_TRANSCRIPTS = 200;

export interface LiveTranscript {
  id: string;
  text: string;
  timestamp: number;
}

interface UseClassroomEventsOptions {
  captureManager: CaptureManager;
  status: SessionStatus;
  capturePath: CapturePath;
  language: CaptureSidebarConfig['language'];
  aiDetectEnabled: boolean;
  setCourseMeta: React.Dispatch<React.SetStateAction<CourseMeta>>;
  onNotify: (type: 'error', message: string) => void;
}

export function useClassroomEvents({
  captureManager, status, capturePath, language, aiDetectEnabled, setCourseMeta, onNotify,
}: UseClassroomEventsOptions) {
  const [segments, setSegments] = useState<ExtractedSegment[]>([]);
  const [stats, setStats] = useState({ frames: 0, extracted: 0 });
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [smartBundle, setSmartBundle] = useState<Partial<SessionBundle>>({});
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscript[]>([]);
  const [vadStats, setVadStats] = useState<VADStats | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);
  const [partialCount, setPartialCount] = useState(0);
  const [transcribedCount, setTranscribedCount] = useState(0);

  const partialNotesRef = useRef<string[]>([]);
  const pendingKeyframesRef = useRef<KeyFrame[]>([]);
  const isPartialAnalyzingRef = useRef(false);
  const courseDetectedRef = useRef(false);
  const asr = useAsrSemaphore();

  // 提取结果
  useEffect(() => {
    const offCompleted = captureEventBus.on<{
      sessionId: string | null;
      result: { text: string; confidence: number; source: 'vision' | 'audio' | 'ui_automation' };
      segment: { id: string; timestamp: Date };
      extractedCount: number;
    }>('extraction:completed', (data) => {
      const uiSegment: ExtractedSegment = {
        id: data.segment.id,
        timestamp: data.segment.timestamp.getTime(),
        source: data.result.source,
        text: data.result.text,
        confidence: data.result.confidence,
      };
      setSegments((prev) => [...prev, uiSegment]);
      setStats((prev) => ({ ...prev, extracted: data.extractedCount }));
      setExtractionError(null);
    });

    const offError = captureEventBus.on<{ message: string }>(
      'extraction:error',
      (data) => setExtractionError(data.message),
    );

    return () => { offCompleted(); offError(); };
  }, []);

  // Path B：关键帧（课程识别 + 增量分析）与 bundle 就绪
  useEffect(() => {
    const offKeyframe = captureEventBus.on<{ sessionId: string; keyframe: KeyFrame }>(
      'smart:keyframe',
      (data) => {
        setSmartBundle((prev) => ({
          ...prev,
          keyframes: [...(prev.keyframes ?? []), data.keyframe],
        }));

        // AI 课程识别：仅第 1 帧触发一次
        if (aiDetectEnabled && !courseDetectedRef.current) {
          courseDetectedRef.current = true;
          detectCourseFromFrame(data.keyframe.imageBase64)
            .then((detected) => {
              if (detected) {
                setCourseMeta((prev) => ({ ...prev, ...detected, detectedBy: 'ai' }));
              }
            })
            .catch(() => { /* 静默降级到规则模式 */ });
        }

        // 增量分析：累积到缓冲区，达到批次大小时触发后台分析
        pendingKeyframesRef.current.push(data.keyframe);
        if (pendingKeyframesRef.current.length >= INCREMENTAL_BATCH_SIZE && !isPartialAnalyzingRef.current) {
          const batch = pendingKeyframesRef.current.splice(0, INCREMENTAL_BATCH_SIZE);
          isPartialAnalyzingRef.current = true;
          analyzePartial(batch, { language })
            .then((partial) => {
              partialNotesRef.current.push(partial);
              setPartialCount(partialNotesRef.current.length);
              // 分析完成，释放 keyframe imageBase64 内存
              const batchIds = new Set(batch.map((kf) => kf.id));
              setSmartBundle((prev) => ({
                ...prev,
                keyframes: (prev.keyframes ?? []).map((kf) =>
                  batchIds.has(kf.id) ? { ...kf, imageBase64: '' } : kf,
                ),
              }));
            })
            .catch((err) => {
              console.warn('[useClassroomCapture] 增量分析失败，跳过本批次:', err);
            })
            .finally(() => {
              isPartialAnalyzingRef.current = false;
            });
        }
      },
    );
    const offBundleReady = captureEventBus.on<{ sessionId: string; bundle: SessionBundle }>(
      'smart:bundle_ready',
      (data) => setSmartBundle(data.bundle),
    );
    return () => { offKeyframe(); offBundleReady(); };
  }, [language, aiDetectEnabled, setCourseMeta]);

  // Path B：流式 ASR — 语音段完成后立即转写（带超时/重试/健康监测）
  useEffect(() => {
    const offSegmentReady = captureEventBus.on<{ sessionId: string; segment: AudioSegment }>(
      'smart:audio_segment_ready',
      (data) => {
        const seg = data.segment;
        // 先将音频段加入 bundle
        setSmartBundle((prev) => ({
          ...prev,
          audioSegments: [...(prev.audioSegments ?? []), seg],
        }));

        // 后台流式 ASR 转写（不阻塞采集，受并发控制）
        if (!seg.audioBase64) return;
        const slot = asr.acquire();
        if (!slot) return; // 队列已满且丢弃了本段
        slot.then(() => {
          transcribeWithRetry({
            audio_base64: seg.audioBase64,
            language: toAsrLanguage(language),
            sample_rate: 16000,
            channels: 1,
          })
            .then((text) => {
              asr.markSuccess();
              // 将转写结果回填到对应的音频段
              setSmartBundle((prev) => ({
                ...prev,
                audioSegments: (prev.audioSegments ?? []).map((s) =>
                  s.id === seg.id ? { ...s, audioText: text } : s,
                ),
              }));
              if (text) {
                setTranscribedCount((c) => c + 1);
                // 实时转录上屏（FIFO 上限控制）
                setLiveTranscripts((prev) => {
                  const next = [...prev, { id: seg.id, text, timestamp: seg.timestampStart }];
                  return next.length > MAX_LIVE_TRANSCRIPTS
                    ? next.slice(next.length - MAX_LIVE_TRANSCRIPTS)
                    : next;
                });
              }
            })
            .catch((err) => {
              console.warn('[useClassroomCapture] 流式 ASR 转写失败:', err);
              if (asr.markFailure()) {
                onNotify('error', 'ASR 服务连续失败，语音转写可能不可用，请检查网络或 AI 网关');
              }
            })
            .finally(() => asr.release());
        });
      },
    );
    return () => { offSegmentReady(); };
  }, [language, asr, onNotify]);

  // Path B：VAD 统计
  useEffect(() => {
    const offVadStats = captureEventBus.on<{ sessionId: string; stats: VADStats }>(
      'smart:vad_stats',
      (data) => setVadStats(data.stats),
    );
    return () => { offVadStats(); };
  }, []);

  // Path C：录制视频就绪
  useEffect(() => {
    const offVideoReady = captureEventBus.on<{ sessionId: string; videoRecording: VideoRecording }>(
      'record:video_ready',
      (data) => {
        if (data.videoRecording.filePath) setVideoFilePath(data.videoRecording.filePath);
      },
    );
    return () => { offVideoReady(); };
  }, []);

  // Path C：轮询录制状态
  useEffect(() => {
    if (capturePath !== 'full_record' || status !== 'capturing') return;
    const poll = async () => {
      try {
        const result = await window.electronAPI?.invoke('video_record_status') as RecordingStatus | undefined;
        if (result) setRecordingStatus(result);
      } catch { /* silent */ }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [capturePath, status]);

  // 截图帧
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;
    const off = window.electronAPI.on('screen_capture_frame', (...args: unknown[]) => {
      const frameData = args[0] as ScreenshotData;
      captureManager.pushFrame(frameData);
      setStats((prev) => ({ ...prev, frames: prev.frames + 1 }));
    });
    return off;
  }, [status, captureManager]);

  return {
    segments, setSegments, stats, setStats, extractionError,
    smartBundle, setSmartBundle,
    liveTranscripts, setLiveTranscripts,
    vadStats, recordingStatus, setRecordingStatus,
    videoFilePath, setVideoFilePath,
    partialCount, setPartialCount, transcribedCount,
    partialNotesRef, pendingKeyframesRef, isPartialAnalyzingRef,
  };
}
