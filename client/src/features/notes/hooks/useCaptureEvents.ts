/**
 * 采集事件桥接 hook（captureEventBus + Electron IPC 订阅）
 *
 * @ai-context: 从 CaptureSidebar 拆出。集中订阅四类事件：
 * ①提取结果/错误（extraction:*）②Path B 关键帧与 bundle（smart:*）
 * ③Path C 视频就绪（record:video_ready）+ 2s 轮询录制状态
 * ④主进程截图帧/音频块 → 推入 CaptureManager 管线。
 * 仅在 status==='capturing' 时订阅 IPC 帧流，避免空闲期无谓开销。
 */
import { useState, useEffect } from 'react';
import { captureEventBus } from '@/lib/capture';
import type {
  CaptureManager,
  ExtractedSegment,
  SessionStatus,
  ScreenshotData,
  AudioChunkData,
  CapturePath,
  SessionBundle,
  KeyFrame,
  RecordingStatus,
  VideoRecording,
} from '@/lib/capture';

interface UseCaptureEventsOptions {
  captureManager: CaptureManager;
  status: SessionStatus;
  capturePath: CapturePath;
}

export function useCaptureEvents({ captureManager, status, capturePath }: UseCaptureEventsOptions) {
  const [segments, setSegments] = useState<ExtractedSegment[]>([]);
  const [stats, setStats] = useState({ frames: 0, extracted: 0 });
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [smartBundle, setSmartBundle] = useState<Partial<SessionBundle>>({});
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);

  // 监听 captureEventBus 提取结果事件，更新 UI 片段列表
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

    const offError = captureEventBus.on<{ message: string }>('extraction:error', (data) => {
      setExtractionError(data.message);
    });

    return () => {
      offCompleted();
      offError();
    };
  }, []);

  // @ai-context Path B：监听智能模式关键帧和 bundle 就绪事件
  useEffect(() => {
    const offKeyframe = captureEventBus.on<{ sessionId: string; keyframe: KeyFrame }>(
      'smart:keyframe',
      (data) => {
        setSmartBundle((prev) => ({
          ...prev,
          keyframes: [...(prev.keyframes ?? []), data.keyframe],
        }));
      },
    );

    const offBundleReady = captureEventBus.on<{
      sessionId: string;
      bundle: SessionBundle;
    }>('smart:bundle_ready', (data) => {
      setSmartBundle(data.bundle);
    });

    return () => {
      offKeyframe();
      offBundleReady();
    };
  }, []);

  // @ai-context Path C：监听录制视频就绪事件
  useEffect(() => {
    const offVideoReady = captureEventBus.on<{
      sessionId: string;
      videoRecording: VideoRecording;
    }>('record:video_ready', (data) => {
      if (data.videoRecording.filePath) {
        setVideoFilePath(data.videoRecording.filePath);
      }
    });
    return () => { offVideoReady(); };
  }, []);

  // Path C 录制中定期轮询状态（每 2 秒通过 IPC 获取最新录制指标）
  useEffect(() => {
    if (capturePath !== 'full_record' || status !== 'capturing') return;
    const poll = async () => {
      try {
        const result = await window.electronAPI?.invoke('video_record_status') as RecordingStatus | undefined;
        if (result) setRecordingStatus(result);
      } catch { /* 轮询失败静默跳过 */ }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [capturePath, status]);

  // 监听截图帧（主进程 → 渲染进程）
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;

    const off = window.electronAPI.on('screen_capture_frame', (...args: unknown[]) => {
      const frameData = args[0] as ScreenshotData;
      captureManager.pushFrame(frameData);
      setStats((prev) => ({ ...prev, frames: prev.frames + 1 }));
    });
    return off;
  }, [status, captureManager]);

  // 监听音频块（主进程 → 渲染进程）
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;

    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as AudioChunkData;
      captureManager.pushAudioChunk(chunk);
    });
    return off;
  }, [status, captureManager]);

  return {
    segments, setSegments,
    stats, setStats,
    extractionError, setExtractionError,
    smartBundle, setSmartBundle,
    recordingStatus, setRecordingStatus,
    videoFilePath, setVideoFilePath,
  };
}
