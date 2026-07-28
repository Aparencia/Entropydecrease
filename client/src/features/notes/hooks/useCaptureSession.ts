import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { CaptureManager, captureEventBus } from '@/lib/capture';
import { useAmbientStore } from '@/lib/animation/useAmbientState';
import type {
  WindowInfo, ExtractedSegment, SessionStatus, CaptureSidebarConfig,
  CaptureMode, CapturePath, ScreenshotData, AudioChunkData,
  KeyFrame, SessionBundle, RecordingStatus, VideoRecording,
} from '@/lib/capture';
import type { IPCAudioStartResult } from '../components/capture/types';

// ================================================================
// useCaptureSession — 采集会话核心状态 + IPC 通信管理
// ================================================================

interface UseCaptureSessionParams {
  selectedWindow: WindowInfo | null;
  config: CaptureSidebarConfig;
  mode: CaptureMode;
  capturePath: CapturePath;
  onInsertText?: (text: string) => void;
  /** 由 useCaptureAnalysis 提供的分析回调（通过 ref 避免循环依赖） */
  onAnalyze?: () => void;
  onVideoAnalyze?: (filePath?: string) => void;
}

export function useCaptureSession({
  selectedWindow, config, mode, capturePath, onInsertText,
  onAnalyze, onVideoAnalyze,
}: UseCaptureSessionParams) {
  // 通过 useAnalyzeBridge 传入的 onAnalyze/onVideoAnalyze 已是稳定引用
  // 额外 ref 保障 hook 也可独立使用
  const analyzeRef = useRef(onAnalyze);
  const videoAnalyzeRef = useRef(onVideoAnalyze);
  useEffect(() => { analyzeRef.current = onAnalyze; videoAnalyzeRef.current = onVideoAnalyze; });
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [segments, setSegments] = useState<ExtractedSegment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ frames: 0, extracted: 0 });
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [smartBundle, setSmartBundle] = useState<Partial<SessionBundle>>({});
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);

  const audioCleanupRef = useRef<(() => void) | null>(null);
  const frameRestartRef = useRef<(() => void) | null>(null);

  // 帧超时回调保持最新闭包
  useEffect(() => {
    if (!window.electronAPI || !selectedWindow) { frameRestartRef.current = null; return; }
    const api = window.electronAPI; const winId = selectedWindow.id; const interval = config.screenshotInterval;
    frameRestartRef.current = async () => {
      try {
        console.warn('[useCaptureSession] 帧超时，自动重启截图采集');
        await api.invoke('screen_capture_stop'); await new Promise((r) => setTimeout(r, 200));
        await api.invoke('screen_capture_start', { windowId: winId, interval });
      } catch (err) { console.error('[useCaptureSession] 保底重启失败:', err); }
    };
  }, [selectedWindow, config.screenshotInterval]);

  // CaptureManager 单例（不可 dispose，详见原注释）
  const captureManager = useMemo(
    () => new CaptureManager({ onFrameWatchdogTimeout: () => frameRestartRef.current?.() }), [],
  );
  useEffect(() => () => { captureManager.stopSession().catch(() => {}); }, [captureManager]);

  // ---- captureEventBus 事件监听 ----
  useEffect(() => {
    const off1 = captureEventBus.on<{ sessionId: string | null; result: { text: string; confidence: number; source: 'vision' | 'audio' | 'ui_automation' }; segment: { id: string; timestamp: Date }; extractedCount: number }>(
      'extraction:completed', (data) => {
        setSegments((p) => [...p, { id: data.segment.id, timestamp: data.segment.timestamp.getTime(), source: data.result.source, text: data.result.text, confidence: data.result.confidence }]);
        setStats((p) => ({ ...p, extracted: data.extractedCount })); setExtractionError(null);
      });
    const off2 = captureEventBus.on<{ message: string }>('extraction:error', (d) => setExtractionError(d.message));
    const off3 = captureEventBus.on<{ sessionId: string; keyframe: KeyFrame }>(
      'smart:keyframe', (d) => setSmartBundle((p) => ({ ...p, keyframes: [...(p.keyframes ?? []), d.keyframe] })));
    const off4 = captureEventBus.on<{ sessionId: string; bundle: SessionBundle }>(
      'smart:bundle_ready', (d) => setSmartBundle(d.bundle));
    const off5 = captureEventBus.on<{ sessionId: string; videoRecording: VideoRecording }>(
      'record:video_ready', (d) => { if (d.videoRecording.filePath) setVideoFilePath(d.videoRecording.filePath); });
    return () => { off1(); off2(); off3(); off4(); off5(); };
  }, []);

  // ---- IPC: 截图帧 + 音频块 ----
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;
    const offF = window.electronAPI.on('screen_capture_frame', (...a: unknown[]) => {
      captureManager.pushFrame(a[0] as ScreenshotData); setStats((p) => ({ ...p, frames: p.frames + 1 }));
    });
    const offC = window.electronAPI.on('audio_capture_chunk', (...a: unknown[]) => { captureManager.pushAudioChunk(a[0] as AudioChunkData); });
    return () => { offF(); offC(); };
  }, [status, captureManager]);

  // ---- IPC: 渲染端音频管道生命周期 ----
  useEffect(() => {
    if (!window.electronAPI) return;
    const offS = window.electronAPI.on('audio_capture_do_start', (...args: unknown[]) => {
      if (audioCleanupRef.current) return;
      const p = args[0] as { sourceId: string; options: { sampleRate: number; channels: number; chunkDurationMs: number } };
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { chromeMediaSource: 'desktop', chromeMediaSourceId: p.sourceId } as MediaTrackConstraintSet });
          const ctx = new AudioContext({ sampleRate: p.options.sampleRate });
          // 关键修复：AudioContext 在 IPC 回调（非用户手势）中创建时默认 suspended，
          // ScriptProcessor.onaudioprocess 永不触发，必须显式 resume()。
          if (ctx.state !== 'running') {
            await ctx.resume();
          }
          const src = ctx.createMediaStreamSource(stream);
          // 根因修复：createScriptProcessor 的 bufferSize 必须是 [256, 16384] 内 2 的幂，
          // 直接传 chunkDurationMs 对应样本数（80000）会抛 IndexSizeError 中断管道。
          // 用合法小缓冲切片，累积到 chunkDurationMs 再整块发送。
          const PROCESSOR_BUFFER_SIZE = 4096;
          const proc = ctx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, p.options.channels, 1);
          const targetSamples = Math.ceil((p.options.sampleRate * p.options.chunkDurationMs) / 1000);
          let pending = new Float32Array(targetSamples);
          let pendingOffset = 0;
          proc.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            // 计算 RMS 振幅并同步到氛围 store（逐回调计算，保证可视化实时性）
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
            const rms = Math.sqrt(sum / inputData.length);
            useAmbientStore.getState().setAudioAmplitude(Math.min(1, rms * 5));
            // 累积样本，满 targetSamples 发送一个完整块
            let srcOffset = 0;
            while (srcOffset < inputData.length) {
              const take = Math.min(targetSamples - pendingOffset, inputData.length - srcOffset);
              pending.set(inputData.subarray(srcOffset, srcOffset + take), pendingOffset);
              pendingOffset += take;
              srcOffset += take;
              if (pendingOffset >= targetSamples) {
                window.electronAPI?.send('audio_capture_chunk', { audioBuffer: pending.buffer, sampleRate: p.options.sampleRate, channels: p.options.channels, durationMs: p.options.chunkDurationMs });
                pending = new Float32Array(targetSamples);
                pendingOffset = 0;
              }
            }
          };
          src.connect(proc); proc.connect(ctx.destination);
          audioCleanupRef.current = () => { proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); };
        } catch (err) { console.error('[useCaptureSession] Audio pipeline start failed:', err); }
      })();
    });
    const offT = window.electronAPI.on('audio_capture_do_stop', () => {
      audioCleanupRef.current?.(); audioCleanupRef.current = null;
      useAmbientStore.getState().setAudioAmplitude(0);
    });
    return () => { offS(); offT(); audioCleanupRef.current?.(); audioCleanupRef.current = null; };
  }, []);

  // ---- Path C: 录制状态轮询 ----
  useEffect(() => {
    if (capturePath !== 'full_record' || status !== 'capturing') return;
    const poll = async () => { try { const r = await window.electronAPI?.invoke('video_record_status') as RecordingStatus | undefined; if (r) setRecordingStatus(r); } catch { /* silent */ } };
    poll(); const t = setInterval(poll, 2000); return () => clearInterval(t);
  }, [capturePath, status]);

  // ---- 采集控制回调 ----
  const handleStart = useCallback(async () => {
    if (!selectedWindow || !window.electronAPI) return;
    try {
      setStatus('capturing'); setStats({ frames: 0, extracted: 0 }); setSegments([]); setSelectedIds(new Set());
      if (capturePath === 'full_record') {
        await captureManager.startSession({ windowId: selectedWindow.id, windowTitle: selectedWindow.title, screenshotInterval: config.screenshotInterval, audioEnabled: false, language: config.language, autoInsert: false, path: 'full_record' });
        setRecordingStatus(null); setVideoFilePath(null);
        await window.electronAPI.invoke('video_record_start', { windowId: selectedWindow.id });
        soundPlayer.play('capture_start'); return;
      }
      const audioEnabled = mode === 'audio' || mode === 'mixed';
      await window.electronAPI.invoke('screen_capture_start', { windowId: selectedWindow.id, interval: config.screenshotInterval });
      await captureManager.startSession({ windowId: selectedWindow.id, windowTitle: selectedWindow.title, screenshotInterval: config.screenshotInterval, audioEnabled, language: config.language, autoInsert: config.autoInsert, path: capturePath });
      soundPlayer.play('capture_start');
      if (audioEnabled) {
        try { const r = await window.electronAPI.invoke('audio_capture_start', { chunkDurationMs: 5000, sampleRate: 16000, channels: 1 }) as IPCAudioStartResult; if (!r.success) console.warn('[useCaptureSession] Audio start failed:', r.error); }
        catch (err) { console.warn('[useCaptureSession] Audio unavailable:', err); }
      }
    } catch (err) { setStatus('error'); console.error('[useCaptureSession] Start failed:', err); }
  }, [selectedWindow, config, mode, capturePath, captureManager]);

  const handlePause = useCallback(() => {
    if (status === 'capturing') { setStatus('paused'); captureManager.pauseSession(); }
    else if (status === 'paused') { setStatus('capturing'); captureManager.resumeSession(); }
  }, [status, captureManager]);

  const handleStop = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      frameRestartRef.current = null;
      if (capturePath === 'full_record') {
        const r = await window.electronAPI.invoke('video_record_stop') as { success: boolean; filePath?: string };
        if (r.filePath) setVideoFilePath(r.filePath);
        await captureManager.stopSession(); soundPlayer.play('capture_stop'); setStatus('idle'); setRecordingStatus(null);
        if (r.filePath && window.confirm('全程录制已完成，是否生成课堂笔记？')) videoAnalyzeRef.current?.(r.filePath);
        return;
      }
      await window.electronAPI.invoke('screen_capture_stop'); await window.electronAPI.invoke('audio_capture_stop');
      audioCleanupRef.current?.(); audioCleanupRef.current = null;
      await captureManager.stopSession(); soundPlayer.play('capture_stop'); setStatus('idle');
      if (capturePath === 'smart' && smartBundle.keyframes && smartBundle.keyframes.length > 0 && window.confirm('智能采集已完成，是否生成完整笔记？')) analyzeRef.current?.();
    } catch (err) { setStatus('error'); console.error('[useCaptureSession] Stop failed:', err); }
  }, [captureManager, capturePath, smartBundle]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleInsertSelected = useCallback(() => {
    const t = segments.filter((s) => selectedIds.has(s.id)).map((s) => s.text).join('\n\n');
    if (t && onInsertText) onInsertText(t); setSelectedIds(new Set());
  }, [segments, selectedIds, onInsertText]);

  const handleInsertAll = useCallback(() => {
    const t = segments.map((s) => s.text).join('\n\n');
    if (t && onInsertText) onInsertText(t); setSelectedIds(new Set()); setSegments([]);
  }, [segments, onInsertText]);

  return {
    status, segments, selectedIds, stats, extractionError, smartBundle, recordingStatus, videoFilePath,
    handleStart, handlePause, handleStop, handleToggleSelect, handleInsertSelected, handleInsertAll,
  };
}
