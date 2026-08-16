/**
 * 采集会话编排 hook（窗口/状态/启停控制）
 *
 * @ai-context: 从 CaptureSidebar 拆出，聚合会话全部状态与三路径启停：
 * ①fine/smart 走 screen_capture_start + CaptureManager 流水线
 * ②full_record 走独立 video_record_* IPC，不启动截图/音频流水线
 * 启动前预检 AI 网关连通性（不可用仅警告不阻断，本地优先原则）；
 * 音频启动失败不阻断视觉采集。frameRestartRef 为 watchdog 保底重启回调，
 * 停止时最先清空以防 watchdog 在停止过程中触发（Bug #16）。
 * 内部组合 useCaptureEvents（事件桥接）与 useRendererAudioPipeline（音频管道）。
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useToast } from '@/components/ui/Toast';
import { CaptureManager } from '@/lib/capture';
import type {
  WindowInfo,
  CaptureMode,
  CaptureSidebarConfig,
  SessionStatus,
  CapturePath,
} from '@/lib/capture';
import { useCaptureEvents } from './useCaptureEvents';
import { useRendererAudioPipeline } from './useRendererAudioPipeline';
import { useCaptureAnalysis } from './useCaptureAnalysis';
import { probeGateway, type IPCAudioStartResult } from '../utils/captureGatewayProbe';

export function useCaptureSession() {
  const { toast } = useToast();
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [mode, setMode] = useState<CaptureMode>('mixed');
  const [capturePath, setCapturePath] = useState<CapturePath>('fine');
  const [config, setConfig] = useState<CaptureSidebarConfig>({
    screenshotInterval: 5000,
    language: 'zh',
    autoInsert: false,
    mode: 'mixed',
  });

  const { audioCleanupRef } = useRendererAudioPipeline();

  // 帧超时保底重启回调引用（供 CaptureManager 调用）
  const frameRestartRef = useRef<(() => void) | null>(null);

  // 保持 restart ref 为最新闭包
  useEffect(() => {
    if (!window.electronAPI || !selectedWindow) {
      frameRestartRef.current = null;
      return;
    }
    const api = window.electronAPI;
    const winId = selectedWindow.id;
    const interval = config.screenshotInterval;
    frameRestartRef.current = async () => {
      // Bug #16: 检查当前是否仍在 capturing 状态，避免停止后触发重启
      if (status !== 'capturing') return;
      try {
        // eslint-disable-next-line no-console -- 保底重启警告
        console.warn('[CaptureSidebar] 帧超时，自动重启截图采集');
        await api.invoke('screen_capture_stop');
        await new Promise((r) => setTimeout(r, 200));
        await api.invoke('screen_capture_start', { windowId: winId, interval });
      } catch (err) {
        // eslint-disable-next-line no-console -- 保底重启失败
        console.error('[CaptureSidebar] 保底重启失败:', err);
      }
    };
  }, [selectedWindow, config.screenshotInterval, status]);

  // CaptureManager 单例，传入帧超时回调
  const captureManager = useMemo(
    () => new CaptureManager({
      onFrameWatchdogTimeout: () => frameRestartRef.current?.(),
    }),
    [],
  );

  const events = useCaptureEvents({ captureManager, status, capturePath });
  const { setSegments, setStats, smartBundle, setRecordingStatus, setVideoFilePath } = events;

  // AI 分析（Path B/C），语言随会话配置变化
  const analysis = useCaptureAnalysis(config.language);
  const { analyzeBundle, analyzeVideoFile } = analysis;

  // 组件卸载时停止采集会话
  // 注意：不能调用 captureManager.dispose()，因为 React StrictMode 开发模式下
  // effect cleanup 会先执行（清空 workers），但 useMemo 不会重建实例，
  // 导致 remount 后 pipeline 无 Worker 可用。仅停止会话即可。
  useEffect(() => {
    return () => {
      captureManager.stopSession().catch((err) => {
        console.debug('[useCaptureSession] stop session failed (unmount)', err);
      });
    };
  }, [captureManager]);

  const refreshWindows = useCallback(async () => {
    if (!window.electronAPI) return;
    setWindowsLoading(true);
    try {
      const result = await window.electronAPI.invoke('screen_list_windows');
      setWindows(result as WindowInfo[]);
    } catch {
      // eslint-disable-next-line no-console -- 窗口列表获取失败
      console.error('[CaptureSidebar] Failed to list windows');
    } finally {
      setWindowsLoading(false);
    }
  }, []);

  // 挂载时自动加载窗口列表
  useEffect(() => {
    refreshWindows();
  }, [refreshWindows]);

  /** 预检 AI 网关连通性（不可用仅提示，不阻断采集） */
  const checkGateway = useCallback(() => probeGateway(toast), [toast]);

  const handleStart = useCallback(async () => {
    if (!selectedWindow || !window.electronAPI) return;

    try {
      setStatus('capturing');
      setStats({ frames: 0, extracted: 0 });
      setSegments([]);

      await checkGateway();

      // @ai-context Path C 全程录制：走独立 IPC 通道，不启动截图/音频流水线
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
        await window.electronAPI.invoke('video_record_start', {
          windowId: selectedWindow.id,
        });
        soundPlayer.play('capture_start');
        return;
      }

      const audioEnabled = mode === 'audio' || mode === 'mixed';

      // 通过 IPC 启动主进程截图采集
      await window.electronAPI.invoke('screen_capture_start', {
        windowId: selectedWindow.id,
        interval: config.screenshotInterval,
      });

      // 启动前端 CaptureManager 会话（流水线 + Workers + CrossFusion）
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

      // 按需启动音频采集（IPC → 主进程 → do_start → 渲染端 getUserMedia）
      if (audioEnabled) {
        try {
          const audioResult = await window.electronAPI.invoke('audio_capture_start', {
            chunkDurationMs: 5000,
            sampleRate: 16000,
            channels: 1,
          }) as IPCAudioStartResult;
          if (!audioResult.success) {
            // eslint-disable-next-line no-console -- 音频启动失败警告
            console.warn('[CaptureSidebar] Audio capture start failed:', audioResult.error);
          }
        } catch (audioErr) {
          // eslint-disable-next-line no-console -- 音频不可用警告
          console.warn('[CaptureSidebar] Audio capture unavailable:', audioErr);
          // 音频失败不阻断视觉采集，继续运行
        }
      }
    } catch (err) {
      setStatus('error');
      // eslint-disable-next-line no-console -- 采集启动失败
      console.error('[CaptureSidebar] Start capture failed:', err);
    }
  }, [selectedWindow, config, mode, capturePath, captureManager, checkGateway, setSegments, setStats, setRecordingStatus, setVideoFilePath]);

  /** 暂停采集（停止推送帧到流水线，主进程继续截图） */
  const handlePause = useCallback(() => {
    if (status === 'capturing') {
      setStatus('paused');
      captureManager.pauseSession();
    } else if (status === 'paused') {
      setStatus('capturing');
      captureManager.resumeSession();
    }
  }, [status, captureManager]);

  const handleStop = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      // 最先清除重启回调，防止 watchdog 在停止过程中触发
      frameRestartRef.current = null;

      // @ai-context Path C 全程录制：通过 IPC 停止录制并获取视频文件路径
      if (capturePath === 'full_record') {
        const stopResult = await window.electronAPI.invoke('video_record_stop') as {
          success: boolean;
          filePath?: string;
          fileSizeBytes?: number;
        };
        if (stopResult.filePath) {
          setVideoFilePath(stopResult.filePath);
        }
        await captureManager.stopSession();
        soundPlayer.play('capture_stop');
        setStatus('idle');
        setRecordingStatus(null);

        // 录制完成后提示是否生成 AI 笔记
        if (stopResult.filePath) {
          const confirmed = window.confirm('全程录制已完成，是否生成课堂笔记？');
          if (confirmed) {
            analyzeVideoFile(stopResult.filePath);
          }
        }
        return;
      }

      // 停止主进程截图和音频
      await window.electronAPI.invoke('screen_capture_stop');
      await window.electronAPI.invoke('audio_capture_stop');

      // 清理渲染端音频管道（如有）
      await audioCleanupRef.current?.();
      audioCleanupRef.current = null;

      // 停止 CaptureManager 会话
      await captureManager.stopSession();

      soundPlayer.play('capture_stop');
      setStatus('idle');

      // @ai-context Path B 智能模式：停止后提示是否生成完整笔记
      if (capturePath === 'smart' && smartBundle.keyframes && smartBundle.keyframes.length > 0) {
        const confirmed = window.confirm('智能采集已完成，是否生成完整笔记？');
        if (confirmed) {
          analyzeBundle(smartBundle);
        }
      }
    } catch (err) {
      setStatus('error');
      // eslint-disable-next-line no-console -- 采集停止失败
      console.error('[CaptureSidebar] Stop capture failed:', err);
    }
  }, [captureManager, capturePath, smartBundle, audioCleanupRef, analyzeBundle, analyzeVideoFile, setRecordingStatus, setVideoFilePath]);

  const handleModeChange = useCallback((newMode: CaptureMode) => {
    setMode(newMode);
    setConfig((prev) => ({ ...prev, mode: newMode }));
  }, []);

  const handleConfigChange = useCallback((patch: Partial<CaptureSidebarConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  return {
    ...events,
    ...analysis,
    windows, windowsLoading, selectedWindow, setSelectedWindow, refreshWindows,
    status, mode, capturePath, setCapturePath, config,
    handleStart, handlePause, handleStop, handleModeChange, handleConfigChange,
    canStart: !!selectedWindow,
  };
}
