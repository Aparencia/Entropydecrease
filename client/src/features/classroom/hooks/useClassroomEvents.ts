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
import { useToast } from '@/components/ui/Toast';
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
  TimelineEntry,
} from '@/lib/capture';
import { analyzePartial } from '@/lib/ai/sessionAnalyzer';
import { detectCourseFromFrame } from '@/lib/ai/courseDetector';
import { remapKeyframeMarkers } from '../utils/tipTapImageUtils';
import { persistKeyframeImage } from '../utils/keyframePersistence';
import { transcribeWithRetry, toAsrLanguage, useAsrSemaphore, isLocalAsrReady, setOnAsrFallback } from '../utils/asrTranscriber';
import { applySessionReplaces } from '../utils/hotwordRuntime';
import { cleanAsrResult } from '@/lib/capture/asrFilters';

/** 触发一次增量分析所需的关键帧数 */
const INCREMENTAL_BATCH_SIZE = 5;
/** 实时转录列表上限（FIFO） */
const MAX_LIVE_TRANSCRIPTS = 200;
/** 时间线条目上限（FIFO，防止长课堂无界增长） */
const MAX_TIMELINE_ENTRIES = 500;

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
  /** 真流式 ASR 是否激活（激活时跳过按段转写，改用流式 partial/final） */
  streamingAsrActive: boolean;
}

export function useClassroomEvents({
  captureManager, status, capturePath, language, aiDetectEnabled, setCourseMeta, onNotify,
  streamingAsrActive,
}: UseClassroomEventsOptions) {
  const [segments, setSegments] = useState<ExtractedSegment[]>([]);
  const [stats, setStats] = useState({ frames: 0, extracted: 0 });
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [smartBundle, setSmartBundle] = useState<Partial<SessionBundle>>({});
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscript[]>([]);
  const [vadStats, setVadStats] = useState<VADStats | null>(null);
  /** 真流式当前进行中的 partial 文本（实时上屏，断句后清空） */
  const [partialText, setPartialText] = useState('');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);
  const [partialCount, setPartialCount] = useState(0);
  const [transcribedCount, setTranscribedCount] = useState(0);

  const partialNotesRef = useRef<string[]>([]);
  const pendingKeyframesRef = useRef<KeyFrame[]>([]);
  const isPartialAnalyzingRef = useRef(false);
  const courseDetectedRef = useRef(false);
  /** @ai-context 会话时间基准（epoch ms）：记录首帧 timestamp，供 analyzePartial 换算相对秒数 */
  const sessionStartMsRef = useRef<number | null>(null);
  /** 采集会话 ID（smart:keyframe 事件携带），供笔记持久化关联与关键帧图片清理 */
  const captureSessionIdRef = useRef<string | null>(null);
  /** 已派发增量分析的关键帧累计数，用于 [图:N] 局部编号 → 全局编号重映射 */
  const analyzedKeyframeOffsetRef = useRef(0);
  /** 真流式激活标志的 ref 桥接：供按段转写订阅器读取（避免重订阅） */
  const streamingAsrActiveRef = useRef(streamingAsrActive);
  streamingAsrActiveRef.current = streamingAsrActive;
  /** 会话状态 ref 桥接：流式 partial/final 仅在 capturing 时上屏（暂停时不更新） */
  const statusRef = useRef(status);
  statusRef.current = status;
  const { toast } = useToast();
  const asr = useAsrSemaphore({
    onDrop: (total, consec) => {
      if (total !== 1 && total % 5 !== 0) return; // 阈值范式：首次丢弃 + 每累计 5 段
      const hint = consec >= 3 && isLocalAsrReady() ? '，建议在设置中切换本地 ASR' : '';
      toast({ type: 'warning', silent: true, message: `网络繁忙，ASR 转写队列已丢弃 ${total} 段音频${hint}` });
    },
  });

  // ASR 本地→云端降级可见性：注册 toast 回调（会话级节流在 asrTranscriber 内部）
  useEffect(() => {
    setOnAsrFallback(() => toast({ type: 'warning', silent: true, message: '本地 ASR 不可用，已降级为云端转写' }));
    return () => setOnAsrFallback(null);
  }, [toast]);

  // 会话结束回到 idle 时重置时间基准（暂停/恢复不重置，避免相对时间戳跳变）
  useEffect(() => {
    if (status === 'idle') {
      sessionStartMsRef.current = null;
      analyzedKeyframeOffsetRef.current = 0;
    }
  }, [status]);

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
        // 记录首帧时间作为会话时间基准（epoch ms）
        if (sessionStartMsRef.current === null) {
          sessionStartMsRef.current = data.keyframe.timestamp;
        }
        captureSessionIdRef.current = data.sessionId;
        setSmartBundle((prev) => ({
          ...prev,
          keyframes: [...(prev.keyframes ?? []), data.keyframe],
        }));

        // 后台异步保存关键帧图片并回填 fileUrl（失败静默；分析后 imageBase64 仍会被清空）
        persistKeyframeImage(data.sessionId, data.keyframe, setSmartBundle);

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
          // 记录本批在全量关键帧序列中的偏移（派发顺序即到达顺序）
          const globalOffset = analyzedKeyframeOffsetRef.current;
          analyzedKeyframeOffsetRef.current += batch.length;
          isPartialAnalyzingRef.current = true;
          analyzePartial(batch, sessionStartMsRef.current ?? batch[0].timestamp, { language })
            .then((partial) => {
              // [图:N] 批内局部编号 → 全局编号，供合并后统一替换图片
              partialNotesRef.current.push(remapKeyframeMarkers(partial, globalOffset, batch.length));
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
      (data) => {
        captureSessionIdRef.current = data.sessionId;
        setSmartBundle(data.bundle);
      },
    );
    return () => { offKeyframe(); offBundleReady(); };
  }, [language, aiDetectEnabled, setCourseMeta]);

  // Path B：流式 ASR — 语音段完成后立即转写（带超时/重试/健康监测）
  useEffect(() => {
    const offSegmentReady = captureEventBus.on<{ sessionId: string; segment: AudioSegment }>(
      'smart:audio_segment_ready',
      (data) => {
        // 真流式激活时转写由流式 final 负责，跳过按段转写避免重复
        if (streamingAsrActiveRef.current) return;
        const seg = data.segment;
        // 先将音频段加入 bundle
        setSmartBundle((prev) => ({
          ...prev,
          audioSegments: [...(prev.audioSegments ?? []), seg],
        }));

        // 后台流式 ASR 转写（不阻塞采集，受并发控制）
        // ⚠️ 必须同步捕获 audioBase64：vadMarker 在 emit 后立即清空原对象字段释放内存，
        // 而 slot.then() 是微任务（异步），此时 seg.audioBase64 已为 ''。
        const audioData = seg.audioBase64;
        if (!audioData) return;
        const slot = asr.acquire();
        if (!slot) return; // 兼容性判空：acquire 实际永不返回 null（丢弃的是最旧等待者）
        slot.then(() => {
          transcribeWithRetry({
            audio_base64: audioData,
            language: toAsrLanguage(language),
            sample_rate: 16000,
            channels: 1,
          })
            .then((text) => {
              asr.markSuccess();
              // 输出清洗：相邻重复压缩 + 幻觉过滤（本地路径主进程已 clean，此处兑底云端降级）
              const cleaned = cleanAsrResult(text ?? '');
              // 将转写结果回填到对应的音频段，并剥离 audioBase64 释放内存（单段约 1.2MB，
              // 长课堂数百段否则无界累积——内测 5GB 内存主因）。全量分析回退路径优先用
              // 已转写的 audioText（sessionAnalyzer: seg.audioText ?? transcribe），无需再持有原始音频；
              // 转写失败的段不走此分支，仍保留 audioBase64 供回退补转写。
              setSmartBundle((prev) => ({
                ...prev,
                audioSegments: (prev.audioSegments ?? []).map((s) =>
                  s.id === seg.id ? { ...s, audioText: cleaned, audioBase64: '' } : s,
                ),
              }));
              if (cleaned) {
                setTranscribedCount((c) => c + 1);
                // 实时转录上屏（FIFO 上限控制）；展示替换后文本（P1-3 替换词后处理），
                // 上方 audioSegments.audioText 保留清洗后转写可回溯
                setLiveTranscripts((prev) => {
                  const next = [...prev, { id: seg.id, text: applySessionReplaces(cleaned), timestamp: seg.timestampStart }];
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

  // 真流式 ASR：订阅主进程（Paraformer 在线）推送的 partial/final 结果
  // partial → 实时行；final（断句）→ 提交到实时转录 + audioSegments（供课后分析）
  // 仅 capturing 时上屏（暂停时主进程采集仍在跑，但不应更新 UI）
  useEffect(() => {
    if (!window.electronAPI) return;
    const offPartial = window.electronAPI.on('asr_stream_partial', (...args: unknown[]) => {
      if (statusRef.current !== 'capturing') return;
      const data = args[0] as { text: string };
      setPartialText(data?.text ?? '');
    });
    const offFinal = window.electronAPI.on('asr_stream_final', (...args: unknown[]) => {
      if (statusRef.current !== 'capturing') return;
      const data = args[0] as { text: string; timestamp: number };
      setPartialText('');
      // 双保险：主进程已 clean，此处兜底云端/旧版本主进程的未清洗输出
      const text = cleanAsrResult(data?.text ?? '');
      if (!text) return;
      const id = crypto.randomUUID();
      const timestamp = data.timestamp || Date.now();
      // 实时转录上屏（FIFO 上限控制）；展示替换后文本（P1-3），audioSegments 存清洗后转写
      setLiveTranscripts((prev) => {
        const next = [...prev, { id, text: applySessionReplaces(text), timestamp }];
        return next.length > MAX_LIVE_TRANSCRIPTS
          ? next.slice(next.length - MAX_LIVE_TRANSCRIPTS)
          : next;
      });
      setTranscribedCount((c) => c + 1);
      // 追加到 audioSegments（带 audioText，供课后分析；无需持有原始音频）
      setSmartBundle((prev) => ({
        ...prev,
        audioSegments: [...(prev.audioSegments ?? []), {
          id,
          timestampStart: timestamp,
          timestampEnd: timestamp,
          audioBase64: '',
          energy: 0,
          audioText: text,
        }],
      }));
    });
    return () => { offPartial(); offFinal(); };
  }, []);

  // 离开采集中状态时清空流式 partial 行（避免暂停/停止后残留）
  useEffect(() => {
    if (status !== 'capturing') setPartialText('');
  }, [status]);

  // Path B：课中重点标记（M2 含自动锚点）——captureManager.pushBookmark 广播，
  // 统一在此写入 smartBundle.timeline（单一数据流，手动/自动同链路）
  useEffect(() => {
    const offBookmark = captureEventBus.on<{
      sessionId: string;
      timestamp: number;
      type: TimelineEntry['type'];
      label?: string;
    }>(
      'smart:bookmark',
      (data) => {
        // M8: 校验事件 sessionId 与当前采集会话一致——旧会话/跨会话的迟到事件
        // 不写入当前时间线（captureSessionIdRef 未建立时无法校验，放行）
        if (captureSessionIdRef.current && data.sessionId !== captureSessionIdRef.current) return;
        setSmartBundle((prev) => {
          const next = [...(prev.timeline ?? []), {
            timestamp: data.timestamp,
            type: data.type,
            label: data.label,
          }];
          // M8: 时间线上限 500 条，超出丢弃最旧条目
          return {
            ...prev,
            timeline: next.length > MAX_TIMELINE_ENTRIES
              ? next.slice(next.length - MAX_TIMELINE_ENTRIES)
              : next,
          };
        });
      },
    );
    return () => { offBookmark(); };
  }, []);

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
    segments, setSegments, stats, setStats, extractionError, setExtractionError,
    smartBundle, setSmartBundle,
    liveTranscripts, setLiveTranscripts,
    partialText,
    vadStats, recordingStatus, setRecordingStatus,
    videoFilePath, setVideoFilePath,
    partialCount, setPartialCount, transcribedCount,
    partialNotesRef, pendingKeyframesRef, isPartialAnalyzingRef,
    captureSessionIdRef,
  };
}
