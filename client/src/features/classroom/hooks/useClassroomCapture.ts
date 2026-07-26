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
} from '@/lib/capture';
import { analyzeSession, analyzeVideo, analyzePartial, mergeNotes } from '@/lib/ai/sessionAnalyzer';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';
import { aiClient } from '@/lib/http/apiClient';

interface IPCAudioStartResult {
  success: boolean;
  error?: string;
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

  // ── Path C 全程录制 ──
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);

  // ── Refs ──
  const audioCleanupRef = useRef<(() => void | Promise<void>) | null>(null);
  const frameRestartRef = useRef<(() => void) | null>(null);

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

        // 增量分析：累积到缓冲区，达到批次大小时触发后台分析
        pendingKeyframesRef.current.push(data.keyframe);
        if (pendingKeyframesRef.current.length >= INCREMENTAL_BATCH_SIZE && !isPartialAnalyzingRef.current) {
          const batch = pendingKeyframesRef.current.splice(0, INCREMENTAL_BATCH_SIZE);
          isPartialAnalyzingRef.current = true;
          analyzePartial(batch, { language: config.language })
            .then((partial) => {
              partialNotesRef.current.push(partial);
              setPartialCount(partialNotesRef.current.length);
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
  }, [config.language]);

  // ── Path B：流式 ASR — 语音段完成后立即转写 ──
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

        // 后台流式 ASR 转写（不阻塞采集）
        if (!seg.audioBase64) return;
        const lang = config.language === 'en' ? 'en' : config.language === 'mixed' ? 'auto' : 'zh';
        aiClient.post<{ text: string }>('/api/v1/asr/transcribe', {
          audio_base64: seg.audioBase64,
          language: lang,
          sample_rate: 16000,
          channels: 1,
        })
          .then((resp) => {
            const text = resp.text?.trim() || null;
            // 将转写结果回填到对应的音频段
            setSmartBundle((prev) => ({
              ...prev,
              audioSegments: (prev.audioSegments ?? []).map((s) =>
                s.id === seg.id ? { ...s, audioText: text } : s,
              ),
            }));
            if (text) setTranscribedCount((c) => c + 1);
          })
          .catch((err) => {
            console.warn('[useClassroomCapture] 流式 ASR 转写失败:', err);
          });
      },
    );
    return () => { offSegmentReady(); };
  }, [config.language]);

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

  // ── 监听音频块 ──
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;
    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as AudioChunkData;
      captureManager.pushAudioChunk(chunk);
    });
    return off;
  }, [status, captureManager]);

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
          const sourceNode = audioCtx.createMediaStreamSource(stream);
          const bufferSize = Math.ceil((payload.options.sampleRate * payload.options.chunkDurationMs) / 1000);
          const processor = audioCtx.createScriptProcessor(bufferSize, payload.options.channels, 1);
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = new Float32Array(inputData).buffer;
            window.electronAPI?.send('audio_capture_chunk', {
              audioBuffer: pcmData,
              sampleRate: payload.options.sampleRate,
              channels: payload.options.channels,
              durationMs: payload.options.chunkDurationMs,
            });
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

  return {
    // 窗口
    windows, windowsLoading, selectedWindow, setSelectedWindow, refreshWindows,
    // 会话
    status, mode, segments, selectedIds, stats, extractionError, config,
    // 路径
    capturePath, setCapturePath, smartBundle,
    // 分析
    isAnalyzing, analysisResult, analysisError, partialCount, transcribedCount,
    // 录制
    recordingStatus, videoFilePath,
    // 操作
    handleStart, handlePause, handleStop, handleModeChange,
    handleToggleSelect, handleConfigChange,
    handleAnalyze, handleVideoAnalyze, handleDismissAnalysis,
    // 派生
    canStart: !!selectedWindow,
  };
}
