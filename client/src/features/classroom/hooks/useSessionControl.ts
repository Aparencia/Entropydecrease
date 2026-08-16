/**
 * 课堂会话启停控制 hook（三路径启动 / 暂停 / 停止与收尾分析）
 *
 * @ai-context: 从 useClassroomCapture 拆出。网关健康预检已前移到
 * useGatewayHealth（P0-4 软阻断），本 hook 不再自带探针；full_record 走
 * 独立 video_record_* IPC，不启动截图/音频流水线；音频启动失败不阻断视觉采集。
 * @ai-context: 停止时 smart 路径的收尾策略：先补分析不足一批的尾部关键帧，
 * 再优先 mergeNotes 合并增量片段（省去全量重发），完全无片段才询问用户是否
 * 全量分析。frameRestartRef 最先清空以防 watchdog 在停止过程中触发。
 */
import { useCallback } from 'react';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { analyzePartial } from '@/lib/ai/sessionAnalyzer';
import { refreshLocalAsrStatus } from '../utils/asrTranscriber';
import { loadSessionHotwords, clearSessionHotwords, getSessionHotwordsString } from '../utils/hotwordRuntime';
import { getAudioSourcePreference } from '@/lib/capture/audioSourcePreference';
import { webCaptureAdapter } from '../capture/WebCaptureAdapter';
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
  ExtractedSegment,
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
    /** 实时转写最新值 ref 桥（audio 模式无关键帧时作为收尾片段来源） */
    liveTranscriptsRef: React.MutableRefObject<{ id: string; text: string; timestamp: number }[]>;
    /** fine 路径提取段最新值 ref 桥（停止后作为“生成笔记”素材） */
    segmentsRef: React.MutableRefObject<ExtractedSegment[]>;
  };
  onAnalyzeVideo: (filePath: string) => void;
  onAnalyzeFull: () => void;
  onMergePartials: (partials: string[], durationMs: number, keyframeCount: number) => Promise<void>;
  onNotify: (type: 'warning', message: string) => void;
  /** 应用内确认对话框（替代 window.confirm，P0-5；timeout: 0 = 不设超时） */
  askConfirm: (
    req: { title: string; description?: string; confirmLabel?: string },
    opts?: { timeout?: number },
  ) => Promise<boolean>;
  /** 音频源定下后回传（供诊断文案分支与 UI 展示） */
  onAudioSourceResolved?: (kind: AudioSourceKind | null) => void;
  /** 设置真流式 ASR 激活标志（启动成功置 true，停止置 false） */
  setStreamingAsrActive: (active: boolean) => void;
}

export function useSessionControl({
  captureManager, selectedWindow, status, setStatus, mode, capturePath, config, courseMeta,
  frameRestartRef, audioCleanupRef, session,
  onAnalyzeVideo, onAnalyzeFull, onMergePartials, askConfirm, onAudioSourceResolved,
  setStreamingAsrActive,
}: UseSessionControlOptions) {
  const handleStart = useCallback(async (opts?: { localOnly?: boolean }) => {
    // localOnly（P0-4 软阻断确认后传入）：网关探针已前移删除，此参数仅承载
    // "用户已知网关不可用、仅本地采集"语义，启动时序不受影响
    void opts;
    // PWA/浏览器：麦克风应急通道（无窗口、无 Electron 采集能力）
    if (!window.electronAPI) {
      try {
        setStatus('capturing');
        session.resetForStart();
        refreshLocalAsrStatus().catch(() => { /* PWA 下返回 false，自动走云端 */ });
        void loadSessionHotwords(courseMeta.courseName);
        await webCaptureAdapter.start(crypto.randomUUID());
        soundPlayer.play('capture_start');
      } catch (err) {
        setStatus('error');
        console.error('[useClassroomCapture] Web start failed:', err);
      }
      return;
    }
    if (!selectedWindow) return;
    try {
      setStatus('capturing');
      session.resetForStart();

      // 刷新本地 ASR 可用性缓存（会话开始时检测一次，避免每段都 IPC 查询）
      refreshLocalAsrStatus().catch(() => { /* 静默失败，降级走云端 */ });

      // P1-3 热词/替换词表：按当前课程加载"课程专属 + 全局"词条
      // （fire-and-forget：不 await、不阻塞启动时序；失败内部静默降级为空词表）
      void loadSessionHotwords(courseMeta.courseName);

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
          // 检测真流式是否可用（仅 smart 路径）：本地 Paraformer 流式模型就绪时
          // 用更小的采集粒度（400ms）并启用流式 ASR，实现边说边出；否则按段转写
          let useStreaming = false;
          if (capturePath === 'smart') {
            try {
              const avail = await window.electronAPI.invoke('local_asr_stream_available') as { available?: boolean };
              useStreaming = !!avail?.available;
            } catch {
              useStreaming = false;
            }
          }
          // 选源由主进程的 selectAudioSource 决定（ADR-001）：锁定具体窗口时
          // 优先进程环回（隔离其他应用杂音），否则用端点环回（不漏采）；
          // 主进程读不到 localStorage，故偏好由渲染进程传入
          const audioResult = await window.electronAPI.invoke('audio_capture_start', {
            chunkDurationMs: useStreaming ? 400 : 2000, sampleRate: 16000, channels: 1,
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
            // 音频采集启动成功且流式可用 → 启动真流式 ASR（透传热词增强）
            if (useStreaming) {
              try {
                const hotwords = getSessionHotwordsString() || undefined;
                const streamResult = await window.electronAPI.invoke('local_asr_stream_start', { sampleRate: 16000, hotwords }) as { success?: boolean; error?: string };
                if (streamResult?.success) {
                  setStreamingAsrActive(true);
                  console.info('[useClassroomCapture] 真流式 ASR 已启动（Zipformer）');
                } else {
                  console.warn('[useClassroomCapture] 真流式 ASR 启动失败，回退按段转写:', streamResult?.error);
                }
              } catch (streamErr) {
                console.warn('[useClassroomCapture] 真流式 ASR 启动异常，回退按段转写:', streamErr);
              }
            }
          }
        } catch (audioErr) {
          console.warn('[useClassroomCapture] Audio unavailable:', audioErr);
        }
      }
    } catch (err) {
      setStatus('error');
      console.error('[useClassroomCapture] Start failed:', err);
    }
  }, [selectedWindow, setStatus, session, capturePath, captureManager, config, mode, courseMeta, onAudioSourceResolved, setStreamingAsrActive]);

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
    const transcripts = session.liveTranscriptsRef?.current ?? [];
    const transcriptTexts = transcripts.map((t) => t.text).filter((t) => t.trim());
    const hasFrames = (bundle.keyframes?.length ?? 0) > 0;
    const hasPending = session.pendingKeyframesRef.current.length > 0;
    const hasPartials = session.partialNotesRef.current.length > 0;
    // 守卫放宽：audio 模式不启动截图采集 → 无关键帧，转写是唯一产物；
    // 此前仅判 keyframes 导致 audio 会话停止后无任何“生成笔记”入口（内测反馈）
    if (!hasFrames && !hasPending && !hasPartials && transcriptTexts.length === 0) return;

    // ── 同步收割阶段（任何 await 之前）──
    // 停止后 UI 已回配置态，用户可立即启动新会话；增量状态必须在首个
    // await 之前收割并清空，否则本函数尾部的 await 期间新会话累积的
    // 数据会被误清理（resetForStart 不重置这两个 ref）。
    // ① 尾帧：splice 出局部副本并同步清空 ref，分析 await 只消费副本
    const tailFrames = (hasPending
      && !session.isPartialAnalyzingRef.current)
      ? session.pendingKeyframesRef.current.splice(0)
      : [];
    // ② 增量片段：复制后立即清空 ref 与计数，尾帧结果不再回写共享 ref
    const partials = [...session.partialNotesRef.current];
    session.partialNotesRef.current = [];
    session.setPartialCount(0);

    // ── 异步消费阶段：只读局部副本，不再触碰共享增量状态 ──
    // 尾帧与增量分析同一时间基准：会话首帧的 epoch 毫秒
    let tailPartial: string | null = null;
    if (tailFrames.length > 0) {
      try {
        const sessionStartMs = bundle.keyframes?.[0]?.timestamp ?? tailFrames[0].timestamp;
        tailPartial = await analyzePartial(tailFrames, sessionStartMs, { language: config.language });
      } catch { /* 静默失败 */ }
    }

    // 片段来源：增量分析 + 尾帧分析；两者皆空时（audio 模式无关键帧）
    // 以实时转写文本为笔记素材，保证“停止后可生成笔记”
    const allPartials = [...partials, ...(tailPartial ? [tailPartial] : [])];
    const notesInput = allPartials.length > 0 ? allPartials : transcriptTexts;
    if (notesInput.length > 0) {
      await onMergePartials(notesInput, bundle.duration ?? 0, bundle.keyframes?.length ?? 0);
    } else {
      // 无任何文本片段（转写失败等）：询问全量分析——analyzeSession 支持
      // 仅音频段（无关键帧）场景，会现场补充转写
      const confirmed = await askConfirm({
        title: '智能采集已完成',
        description: '是否生成完整笔记？',
        confirmLabel: '生成笔记',
      }, { timeout: 0 });
      if (confirmed) onAnalyzeFull();
    }
  }, [session, config.language, onMergePartials, onAnalyzeFull, askConfirm]);

  /** fine 路径收尾：提取段 → 确认 → AI 整理为笔记（与 smart/full_record 一致） */
  const finalizeFineSession = useCallback(async () => {
    const texts = (session.segmentsRef?.current ?? [])
      .map((s) => s.text).filter((t) => t.trim());
    if (texts.length === 0) return;
    const confirmed = await askConfirm({
      title: '采集已完成',
      description: `已提取 ${texts.length} 段内容，是否生成完整笔记？`,
      confirmLabel: '生成笔记',
    }, { timeout: 0 });
    if (confirmed) {
      await onMergePartials(texts, 0, 0);
    }
  }, [session, askConfirm, onMergePartials]);

  const handleStop = useCallback(async () => {
    // PWA/浏览器：停止麦克风采集 + 收尾（audio 模式以转写文本为笔记素材）
    if (!window.electronAPI) {
      try {
        clearSessionHotwords();
        webCaptureAdapter.stop();
        soundPlayer.play('capture_stop');
        setStatus('idle');
        await finalizeSmartSession();
      } catch (err) {
        setStatus('error');
        console.error('[useClassroomCapture] Web stop failed:', err);
      }
      return;
    }
    try {
      // 最先清除重启回调，防止 watchdog 在停止过程中触发
      frameRestartRef.current = null;
      // P1-3：清空会话词表运行时，防止陈旧词条作用于残余转写回调
      clearSessionHotwords();

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
          // 应用内确认（P0-5 替代 window.confirm）：停止收尾已全部完成，
          // await 仅推迟"是否进入视频分析"的用户决策，分支行为不变；
          // timeout: 0 —— 不设超时，避免 60s 未操作丢失视频分析入口
          const confirmed = await askConfirm({
            title: '全程录制已完成',
            description: '是否生成课堂笔记？',
            confirmLabel: '生成笔记',
          }, { timeout: 0 });
          if (confirmed) onAnalyzeVideo(stopResult.filePath);
        }
        return;
      }

      await window.electronAPI.invoke('screen_capture_stop');
      await window.electronAPI.invoke('audio_capture_stop');
      // 停止真流式 ASR（若激活）；未激活时调用也无副作用
      try {
        await window.electronAPI.invoke('local_asr_stream_stop');
      } catch { /* 静默 */ }
      setStreamingAsrActive(false);
      await audioCleanupRef.current?.();
      audioCleanupRef.current = null;
      await captureManager.stopSession();
      soundPlayer.play('capture_stop');
      setStatus('idle');

      if (capturePath === 'smart') {
        await finalizeSmartSession();
      } else if (capturePath === 'fine') {
        // fine 路径停止后同样提供“生成笔记”收尾（此前无任何入口）
        await finalizeFineSession();
      }
    } catch (err) {
      setStatus('error');
      console.error('[useClassroomCapture] Stop failed:', err);
    }
  }, [capturePath, captureManager, setStatus, frameRestartRef, audioCleanupRef, session, onAnalyzeVideo, askConfirm, finalizeSmartSession, finalizeFineSession, setStreamingAsrActive]);

  return { handleStart, handlePause, handleStop };
}
