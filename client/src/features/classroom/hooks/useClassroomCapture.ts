/**
 * useClassroomCapture — 课堂助手核心采集编排 hook
 * 供全页 ClassroomPage 和侧边栏共用
 *
 * @ai-context: 2026-07 拆分后的组合层。事件订阅见 useClassroomEvents，
 * 音频管道与健康监控见 useClassroomAudio，窗口监听见 useWindowWatcher，
 * 启停控制见 useSessionControl，分析见 useClassroomAnalysis，笔记持久化见
 * useClassroomNotes，ASR 转写与限流见 utils/asrTranscriber。
 * @ai-context: 三条采集路径——fine 逐帧 OCR / smart AI 关键帧+流式 ASR /
 * full_record 全程录像后离线分析。
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';
import { CaptureManager } from '@/lib/capture';
import type { AudioSourceKind } from '@/lib/capture/audioSourceStrategy';
import type {
  CaptureMode,
  CaptureSidebarConfig,
  SessionStatus,
  CapturePath,
  CourseMeta,
} from '@/lib/capture';
import { useClassroomEvents } from './useClassroomEvents';
import { useClassroomAudio } from './useClassroomAudio';
import { useAudioRecovery } from './useAudioRecovery';
import { useWindowWatcher } from './useWindowWatcher';
import { useSessionControl } from './useSessionControl';
import { useClassroomAnalysis } from './useClassroomAnalysis';
import { useClassroomNotes } from './useClassroomNotes';
import { useConfirm } from './useConfirm';
import { useGatewayHealth } from './useGatewayHealth';
import { isLocalAsrReady } from '../utils/asrTranscriber';
import { loadLaunchPref, saveLaunchPref } from '../utils/classroomPreference';

export function useClassroomCapture() {
  const { toast } = useToast();

  // 应用内确认对话框（P0-5：替代 window.confirm，Promise 化）
  const confirm = useConfirm();
  const { askConfirm } = confirm;

  // 网关健康状态机（P0-4 软阻断：进入页面预检，down 时 15s 自动复检）
  const gatewayHealth = useGatewayHealth();

  // ── 会话状态 ──
  const [status, setStatus] = useState<SessionStatus>('idle');
  // P0-3 启动偏好记忆：惰性初始化恢复上次的录制模式与采集路径，
  // 存储缺失/损坏时 loadLaunchPref 内部静默回落默认（mixed / smart）
  const [mode, setMode] = useState<CaptureMode>(() => loadLaunchPref().mode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 默认智能路径：AI 关键帧 + 流式 ASR，资源占用低，适用面最广
  const [capturePath, setCapturePath] = useState<CapturePath>(() => loadLaunchPref().capturePath);
  const [config, setConfig] = useState<CaptureSidebarConfig>({
    screenshotInterval: 5000,
    language: 'zh',
    autoInsert: false,
    mode: loadLaunchPref().mode,
  });

  // P0-3 写回：路径/模式变更即持久化（初次挂载写回恢复值无害，保持简单）
  useEffect(() => {
    saveLaunchPref({ capturePath, mode });
  }, [capturePath, mode]);

  // ── 课程上下文 ──
  const [courseMeta, setCourseMeta] = useState<CourseMeta>({});
  const [aiDetectEnabled, setAiDetectEnabled] = useState(false);

  // ── 课中重点标记 ──
  const [bookmarks, setBookmarks] = useState<{ timestamp: number; label?: string }[]>([]);

  // M2: 录制中自动锚点（每 15 分钟触发；label 取当时最近的实时转写）
  const [autoAnchors, setAutoAnchors] = useState<{ timestamp: number; label?: string }[]>([]);

  // 本次会话实际生效的音频源（ADR-001）：由主进程选源后回传，
  // 用于诊断文案分支与 UI 展示，避免对进程环回给出“检查输出设备”类误导提示
  const [audioSourceKind, setAudioSourceKind] = useState<AudioSourceKind | null>(null);

  // 真流式 ASR 激活标志：smart 路径 + 本地 Paraformer 流式模型就绪时由
  // useSessionControl 启动置 true；激活时转录走流式 partial/final，跳过按段转写
  const [streamingAsrActive, setStreamingAsrActive] = useState(false);

  const notify = useCallback((type: 'success' | 'warning' | 'error' | 'info', message: string) => {
    toast({ type, message });
  }, [toast]);

  // 帧超时保底重启回调（供 CaptureManager watchdog 调用）
  const frameRestartRef = useRef<(() => void) | null>(null);

  const windowWatcher = useWindowWatcher({ courseMeta, setCourseMeta, onNotify: notify });
  const { selectedWindow } = windowWatcher;

  useEffect(() => {
    // 仅音频模式无截图采集，清空重启回调防止帧 watchdog 误重启截图
    if (!window.electronAPI || !selectedWindow || mode === 'audio') {
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
  }, [selectedWindow, config.screenshotInterval, status, mode]);

  // CaptureManager 单例
  const captureManager = useMemo(
    () => new CaptureManager({
      onFrameWatchdogTimeout: () => frameRestartRef.current?.(),
      // CL-M10: 连续重启耗尽时提示用户手动处理，避免无限自动重启
      onFrameWatchdogExhausted: () => {
        notify('error', '画面采集异常，已停止自动恢复，请重新选择窗口或重启采集');
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify 为稳定引用
    [],
  );

  // 卸载时停止会话
  useEffect(() => {
    return () => {
      captureManager.stopSession().catch(() => {});
    };
  }, [captureManager]);

  // P8 视觉提取模式（auto/text/formula/diagram/code/full）：同步到 CaptureManager，
  // 写入截图消息 metadata 供 VisionWorker 消费（VisionWorker 已支持，此前缺 UI 入口）
  const [visionMode, setVisionMode] = useState<'auto' | 'text' | 'formula' | 'diagram' | 'code' | 'full'>('auto');
  useEffect(() => {
    captureManager.setVisionMode(visionMode);
  }, [captureManager, visionMode]);

  const events = useClassroomEvents({
    captureManager, status, capturePath,
    language: config.language, aiDetectEnabled, setCourseMeta,
    onNotify: notify,
    streamingAsrActive,
  });

  // 转写/提取段最新值 ref 桥：停止收尾（useSessionControl）在事件回调
  // 之外读取实时数据，必须绕过闭包读到最新值
  const liveTranscriptsRef = useRef(events.liveTranscripts);
  liveTranscriptsRef.current = events.liveTranscripts;
  const segmentsRef = useRef(events.segments);
  segmentsRef.current = events.segments;

  const { audioHealth, audioCleanupRef, setAutoAnchorCallback } = useClassroomAudio({
    captureManager, status, mode, onNotify: notify,
  });

  // M2: 自动锚点回调——记录锚点（label 取最新实时转写片段）并通知用户
  const handleAutoAnchor = useCallback(() => {
    const latest = events.liveTranscripts[events.liveTranscripts.length - 1];
    const label = latest?.text ? latest.text.slice(0, 60) : undefined;
    setAutoAnchors((prev) => [...prev, { timestamp: Date.now(), label }]);
    notify('info', '已自动标记锚点（连续录制满 15 分钟）');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- events 引用稳定
  }, [events.liveTranscripts, notify]);

  // 把自动锚点回调注册给 audio hook（触发时记录到 UI 状态）
  useEffect(() => {
    setAutoAnchorCallback(handleAutoAnchor);
    return () => setAutoAnchorCallback(null);
  }, [setAutoAnchorCallback, handleAutoAnchor]);

  // 音频自动恢复：静音诊断（文案按生效源分支）/ 设备变更重启
  useAudioRecovery({
    status, mode, audioSourceId: selectedWindow?.id, sourceKind: audioSourceKind, onNotify: notify,
  });

  const analysis = useClassroomAnalysis({
    language: config.language,
    smartBundle: events.smartBundle,
    setSmartBundle: events.setSmartBundle,
    videoFilePath: events.videoFilePath,
    recordingStatus: events.recordingStatus,
    captureSessionIdRef: events.captureSessionIdRef,
    // 直通 toast：降级警告可附带 action 按钮（如「重新合并」，见 Toast.tsx）
    onWarn: (message, action) => toast({ type: 'warning', message, action }),
  });

  const notes = useClassroomNotes(courseMeta, events.smartBundle);

  /** 开始采集前重置本轮会话数据 */
  const resetForStart = useCallback(() => {
    events.setStats({ frames: 0, extracted: 0 });
    events.setSegments([]);
    events.setLiveTranscripts([]);
    setSelectedIds(new Set());
    setAutoAnchors([]);
    // P0-6 内存护栏：上一轮会话的 smartBundle（关键帧/音频段/时间线，含
    // 未释放的 base64）与增量分析缓冲必须清空，否则长会话切换无界累积；
    // pendingKeyframesRef 等 ref 由 finalizeSmartSession 同步收割，此处双保险
    events.setSmartBundle({});
    events.pendingKeyframesRef.current = [];
    events.partialNotesRef.current = [];
    events.isPartialAnalyzingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- events setter 引用稳定
  }, []);

  const { handleStart, handlePause, handleStop } = useSessionControl({
    captureManager, selectedWindow, status, setStatus, mode, capturePath, config, courseMeta,
    frameRestartRef, audioCleanupRef,
    session: {
      smartBundle: events.smartBundle,
      resetForStart,
      setRecordingStatus: events.setRecordingStatus,
      setVideoFilePath: events.setVideoFilePath,
      partialNotesRef: events.partialNotesRef,
      pendingKeyframesRef: events.pendingKeyframesRef,
      isPartialAnalyzingRef: events.isPartialAnalyzingRef,
      setPartialCount: events.setPartialCount,
      liveTranscriptsRef,
      segmentsRef,
    },
    onAnalyzeVideo: analysis.handleVideoAnalyze,
    onAnalyzeFull: analysis.handleAnalyze,
    onMergePartials: analysis.mergePartialNotes,
    onNotify: (type, message) => notify(type, message),
    askConfirm,
    onAudioSourceResolved: setAudioSourceKind,
    setStreamingAsrActive,
  });

  /** P0-4 软阻断启动入口：checking 禁用；down 时确认后 localOnly 启动 */
  const requestStart = useCallback(async () => {
    if (!selectedWindow || gatewayHealth.status === 'checking') return;
    if (gatewayHealth.status === 'down' && !isLocalAsrReady()) {
      const ok = await askConfirm({
        title: 'AI 网关不可用',
        description: '仅本地采集继续？（课后分析需联网）',
        confirmLabel: '本地继续',
      });
      if (!ok) return;
      await handleStart({ localOnly: true });
      return;
    }
    await handleStart();
  }, [selectedWindow, gatewayHealth.status, askConfirm, handleStart]);

  const handleModeChange = useCallback((newMode: CaptureMode) => {
    setMode(newMode);
    setConfig((prev) => ({ ...prev, mode: newMode }));
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleConfigChange = useCallback((patch: Partial<CaptureSidebarConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── 笔记→闪卡一键生成（P2-3：支持全量/仅重点模式） ──
  const handleGenerateCards = useCallback(async (content: string, mode?: 'full' | 'bookmarks') => {
    if (!window.electronAPI) return;
    try {
      let cardContent = content;
      if (mode === 'bookmarks') {
        const bookmarkTimestamps = (events.smartBundle?.timeline ?? [])
          .filter((e) => e.type === 'bookmark')
          .map((e) => e.timestamp);
        if (bookmarkTimestamps.length > 0) {
          const bookmarkTexts = bookmarkTimestamps.map((ts) => {
            const withText = events.liveTranscripts.filter((t) => t.text);
            if (withText.length === 0) return '';
            const closest = withText.reduce((best, cur) =>
              Math.abs(cur.timestamp - ts) < Math.abs(best.timestamp - ts) ? cur : best,
            );
            return closest?.text ? `- ${closest.text}` : '';
          }).filter(Boolean);
          if (bookmarkTexts.length > 0) {
            cardContent = `# 课堂重点标记\n\n${bookmarkTexts.join('\n')}`;
          }
        }
        notify('info', `正在从 ${bookmarkTimestamps.length} 个重点标记生成闪卡...`);
      } else {
        notify('info', '正在从笔记生成闪卡...');
      }
      await window.electronAPI.invoke('ai_generate_cards', { content: cardContent });
      notify('success', '闪卡已生成，可在闪卡模块查看');
    } catch (err) {
      console.error('[useClassroomCapture] 生成闪卡失败:', err);
      notify('error', '闪卡生成失败，请重试');
    }
  }, [notify, events.smartBundle, events.liveTranscripts]);

  // ── 课中重点标记 ──
  // M2: 统一走 captureManager.pushBookmark（smart 路径广播 smart:bookmark，
  // useClassroomEvents 订阅写入 smartBundle.timeline，单一数据流）
  // events.setSmartBundle 为稳定 setState 引用，解构后显式入依赖（oxlint exhaustive-deps）
  const { setSmartBundle } = events;
  const handleBookmark = useCallback(() => {
    if (status !== 'capturing') return;
    const now = Date.now();
    setBookmarks((prev) => [...prev, { timestamp: now }]);
    // M7: smart 路径由 smart:bookmark 广播写入 timeline；非 smart 路径（fine/
    // full_record）广播不存在，本地状态之外兜底直接写 timeline，保留原有持久化
    if (!captureManager.pushBookmark('bookmark')) {
      setSmartBundle((prev) => ({
        ...prev,
        timeline: [...(prev.timeline ?? []), { timestamp: now, type: 'bookmark' }],
      }));
    }
    notify('success', `已标记重点 (${new Date(now).toLocaleTimeString()})`);
  }, [status, notify, captureManager, setSmartBundle]);

  return {
    // 窗口
    ...windowWatcher,
    // 会话
    status, mode, selectedIds, config,
    segments: events.segments, stats: events.stats, extractionError: events.extractionError,
    setExtractionError: events.setExtractionError,
    // 路径
    capturePath, setCapturePath, smartBundle: events.smartBundle,
    // P8 视觉提取模式
    visionMode, setVisionMode,
    // 分析
    isAnalyzing: analysis.isAnalyzing,
    analysisResult: analysis.analysisResult,
    analysisError: analysis.analysisError,
    partialCount: events.partialCount,
    transcribedCount: events.transcribedCount,
    // 实时转录
    liveTranscripts: events.liveTranscripts,
    handleEditTranscript: events.handleEditTranscript,
    // 真流式进行中的 partial 文本 + 激活标志
    partialText: events.partialText,
    streamingAsrActive,
    // 音频健康 + VAD
    audioHealth, vadStats: events.vadStats,
    // 本次会话生效的音频源（UI 可见，供内测归因）
    audioSourceKind,
    // 课程上下文
    courseMeta, setCourseMeta, aiDetectEnabled, setAiDetectEnabled,
    // 录制
    recordingStatus: events.recordingStatus, videoFilePath: events.videoFilePath,
    // 操作
    handleStart, handlePause, handleStop, handleModeChange,
    handleToggleSelect, handleConfigChange,
    handleAnalyze: analysis.handleAnalyze,
    handleVideoAnalyze: analysis.handleVideoAnalyze,
    handleRetryMerge: analysis.handleRetryMerge,
    handleDismissAnalysis: analysis.handleDismissAnalysis,
    handleGenerateCards, handleBookmark, bookmarks,
    // M2 自动锚点（时间线展示）
    autoAnchors,
    // 笔记持久化
    ...notes,
    // 确认对话框（P0-5：供 ClassroomPage 挂载 ConfirmDialog）
    confirmRequest: confirm.request,
    handleConfirm: confirm.handleConfirm,
    handleCancel: confirm.handleCancel,
    // 网关健康（P0-4 软阻断：checking 禁用启动按钮，down 走确认流程）
    gatewayStatus: gatewayHealth.status,
    requestStart,
    // 派生
    canStart: !!selectedWindow && gatewayHealth.status !== 'checking',
  };
}
