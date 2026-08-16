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
import { useState, useEffect, useRef, useCallback } from 'react';
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
import { applySessionReplaces, getSessionHotwordsString, addDynamicBoosts, addSessionReplace } from '../utils/hotwordRuntime';
import { cleanAsrResult, dedupeAcrossFinals, estimateAsrConfidence } from '@/lib/capture/asrFilters';
import { classifyContent, hasCommandCue, type ContentKind } from '@/lib/capture/contentClassifier';
import { hotwordStore } from '@/lib/storage/hotwordStore';
import { extractCorrection } from '../utils/transcriptCorrection';

/** 触发一次增量分析所需的关键帧数 */
const INCREMENTAL_BATCH_SIZE = 5;
/** 实时转录列表上限（FIFO） */
const MAX_LIVE_TRANSCRIPTS = 200;
/** 时间线条目上限（FIFO，防止长课堂无界增长） */
const MAX_TIMELINE_ENTRIES = 500;
/** P0-6 仍持 audioBase64 的转写失败段上限（FIFO）：单段 ~1.2MB，
 * ASR 持续失败时长课堂也须有界（30 × 1.2MB ≈ 36MB 峰值） */
const MAX_FAILED_AUDIO_SEGMENTS = 30;

export interface LiveTranscript {
  id: string;
  text: string;
  timestamp: number;
  /** P0-3：转写置信度（估算口径，<0.55 时 UI 弱化标记；缺失视为 1） */
  confidence?: number;
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
  /** P1-6：目标窗口标题（内容类型分类的标题信号） */
  windowTitle?: string;
  /** P1-3：当前课程名（修正回写词库的 courseId 绑定） */
  courseName?: string;
}

/** P1-6 分类尝试上限（转写样本仍无信号则停止，unknown 不再重试） */
const MAX_CLASSIFY_ATTEMPTS = 5;
/** P1-7 指令补帧节流：最小间隔（ms），防连续指令句触发补帧风暴 */
const FORCE_CAPTURE_MIN_INTERVAL_MS = 1000;
/** P1-6 分类转写样本上限（字符，FIFO 追加防无界） */
const MAX_CLASSIFY_SAMPLE_CHARS = 500;
/** P1-8 漏捕检测延迟：指令句后该时长内无新关键帧 → 提示（ms） */
const MISSED_CAPTURE_CHECK_MS = 3000;

export function useClassroomEvents({
  captureManager, status, capturePath, language, aiDetectEnabled, setCourseMeta, onNotify,
  streamingAsrActive, windowTitle, courseName,
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
  /** P1-6 内容类型（课程/软件技能/手法技巧/讲座；驱动采样参数与产物形态） */
  const [contentKind, setContentKind] = useState<ContentKind>('unknown');

  const partialNotesRef = useRef<string[]>([]);
  const pendingKeyframesRef = useRef<KeyFrame[]>([]);
  const isPartialAnalyzingRef = useRef(false);
  const courseDetectedRef = useRef(false);
  /** P1-6 分类尝试计数（超上限后停止，unknown 不再重试） */
  const classifyAttemptsRef = useRef(0);
  /** P1-6 转写样本累积（FIFO 截断） */
  const transcriptSampleRef = useRef('');
  /** P1-7 指令补帧节流时间戳 */
  const lastForceCaptureAtRef = useRef(0);
  /** P1-8 最近一次关键帧时间戳（漏捕检测依据：指令后无新帧即提示） */
  const latestKeyframeTsRef = useRef(0);
  /** @ai-context 会话时间基准（epoch ms）：记录首帧 timestamp，供 analyzePartial 换算相对秒数 */
  const sessionStartMsRef = useRef<number | null>(null);
  /** 采集会话 ID（smart:keyframe 事件携带），供笔记持久化关联与关键帧图片清理 */
  const captureSessionIdRef = useRef<string | null>(null);
  /** 已派发增量分析的关键帧累计数，用于 [图:N] 局部编号 → 全局编号重映射 */
  const analyzedKeyframeOffsetRef = useRef(0);
  /** 真流式激活标志的 ref 桥接：供按段转写订阅器读取（避免重订阅） */
  const streamingAsrActiveRef = useRef(streamingAsrActive);
  streamingAsrActiveRef.current = streamingAsrActive;
  /** P0-4 跨 final 去重：上一 final 清洗后文本（端点误断句时前句尾=后句头） */
  const lastFinalTextRef = useRef('');
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

  /**
   * P1-6/P1-7 转写文本场景消费（ref 桥接，事件回调经此调用避免 effect 重订阅）：
   * ① 累积分类样本并触发内容分类（最多 5 次尝试，标题信号 > 转写证据）
   * ② 指令句检测命中 → 请求强制补帧（1s 节流，防补帧风暴）
   */
  const sceneProcessorRef = useRef<(text: string) => void>(() => {});
  sceneProcessorRef.current = (text: string) => {
    if (!text) return;
    // 样本累积（FIFO 截断，防长课无界增长）
    transcriptSampleRef.current = (transcriptSampleRef.current + text).slice(-MAX_CLASSIFY_SAMPLE_CHARS);
    // 内容分类：未确定时尝试
    if (contentKind === 'unknown' && classifyAttemptsRef.current < MAX_CLASSIFY_ATTEMPTS) {
      classifyAttemptsRef.current++;
      const result = classifyContent(windowTitle ?? '', transcriptSampleRef.current);
      if (result.kind !== 'unknown') {
        setContentKind(result.kind);
        captureManager.applyContentKind(result.kind);
        console.info(`[useClassroomCapture] 内容类型识别: ${result.kind}（${result.source}）`);
      }
    }
    // 指令句补帧（技能场景操作瞬间捕捉）+ 漏捕检测
    if (hasCommandCue(text)) {
      const now = Date.now();
      if (now - lastForceCaptureAtRef.current >= FORCE_CAPTURE_MIN_INTERVAL_MS) {
        lastForceCaptureAtRef.current = now;
        captureManager.requestForceCapture();
      }
      // P1-8 漏捕检测：指令后 3s 无新关键帧 → 提示手动补截
      const commandAt = now;
      window.setTimeout(() => {
        if (latestKeyframeTsRef.current < commandAt) {
          toast({ type: 'warning', silent: true, message: '这一步的画面可能没捕捉到，可按 C 键手动截图' });
        }
      }, MISSED_CAPTURE_CHECK_MS);
    }
  };

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
      result: { text: string; confidence: number; source: 'vision' | 'audio' | 'ui_automation'; structured?: Record<string, unknown> };
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

      // P1-2 动态热词闭环：视觉提取的概念术语注入会话热词（弱 boost，
      // 不持久化）；流式运行中同步更新主进程会话热词（下一断句生效）
      if (data.result.source === 'vision') {
        const concepts = data.result.structured?.concepts;
        if (Array.isArray(concepts)) {
          const terms = concepts.filter((c): c is string => typeof c === 'string');
          if (terms.length > 0) {
            addDynamicBoosts(terms);
            window.electronAPI?.local_asr_stream_set_hotwords({ hotwords: getSessionHotwordsString() })
              .catch(() => { /* 静默 */ });
          }
        }
      }
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
        // P1-8：更新最近关键帧时间戳（漏捕检测依据）
        latestKeyframeTsRef.current = data.keyframe.timestamp;
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
                // P0-6 准确率即时提升：识别出的术语注入动态热词
                // （课程名/学科/建议术语），并通知主进程流式 ASR 更新
                // 会话热词（下一断句重建流生效，无需重启、不丢当前句）
                if (detected.customTerms?.length) {
                  addDynamicBoosts(detected.customTerms);
                  const hotwords = getSessionHotwordsString();
                  window.electronAPI?.local_asr_stream_set_hotwords({ hotwords })
                    .catch(() => { /* 静默：热词更新失败不阻断识别 */ });
                }
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
          // 构建热词增强字符串（zipformer 支持空格分隔的热词列表，自动截断防超限）
          const hotwords = getSessionHotwordsString() || undefined;
          transcribeWithRetry({
            audio_base64: audioData,
            language: toAsrLanguage(language),
            sample_rate: 16000,
            channels: 1,
          }, 1, hotwords || undefined)
            .then((outcome) => {
              asr.markSuccess();
              // 输出清洗：相邻重复压缩 + 幻觉过滤（本地路径主进程已 clean，此处兑底云端降级）
              const cleaned = cleanAsrResult(outcome?.text ?? '');
              // P0-3：清洗后文本变化时重估置信度（网关估算基于未清洗文本）
              const confidence = cleaned && outcome
                ? (cleaned === outcome.text ? outcome.confidence : estimateAsrConfidence(outcome.text, cleaned))
                : 0;
              // 将转写结果回填到对应的音频段，并剥离 audioBase64 释放内存（单段约 1.2MB，
              // 长课堂数百段否则无界累积——内测 5GB 内存主因）。全量分析回退路径优先用
              // 已转写的 audioText（sessionAnalyzer: seg.audioText ?? transcribe），无需再持有原始音频；
              // 转写失败的段不走此分支，仍保留 audioBase64 供回退补转写。
              // audioText 存热词替换后文本供下游笔记/问答/闪卡消费；audioTextRaw 存原始清洗后文本保真溯源
              const replacedText = cleaned ? applySessionReplaces(cleaned) : '';
              setSmartBundle((prev) => ({
                ...prev,
                audioSegments: (prev.audioSegments ?? []).map((s) =>
                  s.id === seg.id ? { ...s, audioText: replacedText, audioTextRaw: cleaned, audioBase64: '' } : s,
                ),
              }));
              if (cleaned) {
                setTranscribedCount((c) => c + 1);
                // P1-6/P1-7：转写文本场景消费（内容分类 + 指令句补帧）
                sceneProcessorRef.current(cleaned);
                // 实时转录上屏（FIFO 上限控制）；展示替换后文本（P1-3 替换词后处理），
                // 原始清洗后转写经 audioTextRaw 可回溯
                setLiveTranscripts((prev) => {
                  const next = [...prev, { id: seg.id, text: applySessionReplaces(cleaned), timestamp: seg.timestampStart, confidence }];
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
              // P0-6 失败段内存护栏：转写失败的段保留 audioBase64 供回退补转写，
              // 但长课堂 ASR 持续失败时无界累积——超上限释放最旧失败段（仅剥离
              // base64 字段，保留段结构供全量分析消费 audioText 占位）
              setSmartBundle((prev) => {
                const segs = prev.audioSegments ?? [];
                const failedIdx: number[] = [];
                for (let i = 0; i < segs.length; i++) {
                  if (segs[i].audioBase64) failedIdx.push(i);
                }
                if (failedIdx.length <= MAX_FAILED_AUDIO_SEGMENTS) return prev;
                const drop = new Set(failedIdx.slice(0, failedIdx.length - MAX_FAILED_AUDIO_SEGMENTS));
                return {
                  ...prev,
                  audioSegments: segs.map((s, i) => (drop.has(i) ? { ...s, audioBase64: '' } : s)),
                };
              });
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
      const data = args[0] as { text: string; timestamp: number; confidence?: number };
      setPartialText('');
      // 双保险：主进程已 clean，此处兜底云端/旧版本主进程的未清洗输出
      const cleaned = cleanAsrResult(data?.text ?? '');
      if (!cleaned) return;
      // P0-4 跨 final 重叠去重：端点误断句时前句尾词重复出现在后句开头
      // （"今天讲矩阵"+"矩阵的特征值"），去重截断后句重叠前缀
      const text = dedupeAcrossFinals(lastFinalTextRef.current, cleaned);
      lastFinalTextRef.current = text || lastFinalTextRef.current;
      if (!text) return;
      // P0-3：置信度透传（主进程估算；本地再清洗后文本变化时重估）
      const confidence = cleaned === data.text
        ? (typeof data.confidence === 'number' ? data.confidence : 1)
        : estimateAsrConfidence(data.text ?? '', cleaned);
      const id = crypto.randomUUID();
      const timestamp = data.timestamp || Date.now();
      // P1-6/P1-7：转写文本场景消费（内容分类 + 指令句补帧）
      sceneProcessorRef.current(text);
      // 实时转录上屏（FIFO 上限控制）；展示替换后文本（P1-3）
      setLiveTranscripts((prev) => {
        const next = [...prev, { id, text: applySessionReplaces(text), timestamp, confidence }];
        return next.length > MAX_LIVE_TRANSCRIPTS
          ? next.slice(next.length - MAX_LIVE_TRANSCRIPTS)
          : next;
      });
      setTranscribedCount((c) => c + 1);
      // 追加到 audioSegments（带替换后 audioText，供课后分析；audioTextRaw 保真溯源）
      const replacedText = applySessionReplaces(text);
      setSmartBundle((prev) => ({
        ...prev,
        audioSegments: [...(prev.audioSegments ?? []), {
          id,
          timestampStart: timestamp,
          timestampEnd: timestamp,
          audioBase64: '',
          energy: 0,
          audioText: replacedText,
          audioTextRaw: text,
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

  // P1-2：转写编辑回调——修正直播转录文本，audioText 存修正后文本供下游消费；
  // P1-3：修正差异自动回写本地词库（replace 词条，课程维度绑定，下次识别生效）
  const handleEditTranscript = useCallback((id: string, newText: string) => {
    setLiveTranscripts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, editedText: newText } : t)),
    );
    // 同步更新 smartBundle 对应 audioSegment：audioText 存修正后文本，audioTextRaw 保真原始
    setSmartBundle((prev) => ({
      ...prev,
      audioSegments: (prev.audioSegments ?? []).map((s) =>
        s.id === id ? { ...s, audioText: newText, audioTextRaw: s.audioText } : s,
      ),
    }));

    // ── P1-3 修正回写（讯飞「用户修正回写」/飞书「改字同步」闭环）──
    const original = liveTranscripts.find((t) => t.id === id)?.text ?? '';
    const correction = extractCorrection(original, newText);
    if (correction) {
      // 会话内立即生效（后续转写应用替换）
      addSessionReplace(correction.term, correction.target);
      // 持久化词库（去重后写入；失败静默，不影响编辑结果）
      hotwordStore.listForCourse(courseName).then((entries) => {
        const exists = entries.some(
          (e) => e.kind === 'replace' && e.term === correction.term && (e.target ?? '') === correction.target,
        );
        if (!exists) {
          return hotwordStore.add({
            term: correction.term,
            target: correction.target,
            kind: 'replace',
            courseId: courseName,
            enabled: true,
          });
        }
        return null;
      }).catch(() => { /* 词库写入失败静默 */ });
      toast({ type: 'info', silent: true, message: `已记住修正：「${correction.term}」→「${correction.target}」` });
    }
  }, [liveTranscripts, courseName, toast]);

  return {
    segments, setSegments, stats, setStats, extractionError, setExtractionError,
    smartBundle, setSmartBundle,
    liveTranscripts, setLiveTranscripts,
    handleEditTranscript,
    partialText,
    vadStats, recordingStatus, setRecordingStatus,
    videoFilePath, setVideoFilePath,
    partialCount, setPartialCount, transcribedCount,
    contentKind,
    partialNotesRef, pendingKeyframesRef, isPartialAnalyzingRef,
    captureSessionIdRef,
  };
}
