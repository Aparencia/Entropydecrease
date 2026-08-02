/**
 * 课堂会话启停控制 hook（三路径启动 / 暂停 / 停止与收尾分析）
 *
 * @ai-context: 从 useClassroomCapture 拆出。启动前预检网关（不可用仅警告
 * 不阻断，本地优先原则）；full_record 走独立 video_record_* IPC，不启动
 * 截图/音频流水线；音频启动失败不阻断视觉采集。
 * @ai-context: 停止时 smart 路径的收尾策略：先补分析不足一批的尾部关键帧，
 * 再优先 mergeNotes 合并增量片段（省去全量重发），完全无片段才询问用户是否
 * 全量分析。frameRestartRef 最先清空以防 watchdog 在停止过程中触发。
 */
import { useCallback } from 'react';
import { requireGatewayUrl } from '@/lib/ai/config';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { analyzePartial } from '@/lib/ai/sessionAnalyzer';
import { refreshLocalAsrStatus } from '../utils/asrTranscriber';
import { getAudioSourcePreference } from '@/lib/capture/audioSourcePreference';
import type { AudioSourceKind } from '@/lib/capture/audioSourceStrategy';
import type {
  CaptureManager,
  CaptureMode,
  CaptureSidebarConfig,
  SessionStatus,
  CapturePath,
  CourseMeta,
  WindowInfo,
  KeyFrame,
  SessionBundle,
} from '@/lib/capture';

/** 主进程音频启动返回值 */
interface IPCAudioStartResult {
  success: boolean;
  error?: string;
  /** 实际生效的音频源（ADR-001 双源选择结果） */
  sourceKind?: AudioSourceKind;
  /** 选源理由（含降级说明），供内测问题归因 */
  sourceReason?: string;
}

interface UseSessionControlOptions {
  captureManager: CaptureManager;
  selectedWindow: WindowInfo | null;
  status: SessionStatus;
  setStatus: (s: SessionStatus) => void;
  mode: CaptureMode;
  capturePath: CapturePath;
  config: CaptureSidebarConfig;
  courseMeta: CourseMeta;
  frameRestartRef: React.MutableRefObject<(() => void) | null>;
  audioCleanupRef: React.MutableRefObject<(() => void | Promise<void>) | null>;
  /** 会话数据与增量分析缓冲（来自 useClassroomEvents） */
  session: {
    smartBundle: Partial<SessionBundle>;
    resetForStart: () => void;
    setRecordingStatus: (s: null) => void;
    setVideoFilePath: (p: string | null) => void;
    partialNotesRef: React.MutableRefObject<string[]>;
    pendingKeyframesRef: React.MutableRefObject<KeyFrame[]>;
    isPartialAnalyzingRef: React.MutableRefObject<boolean>;
    setPartialCount: (n: number) => void;
  };
  onAnalyzeVideo: (filePath: string) => void;
  onAnalyzeFull: () => void;
  onMergePartials: (partials: string[], durationMs: number, keyframeCount: number) => Promise<void>;
  onNotify: (type: 'warning', message: string) => void;
  /** 音频源定下后回报（供诊断文案分支与 UI 展示） */
  onAudioSourceResolved?: (kind: AudioSourceKind | null) => void;
}

export function useSessionControl({
  captureManager, selectedWindow, status, setStatus, mode, capturePath, config, courseMeta,
  frameRestartRef, audioCleanupRef, session,
  onAnalyzeVideo, onAnalyzeFull, onMergePartials, onNotify, onAudioSourceResolved,
}: UseSessionControlOptions) {
  /** 预检 AI 网关连通性（不可用仅提示，不阻断采集） */
  const probeGateway = useCallback(async () => {
    try {
      const gatewayUrl = requireGatewayUrl();
      // GET 而非 HEAD：网关中间件对 HEAD 返回 405，会导致每次启动误报"网关不可用"
      const healthResp = await fetch(`${gatewayUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!healthResp.ok) {
        onNotify('warning', 'AI网关不可用，采集可继续但课后分析可能失败');
      }
    } catch {
      onNotify('warning', '无法连接AI网关，请检查网络。采集仍可进行，课后分析需要网络。');
    }
  }, [onNotify]);

  const handleStart = useCallback(async () => {
    if (!selectedWindow || !window.electronAPI) return;
    try {
      setStatus('capturing');
      session.resetForStart();

      await probeGateway();

      // 刷新本地 ASR 可用性缓存（会话开始时检测一次，避免每段都 IPC 查询）
      refreshLocalAsrStatus().catch(() => { /* 静默失败，降级走云端 */ });

      // Path C 全程录制：走独立 IPC 通道，不启动截图/音频流水线
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
        session.setRecordingStatus(null);
        session.setVideoFilePath(null);
        await window.electronAPI.invoke('video_record_start', { windowId: selectedWindow.id });
        soundPlayer.play('capture_start');
        return;
      }

      const audioEnabled = mode === 'audio' || mode === 'mixed';
      const visionEnabled = mode !== 'audio';
      // 仅音频模式不启动截图采集：无视觉需求时截图纯属资源浪费，
      // 且会让"帧"计数在音频模式下持续增长造成困惑
      if (visionEnabled) {
        await window.electronAPI.invoke('screen_capture_start', {
          windowId: selectedWindow.id,
          interval: config.screenshotInterval,
        });
      }
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
          // 选源由主进程的 selectAudioSource 决定（ADR-001）：锁定具体窗口时
          // 优先进程环回（隔离其他应用杂音），否则用端点环回（不漏采）；
          // 主进程读不到 localStorage，故偏好由渲染进程传入
          const audioResult = await window.electronAPI.invoke('audio_capture_start', {
            chunkDurationMs: 5000, sampleRate: 16000, channels: 1,
            sourceId: selectedWindow.id,
            preference: getAudioSourcePreference(),
          }) as IPCAudioStartResult;
          if (!audioResult.success) {
            console.warn('[useClassroomCapture] Audio start failed:', audioResult.error);
          } else {
            console.info(
              `[useClassroomCapture] 音频源=${audioResult.sourceKind ?? 'unknown'}` +
              `（${audioResult.sourceReason ?? '-'}）`,
            );
            onAudioSourceResolved?.(audioResult.sourceKind ?? null);
          }
        } catch (audioErr) {
          console.warn('[useClassroomCapture] Audio unavailable:', audioErr);
        }
      }
    } catch (err) {
      setStatus('error');
      console.error('[useClassroomCapture] Start failed:', err);
    }
  }, [selectedWindow, setStatus, session, probeGateway, capturePath, captureManager, config, mode, courseMeta, onAudioSourceResolved]);

  const handlePause = useCallback(() => {
    if (status === 'capturing') {
      setStatus('paused');
      captureManager.pauseSession();
    } else if (status === 'paused') {
      setStatus('capturing');
      captureManager.resumeSession();
    }
  }, [status, setStatus, captureManager]);

  /** smart 路径收尾：补分析尾帧 → 合并增量 → 无增量则询问全量分析 */
  const finalizeSmartSession = useCallback(async () => {
    const bundle = session.smartBundle;
    if (!bundle.keyframes || bundle.keyframes.length === 0) return;

    // 处理剩余未分析的关键帧（不足一批的尾部帧）
    if (session.pendingKeyframesRef.current.length > 0 && !session.isPartialAnalyzingRef.current) {
      try {
        const remaining = session.pendingKeyframesRef.current.splice(0);
        // 与增量分析保持同一时间基准：会话首帧的 epoch 毫秒
        const sessionStartMs = bundle.keyframes[0]?.timestamp ?? remaining[0].timestamp;
        const partial = await analyzePartial(remaining, sessionStartMs, { language: config.language });
        session.partialNotesRef.current.push(partial);
        session.setPartialCount(session.partialNotesRef.current.length);
      } catch { /* 静默失败 */ }
    }

    if (session.partialNotesRef.current.length > 0) {
      await onMergePartials(
        [...session.partialNotesRef.current],
        bundle.duration ?? 0,
        bundle.keyframes.length,
      );
    } else {
      const confirmed = window.confirm('智能采集已完成，是否生成完整笔记？');
      if (confirmed) onAnalyzeFull();
    }

    // 清理增量状态
    session.partialNotesRef.current = [];
    session.pendingKeyframesRef.current = [];
    session.setPartialCount(0);
  }, [session, config.language, onMergePartials, onAnalyzeFull]);

  const handleStop = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      // 最先清除重启回调，防止 watchdog 在停止过程中触发
      frameRestartRef.current = null;

      if (capturePath === 'full_record') {
        const stopResult = await window.electronAPI.invoke('video_record_stop') as {
          success: boolean; filePath?: string; fileSizeBytes?: number;
        };
        if (stopResult.filePath) session.setVideoFilePath(stopResult.filePath);
        await captureManager.stopSession();
        soundPlayer.play('capture_stop');
        setStatus('idle');
        session.setRecordingStatus(null);
        if (stopResult.filePath) {
          const confirmed = window.confirm('全程录制已完成，是否生成课堂笔记？');
          if (confirmed) onAnalyzeVideo(stopResult.filePath);
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

      if (capturePath === 'smart') {
        await finalizeSmartSession();
      }
    } catch (err) {
      setStatus('error');
      console.error('[useClassroomCapture] Stop failed:', err);
    }
  }, [capturePath, captureManager, setStatus, frameRestartRef, audioCleanupRef, session, onAnalyzeVideo, finalizeSmartSession]);

  return { handleStart, handlePause, handleStop };
}
