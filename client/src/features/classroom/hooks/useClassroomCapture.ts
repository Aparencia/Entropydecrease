/**
 * useClassroomCapture — 课堂助手核心采集逻辑 hook
 * 从 CaptureSidebar 提取，供全页 ClassroomPage 和侧边栏共用
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';
import { requireGatewayUrl } from '@/lib/ai/config';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { CaptureManager, captureEventBus } from '@/lib/capture';
import type {
  WindowInfo,
  ExtractedSegment,
  CaptureMode,
  CaptureSidebarConfig,
  SessionStatus,
  ScreenshotData,
  AudioChunkData,
  CapturePath,
  SessionBundle,
  KeyFrame,
  RecordingStatus,
  VideoRecording,
  CourseMeta,
  VADStats,
} from '@/lib/capture';
import { analyzeSession, analyzeVideo, analyzePartial, mergeNotes } from '@/lib/ai/sessionAnalyzer';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';
import { detectCourseFromFrame } from '@/lib/ai/courseDetector';
import { aiClient } from '@/lib/http/apiClient';
import { noteStore } from '@/lib/storage';
import { createWithLog, updateWithLog } from '@/lib/storage/writeWithLog';
import { markdownToTipTapJson, appendMarkdownToTipTapJson } from '../utils/tipTapConverter';
import type { CourseNoteItem } from '../components/NoteInsertDialog';

interface IPCAudioStartResult {
  success: boolean;
  error?: string;
}

// ================================================================
// ASR 转写工具：超时 + 重试
// ================================================================

interface TranscribePayload {
  audio_base64: string;
  language: string;
  sample_rate: number;
  channels: number;
}

/** ASR 转写（15s 超时，失败后最多重试 1 次，指数退避） */
async function transcribeWithRetry(payload: TranscribePayload, retries = 1): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await aiClient.post<{ text: string }>('/api/v1/asr/transcribe', payload, { timeout: 15000 });
      return resp.text?.trim() || null;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
  return null;
}

export function useClassroomCapture() {
  const { toast } = useToast();

  // ── 窗口列表 ──
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);

  // ── 会话状态 ──
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [mode, setMode] = useState<CaptureMode>('mixed');
  const [segments, setSegments] = useState<ExtractedSegment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ frames: 0, extracted: 0 });
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [config, setConfig] = useState<CaptureSidebarConfig>({
    screenshotInterval: 5000,
    language: 'zh',
    autoInsert: false,
    mode: 'mixed',
  });

  // ── Path B 智能模式 ──
  const [capturePath, setCapturePath] = useState<CapturePath>('fine');
  const [smartBundle, setSmartBundle] = useState<Partial<SessionBundle>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ── 实时转录 ──
  const [liveTranscripts, setLiveTranscripts] = useState<{ id: string; text: string; timestamp: number }[]>([]);

  // ── 音频健康监控 ──
  const [audioHealth, setAudioHealth] = useState<{ lastChunkTime: number; chunkCount: number; isHealthy: boolean }>({
    lastChunkTime: 0, chunkCount: 0, isHealthy: true,
  });
  const audioHealthRef = useRef({ lastChunkTime: 0, chunkCount: 0 });

  // ── VAD 统计 ──
  const [vadStats, setVadStats] = useState<VADStats | null>(null);

  // ── 课程上下文 ──
  const [courseMeta, setCourseMeta] = useState<CourseMeta>({});
  const [aiDetectEnabled, setAiDetectEnabled] = useState(false);
  const courseDetectedRef = useRef(false);

  // ── Path C 全程录制 ──
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);

  // ── Refs ──
  const audioCleanupRef = useRef<(() => void | Promise<void>) | null>(null);
  const frameRestartRef = useRef<(() => void) | null>(null);

  // toast 的稳定引用：音频生命周期 effect 依赖数组为 []，
  // 直接闭包 toast 会随渲染变化而过期，故用 ref 桥接。
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // ── ASR 并发控制（带队列保护） ──
  const MAX_CONCURRENT_ASR = 3;
  const MAX_ASR_QUEUE = 10;
  const MAX_LIVE_TRANSCRIPTS = 200;
  const asrSemaphoreRef = useRef({ active: 0, queue: [] as (() => void)[] });
  const asrHealthRef = useRef({ lastSuccessTime: 0, consecutiveFailures: 0 });

  const acquireAsrSlot = useCallback((): Promise<void> | null => {
    const sem = asrSemaphoreRef.current;
    if (sem.active < MAX_CONCURRENT_ASR) {
      sem.active++;
      return Promise.resolve();
    }
    // 队列保护：超出上限时丢弃最旧的排队任务
    if (sem.queue.length >= MAX_ASR_QUEUE) {
      sem.queue.shift(); // 移除最旧的等待者（其 Promise 永远不会 resolve，GC 会回收）
      console.warn('[useClassroomCapture] ASR 队列已满，丢弃最旧的排队段');
    }
    return new Promise<void>((resolve) => {
      sem.queue.push(() => { sem.active++; resolve(); });
    });
  }, []);

  const releaseAsrSlot = useCallback(() => {
    const sem = asrSemaphoreRef.current;
    sem.active--;
    if (sem.queue.length > 0) {
      const next = sem.queue.shift()!;
      next();
    }
  }, []);

  // 帧超时保底重启
  useEffect(() => {
    if (!window.electronAPI || !selectedWindow) {
      frameRestartRef.current = null;
      return;
    }
    const api = window.electronAPI;
    const winId = selectedWindow.id;
    const interval = config.screenshotInterval;
    frameRestartRef.current = async () => {
      if (status !== 'capturing') return;
      try {
        console.warn('[useClassroomCapture] 帧超时，自动重启截图采集');
        await api.invoke('screen_capture_stop');
        await new Promise((r) => setTimeout(r, 200));
        await api.invoke('screen_capture_start', { windowId: winId, interval });
      } catch (err) {
        console.error('[useClassroomCapture] 保底重启失败:', err);
      }
    };
  }, [selectedWindow, config.screenshotInterval, status]);

  // CaptureManager 单例
  const captureManager = useMemo(
    () => new CaptureManager({
      onFrameWatchdogTimeout: () => frameRestartRef.current?.(),
    }),
    [],
  );

  // 卸载时停止会话
  useEffect(() => {
    return () => {
      captureManager.stopSession().catch(() => {});
    };
  }, [captureManager]);

  // ── 监听提取结果 ──
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

  // ── Path B：监听关键帧和 bundle + 增量分析 ──
  const partialNotesRef = useRef<string[]>([]);
  const pendingKeyframesRef = useRef<KeyFrame[]>([]);
  const isPartialAnalyzingRef = useRef(false);
  const [partialCount, setPartialCount] = useState(0);
  const [transcribedCount, setTranscribedCount] = useState(0);
  const INCREMENTAL_BATCH_SIZE = 5;

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
                setCourseMeta((prev) => ({
                  ...prev,
                  ...detected,
                  detectedBy: 'ai',
                }));
              }
            })
            .catch(() => { /* 静默降级到规则模式 */ });
        }

        // 增量分析：累积到缓冲区，达到批次大小时触发后台分析
        pendingKeyframesRef.current.push(data.keyframe);
        if (pendingKeyframesRef.current.length >= INCREMENTAL_BATCH_SIZE && !isPartialAnalyzingRef.current) {
          const batch = pendingKeyframesRef.current.splice(0, INCREMENTAL_BATCH_SIZE);
          isPartialAnalyzingRef.current = true;
          analyzePartial(batch, { language: config.language })
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
  }, [config.language, aiDetectEnabled]);

  // ── Path B：流式 ASR — 语音段完成后立即转写（带超时/重试/健康监测） ──
  useEffect(() => {
    const offSegmentReady = captureEventBus.on<{ sessionId: string; segment: import('@/lib/capture').AudioSegment }>(
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
        const lang = config.language === 'en' ? 'en' : config.language === 'mixed' ? 'auto' : 'zh';
        const slot = acquireAsrSlot();
        if (!slot) return; // 队列已满且丢弃了本段
        slot.then(() => {
          transcribeWithRetry({
            audio_base64: seg.audioBase64,
            language: lang,
            sample_rate: 16000,
            channels: 1,
          })
            .then((text) => {
              asrHealthRef.current.lastSuccessTime = Date.now();
              asrHealthRef.current.consecutiveFailures = 0;
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
                  if (next.length > MAX_LIVE_TRANSCRIPTS) {
                    return next.slice(next.length - MAX_LIVE_TRANSCRIPTS);
                  }
                  return next;
                });
              }
            })
            .catch((err) => {
              asrHealthRef.current.consecutiveFailures++;
              console.warn('[useClassroomCapture] 流式 ASR 转写失败:', err);
              if (asrHealthRef.current.consecutiveFailures === 3) {
                toast({ type: 'error', message: 'ASR 服务连续失败，语音转写可能不可用，请检查网络或 AI 网关' });
              }
            })
            .finally(() => {
              releaseAsrSlot();
            });
        });
      },
    );
    return () => { offSegmentReady(); };
  }, [config.language, acquireAsrSlot, releaseAsrSlot, toast]);

  // ── Path B：监听 VAD 统计事件 ──
  useEffect(() => {
    const offVadStats = captureEventBus.on<{ sessionId: string; stats: VADStats }>(
      'smart:vad_stats',
      (data) => setVadStats(data.stats),
    );
    return () => { offVadStats(); };
  }, []);

  // ── Path C：监听录制视频就绪 ──
  useEffect(() => {
    const offVideoReady = captureEventBus.on<{ sessionId: string; videoRecording: VideoRecording }>(
      'record:video_ready',
      (data) => {
        if (data.videoRecording.filePath) setVideoFilePath(data.videoRecording.filePath);
      },
    );
    return () => { offVideoReady(); };
  }, []);

  // Path C 轮询录制状态
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

  // ── 监听截图帧 ──
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;
    const off = window.electronAPI.on('screen_capture_frame', (...args: unknown[]) => {
      const frameData = args[0] as ScreenshotData;
      captureManager.pushFrame(frameData);
      setStats((prev) => ({ ...prev, frames: prev.frames + 1 }));
    });
    return off;
  }, [status, captureManager]);

  // ── 监听音频块（带健康跟踪） ──
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;
    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as AudioChunkData;
      captureManager.pushAudioChunk(chunk);
      // 更新音频健康状态：收到音频块即视为健康
      audioHealthRef.current = {
        lastChunkTime: Date.now(),
        chunkCount: audioHealthRef.current.chunkCount + 1,
      };
      setAudioHealth({
        lastChunkTime: audioHealthRef.current.lastChunkTime,
        chunkCount: audioHealthRef.current.chunkCount,
        isHealthy: true,
      });
    });
    return off;
  }, [status, captureManager]);

  // ── 音频健康 watchdog：检测“从未收到音频块”与“音频中断”两种故障 ──
  useEffect(() => {
    if (status !== 'capturing') {
      setAudioHealth({ lastChunkTime: 0, chunkCount: 0, isHealthy: true });
      audioHealthRef.current = { lastChunkTime: 0, chunkCount: 0 };
      return;
    }
    const audioEnabled = mode === 'audio' || mode === 'mixed';
    if (!audioEnabled) return;

    const capturingStartedAt = Date.now();
    let warnedNever = false;
    let warnedStopped = false;
    const timer = setInterval(() => {
      const { lastChunkTime } = audioHealthRef.current;
      if (lastChunkTime === 0) {
        // 场景一：开始采集后从未收到任何音频块（音频管道未启动/被挂起）
        if (Date.now() - capturingStartedAt > 15000) {
          setAudioHealth((prev) => (prev.isHealthy ? { ...prev, isHealthy: false } : prev));
          if (!warnedNever) {
            warnedNever = true;
            toast({ type: 'error', message: '未检测到音频输入，音频采集可能未启动，请停止后重新开始采集' });
          }
        }
      } else if (Date.now() - lastChunkTime > 10000) {
        // 场景二：音频曾正常但中断超过 10s
        setAudioHealth((prev) => ({ ...prev, isHealthy: false }));
        if (!warnedStopped) {
          warnedStopped = true;
          toast({ type: 'warning', message: '音频输入中断超过 10s，请检查系统音频设置' });
        }
      } else {
        // 恢复正常
        setAudioHealth((prev) => (prev.isHealthy ? prev : { ...prev, isHealthy: true }));
        warnedNever = false;
        warnedStopped = false;
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [status, mode, toast]);

  // ── 监听音频采集生命周期指令 ──
  useEffect(() => {
    if (!window.electronAPI) return;

    const offStart = window.electronAPI.on('audio_capture_do_start', (...args: unknown[]) => {
      if (audioCleanupRef.current) return;
      const payload = args[0] as {
        sourceId: string;
        options: { sampleRate: number; channels: number; chunkDurationMs: number };
      };
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: payload.sourceId,
            } as MediaTrackConstraintSet,
          });
          const audioCtx = new AudioContext({ sampleRate: payload.options.sampleRate });
          // 关键修复：AudioContext 在 IPC 回调（非用户手势调用栈）中创建时，
          // 受 Chrome autoplay policy 影响默认处于 suspended 状态，
          // ScriptProcessor.onaudioprocess 永不触发 → 不产生任何音频块。
          // 必须显式 resume() 确保上下文进入 running 状态。
          if (audioCtx.state !== 'running') {
            await audioCtx.resume();
          }
          console.info(`[useClassroomCapture] 音频管道已启动, AudioContext state=${audioCtx.state}, sampleRate=${audioCtx.sampleRate}`);
          const sourceNode = audioCtx.createMediaStreamSource(stream);
          // 根因修复：createScriptProcessor 的 bufferSize 必须是 [256, 16384] 内 2 的幂。
          // 原代码直接传入 chunkDurationMs 对应的样本数（16kHz×5s = 80000），
          // 既不是 2 的幂又超出 16384 上限，Chrome 会抛 IndexSizeError，
          // 导致整个音频管道中断、产生 0 个音频块（ASR 从未被触发）。
          // 正确做法：用合法的小缓冲（4096）切片，在渲染端累积到
          // chunkDurationMs 对应的样本数后再整块发送，保证 VAD/ASR 拿到完整 5s 音频段。
          const PROCESSOR_BUFFER_SIZE = 4096;
          const processor = audioCtx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, payload.options.channels, 1);
          const targetSamples = Math.ceil((payload.options.sampleRate * payload.options.chunkDurationMs) / 1000);
          let pending = new Float32Array(targetSamples);
          let pendingOffset = 0;
          let sentChunks = 0;
          // TODO: ScriptProcessor 已被 Web Audio API 标记为废弃，
          // 后续应迁移至 AudioWorklet（需要单独的 worklet 文件通过 audioWorklet.addModule 加载）。
          // 迁移时需确保 Electron 的 audioWorklet 模块加载路径正确。
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            let srcOffset = 0;
            // 将本次回调的样本填入 pending，满 targetSamples 即发送一个完整块
            while (srcOffset < inputData.length) {
              const take = Math.min(targetSamples - pendingOffset, inputData.length - srcOffset);
              pending.set(inputData.subarray(srcOffset, srcOffset + take), pendingOffset);
              pendingOffset += take;
              srcOffset += take;
              if (pendingOffset >= targetSamples) {
                sentChunks++;
                if (sentChunks === 1) {
                  console.info(`[useClassroomCapture] 首个完整音频块已发送 (${targetSamples} 样本 / ${payload.options.chunkDurationMs}ms)，采集管道正常`);
                }
                window.electronAPI?.send('audio_capture_chunk', {
                  audioBuffer: pending.buffer,
                  sampleRate: payload.options.sampleRate,
                  channels: payload.options.channels,
                  durationMs: payload.options.chunkDurationMs,
                });
                pending = new Float32Array(targetSamples);
                pendingOffset = 0;
              }
            }
          };
          sourceNode.connect(processor);
          processor.connect(audioCtx.destination);
          audioCleanupRef.current = async () => {
            processor.onaudioprocess = null;
            processor.disconnect();
            sourceNode.disconnect();
            stream.getTracks().forEach((t) => t.stop());
            await audioCtx.close();
          };
        } catch (err) {
          console.error('[useClassroomCapture] Audio pipeline start failed:', err);
          toastRef.current({ type: 'error', message: '音频采集启动失败，无法获取系统音频，请检查音频输出设备' });
        }
      })();
    });

    const offStop = window.electronAPI.on('audio_capture_do_stop', () => {
      void audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    });

    return () => {
      offStart();
      offStop();
      void audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    };
  }, []);

  // ── 获取窗口列表 ──
  const refreshWindows = useCallback(async () => {
    if (!window.electronAPI) return;
    setWindowsLoading(true);
    try {
      const result = await window.electronAPI.invoke('screen_list_windows');
      setWindows(result as WindowInfo[]);
    } catch {
      console.error('[useClassroomCapture] Failed to list windows');
    } finally {
      setWindowsLoading(false);
    }
  }, []);

  useEffect(() => { refreshWindows(); }, [refreshWindows]);

  // ── 窗口选中时自动提取课程名（规则模式） ──
  const COURSE_KEYWORDS = /((?:高等数学|线性代数|概率论|大学物理|数据结构|操作系统|编译原理|离散数学|复变函数|英语|高数|大物|C语言|Python|Java|机器学习|深度学习|人工智能|计算机网络|数据库)[^\s|]*)/;

  useEffect(() => {
    if (!selectedWindow) return;
    const match = selectedWindow.title.match(COURSE_KEYWORDS);
    if (match && !courseMeta.courseName) {
      setCourseMeta((prev) => ({ ...prev, courseName: match[1], detectedBy: 'window_title' }));
    }
  }, [selectedWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 窗口变化监听（后台轮询 + 最小化容错） ──
  const windowMissingCountRef = useRef(0);
  const WINDOW_MISSING_THRESHOLD = 10; // 连续消失 10 次轮询（~30s）才判定为真正关闭

  useEffect(() => {
    if (!window.electronAPI) return;

    // 启动监听
    window.electronAPI.invoke('screen_watch_windows_start').catch(() => {});

    // 监听窗口变化推送
    const unsubscribe = window.electronAPI.on('screen_windows_changed', (...args: unknown[]) => {
      const newWindows = args[1] as WindowInfo[] | undefined;
      if (!newWindows) return;
      setWindows(newWindows);

      // 检测当前选中窗口是否可见
      setSelectedWindow((prev) => {
        if (!prev) return prev;
        const stillVisible = newWindows.some((w) => w.id === prev.id);

        if (stillVisible) {
          // 窗口恢复可见，重置计数
          if (windowMissingCountRef.current > 0) {
            windowMissingCountRef.current = 0;
            toast({ type: 'success', message: '目标窗口已恢复，采集继续' });
          }
          return prev;
        }

        // 窗口不可见（可能最小化）
        windowMissingCountRef.current += 1;
        if (windowMissingCountRef.current === 1) {
          // 首次消失，提示用户但不清除选中
          toast({ type: 'warning', message: '目标窗口不可见（可能已最小化），恢复窗口后自动继续采集' });
        } else if (windowMissingCountRef.current >= WINDOW_MISSING_THRESHOLD) {
          // 超过阈值，判定为真正关闭
          windowMissingCountRef.current = 0;
          toast({ type: 'error', message: '目标窗口已关闭，请重新选择' });
          return null;
        }
        return prev; // 保留选中状态，等待窗口恢复
      });
    });

    return () => {
      window.electronAPI?.invoke('screen_watch_windows_stop').catch(() => {});
      unsubscribe();
    };
  }, [toast]);

  // ── 开始采集 ──
  const handleStart = useCallback(async () => {
    if (!selectedWindow || !window.electronAPI) return;
    try {
      setStatus('capturing');
      setStats({ frames: 0, extracted: 0 });
      setSegments([]);
      setSelectedIds(new Set());
      setLiveTranscripts([]);

      // 预检网关
      try {
        const gatewayUrl = requireGatewayUrl();
        const healthResp = await fetch(`${gatewayUrl}/health`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        if (!healthResp.ok) {
          toast({ type: 'warning', message: 'AI网关不可用，采集可继续但课后分析可能失败' });
        }
      } catch {
        toast({ type: 'warning', message: '无法连接AI网关，请检查网络。采集仍可进行，课后分析需要网络。' });
      }

      // Path C 全程录制
      if (capturePath === 'full_record') {
        await captureManager.startSession({
          windowId: selectedWindow.id,
          windowTitle: selectedWindow.title,
          screenshotInterval: config.screenshotInterval,
          audioEnabled: false,
          language: config.language,
          autoInsert: false,
          path: 'full_record',
        });
        setRecordingStatus(null);
        setVideoFilePath(null);
        await window.electronAPI.invoke('video_record_start', { windowId: selectedWindow.id });
        soundPlayer.play('capture_start');
        return;
      }

      const audioEnabled = mode === 'audio' || mode === 'mixed';
      await window.electronAPI.invoke('screen_capture_start', {
        windowId: selectedWindow.id,
        interval: config.screenshotInterval,
      });
      await captureManager.startSession({
        windowId: selectedWindow.id,
        windowTitle: selectedWindow.title,
        screenshotInterval: config.screenshotInterval,
        audioEnabled,
        language: config.language,
        autoInsert: config.autoInsert,
        path: capturePath,
        courseMeta: courseMeta.courseName ? courseMeta : undefined,
      });
      soundPlayer.play('capture_start');

      if (audioEnabled) {
        try {
          const audioResult = await window.electronAPI.invoke('audio_capture_start', {
            chunkDurationMs: 5000, sampleRate: 16000, channels: 1,
          }) as IPCAudioStartResult;
          if (!audioResult.success) {
            console.warn('[useClassroomCapture] Audio start failed:', audioResult.error);
          }
        } catch (audioErr) {
          console.warn('[useClassroomCapture] Audio unavailable:', audioErr);
        }
      }
    } catch (err) {
      setStatus('error');
      console.error('[useClassroomCapture] Start failed:', err);
    }
  }, [selectedWindow, config, mode, capturePath, captureManager, toast]);

  // ── 暂停/恢复 ──
  const handlePause = useCallback(() => {
    if (status === 'capturing') {
      setStatus('paused');
      captureManager.pauseSession();
    } else if (status === 'paused') {
      setStatus('capturing');
      captureManager.resumeSession();
    }
  }, [status, captureManager]);

  // ── 停止 ──
  const handleStop = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      frameRestartRef.current = null;

      if (capturePath === 'full_record') {
        const stopResult = await window.electronAPI.invoke('video_record_stop') as {
          success: boolean; filePath?: string; fileSizeBytes?: number;
        };
        if (stopResult.filePath) setVideoFilePath(stopResult.filePath);
        await captureManager.stopSession();
        soundPlayer.play('capture_stop');
        setStatus('idle');
        setRecordingStatus(null);
        if (stopResult.filePath) {
          const confirmed = window.confirm('全程录制已完成，是否生成课堂笔记？');
          if (confirmed) handleVideoAnalyze(stopResult.filePath);
        }
        return;
      }

      await window.electronAPI.invoke('screen_capture_stop');
      await window.electronAPI.invoke('audio_capture_stop');
      await audioCleanupRef.current?.();
      audioCleanupRef.current = null;
      await captureManager.stopSession();
      soundPlayer.play('capture_stop');
      setStatus('idle');

      if (capturePath === 'smart' && smartBundle.keyframes && smartBundle.keyframes.length > 0) {
        // 处理剩余未分析的关键帧（不足一批的尾部帧）
        if (pendingKeyframesRef.current.length > 0 && !isPartialAnalyzingRef.current) {
          try {
            const remaining = pendingKeyframesRef.current.splice(0);
            const partial = await analyzePartial(remaining, { language: config.language });
            partialNotesRef.current.push(partial);
            setPartialCount(partialNotesRef.current.length);
          } catch { /* 静默失败 */ }
        }

        // 有增量片段→快速合并；无增量→回退全量分析
        if (partialNotesRef.current.length > 0) {
          setIsAnalyzing(true);
          setAnalysisError(null);
          const partials = [...partialNotesRef.current];
          try {
            const result = await mergeNotes(partials, {
              duration: (smartBundle.duration ?? 0) / 1000,
              language: config.language,
            });
            setAnalysisResult(result);
          } catch {
            // 降级：本地拼接片段笔记（无需 AI，零网络，避免全量重发）
            const fallbackContent = partials.join('\n\n---\n\n');
            setAnalysisResult({
              content: fallbackContent,
              keyframesAnalyzed: smartBundle.keyframes?.length ?? 0,
              modelUsed: 'local-concat',
            });
            toast({ type: 'warning', message: 'AI 合并不可用，已直接拼接片段笔记' });
          } finally {
            setIsAnalyzing(false);
          }
        } else {
          // 回退到原有全量分析
          const confirmed = window.confirm('智能采集已完成，是否生成完整笔记？');
          if (confirmed) handleAnalyze();
        }

        // 清理增量状态
        partialNotesRef.current = [];
        pendingKeyframesRef.current = [];
        setPartialCount(0);
      }
    } catch (err) {
      setStatus('error');
      console.error('[useClassroomCapture] Stop failed:', err);
    }
  }, [captureManager, capturePath, smartBundle]);

  // ── 模式切换 ──
  const handleModeChange = useCallback((newMode: CaptureMode) => {
    setMode(newMode);
    setConfig((prev) => ({ ...prev, mode: newMode }));
  }, []);

  // ── 片段选择 ──
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── 配置变更 ──
  const handleConfigChange = useCallback((patch: Partial<CaptureSidebarConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── Path B 分析 ──
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
      const result = await analyzeSession(fullBundle, { language: config.language });
      setAnalysisResult(result);
      // 全量分析完成，释放所有 keyframe imageBase64 内存
      setSmartBundle((prev) => ({
        ...prev,
        keyframes: (prev.keyframes ?? []).map((kf) => ({ ...kf, imageBase64: '' })),
      }));
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setAnalysisError('无法连接AI网关，请检查网络');
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        setAnalysisError('分析超时，请重试或缩短录制时长');
      } else if (err instanceof Error && err.message.includes('HTTP')) {
        setAnalysisError('服务端错误：' + err.message);
      } else {
        setAnalysisError(err instanceof Error ? err.message : '未知分析错误');
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [smartBundle, config.language]);

  // ── Path C 视频分析 ──
  const handleVideoAnalyze = useCallback(async (filePath?: string) => {
    const targetPath = filePath ?? videoFilePath;
    if (!targetPath) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const result = await analyzeVideo(targetPath, {
        duration: recordingStatus?.duration,
        language: config.language,
      });
      setAnalysisResult(result);
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setAnalysisError('无法连接AI网关，请检查网络');
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        setAnalysisError('分析超时，请重试或缩短录制时长');
      } else if (err instanceof Error && err.message.includes('HTTP')) {
        setAnalysisError('服务端错误：' + err.message);
      } else {
        setAnalysisError(err instanceof Error ? err.message : '未知分析错误');
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [videoFilePath, recordingStatus?.duration, config.language]);

  const handleDismissAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
  }, []);

  // ── 笔记→闪卡一键生成 ──
  const handleGenerateCards = useCallback(async (content: string) => {
    if (!window.electronAPI) return;
    try {
      toast({ type: 'info', message: '正在从笔记生成闪卡...' });
      await window.electronAPI.invoke('ai_generate_cards', { content });
      toast({ type: 'success', message: '闪卡已生成，可在闪卡模块查看' });
    } catch (err) {
      console.error('[useClassroomCapture] 生成闪卡失败:', err);
      toast({ type: 'error', message: '闪卡生成失败，请重试' });
    }
  }, [toast]);

  // ── 课中重点标记 ──
  const [bookmarks, setBookmarks] = useState<{ timestamp: number; label?: string }[]>([]);

  const handleBookmark = useCallback(() => {
    if (status !== 'capturing') return;
    const now = Date.now();
    setBookmarks((prev) => [...prev, { timestamp: now }]);
    // 同时插入 smartBundle timeline
    setSmartBundle((prev) => ({
      ...prev,
      timeline: [...(prev.timeline ?? []), { timestamp: now, type: 'bookmark' as const }],
    }));
    toast({ type: 'success', message: `已标记重点 (${new Date(now).toLocaleTimeString()})` });
  }, [status, toast]);

  // ================================================================
  // 笔记持久化：同课程查询 / 追加 / 新建
  // 复用 noteStore + createWithLog/updateWithLog，保证 content 加密、
  // 操作日志与 CRDT 同步与全站一致；Note.content 存储 TipTap JSON。
  // ================================================================

  /** 查询同课程名的已有笔记（用于“追加到已有笔记”下拉列表） */
  const fetchCourseNotes = useCallback(async (courseName: string): Promise<CourseNoteItem[]> => {
    if (!courseName) return [];
    try {
      const matched = await noteStore.find((n) => n.title.includes(courseName));
      return matched
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 10)
        .map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          updatedAt: new Date(n.updatedAt).toISOString(),
        }));
    } catch (err) {
      console.warn('[useClassroomCapture] 查询课程笔记失败:', err);
      return [];
    }
  }, []);

  /** 追加内容到已有笔记末尾（带时间分隔标记，合并 TipTap JSON） */
  const appendToNote = useCallback(async (noteId: string, markdownContent: string, sessionLabel: string) => {
    const existing = await noteStore.getById(noteId);
    const mergedContent = appendMarkdownToTipTapJson(
      existing?.content ?? '',
      sessionLabel,
      markdownContent,
    );
    await updateWithLog(noteStore, 'notes', noteId, {
      content: mergedContent,
      updatedAt: new Date(),
      wordCount: markdownContent.length,
    });
  }, []);

  /** 创建新的课程笔记（Markdown 转 TipTap JSON） */
  const createCourseNote = useCallback(async (title: string, markdownContent: string) => {
    const now = new Date();
    const tipTapContent = markdownToTipTapJson(markdownContent);
    await createWithLog(noteStore, 'notes', {
      title,
      content: tipTapContent,
      template: 'blank',
      tags: [courseMeta.courseName ?? '课堂笔记'],
      createdAt: now,
      updatedAt: now,
      wordCount: markdownContent.length,
      pinned: false,
    });
  }, [courseMeta]);

  /** 计算当天同课程的采集序号（用于“第N次采集”标签） */
  const getSessionSeq = useCallback(async (): Promise<number> => {
    const name = courseMeta.courseName;
    if (!name) return 1;
    const notes = await fetchCourseNotes(name);
    const today = new Date().toLocaleDateString('zh-CN');
    const escaped = today.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let maxSeq = 0;
    for (const note of notes) {
      // content 为 TipTap JSON，直接在其字符串形式中检索分段标题
      const matches = (note.content ?? '').matchAll(new RegExp(`${escaped} 第(\\d+)次采集`, 'g'));
      for (const m of matches) {
        maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
    }
    return maxSeq + 1;
  }, [courseMeta.courseName, fetchCourseNotes]);

  return {
    // 窗口
    windows, windowsLoading, selectedWindow, setSelectedWindow, refreshWindows,
    // 会话
    status, mode, segments, selectedIds, stats, extractionError, config,
    // 路径
    capturePath, setCapturePath, smartBundle,
    // 分析
    isAnalyzing, analysisResult, analysisError, partialCount, transcribedCount,
    // 实时转录
    liveTranscripts,
    // 音频健康 + VAD
    audioHealth, vadStats,
    // 课程上下文
    courseMeta, setCourseMeta, aiDetectEnabled, setAiDetectEnabled,
    // 录制
    recordingStatus, videoFilePath,
    // 操作
    handleStart, handlePause, handleStop, handleModeChange,
    handleToggleSelect, handleConfigChange,
    handleAnalyze, handleVideoAnalyze, handleDismissAnalysis, handleGenerateCards,
    handleBookmark, bookmarks,
    // 笔记持久化
    fetchCourseNotes, appendToNote, createCourseNote, getSessionSeq,
    // 派生
    canStart: !!selectedWindow,
  };
}
