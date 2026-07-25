import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Monitor, Play, Pause, Square, Eye, Mic, Layers,
  Settings2, ChevronRight, ChevronDown, Plus, ListPlus,
  Clock, CheckCircle2, XCircle, Loader2, PanelRightOpen, PanelRightClose,
  Crosshair, Sparkles, Video, Info, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useToast } from '@/components/ui/Toast';
import { requireGatewayUrl } from '@/lib/ai/config';
import {
  CaptureManager,
  captureEventBus,
} from '@/lib/capture';
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
import { SmartCapturePanel } from './SmartCapturePanel';
import { AnalysisPreview } from './AnalysisPreview';
import { VideoRecordPanel } from './VideoRecordPanel';
import { analyzeSession, analyzeVideo } from '@/lib/ai/sessionAnalyzer';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';

// ================================================================
// 子组件接口
// ================================================================

interface WindowSelectorProps {
  windows: WindowInfo[];
  selected: WindowInfo | null;
  onSelect: (win: WindowInfo) => void;
  onRefresh: () => void;
  loading: boolean;
}

interface ControlBarProps {
  status: SessionStatus;
  mode: CaptureMode;
  stats: { frames: number; extracted: number };
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onModeChange: (mode: CaptureMode) => void;
  disabled: boolean;
}

interface SegmentListProps {
  segments: ExtractedSegment[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onInsertSelected: () => void;
  onInsertAll: () => void;
}

interface SettingsPanelProps {
  config: CaptureSidebarConfig;
  onChange: (patch: Partial<CaptureSidebarConfig>) => void;
}

// ================================================================
// 窗口选择器
// ================================================================

function WindowSelector({ windows, selected, onSelect, onRefresh, loading }: WindowSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex items-center justify-between w-full px-3 py-2.5 text-b2',
          'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50',
          'transition-colors duration-kb-fast',
        )}
      >
        <div className="flex items-center gap-2">
          <Monitor className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          <span className="font-medium">
            {selected ? selected.title : '选择目标窗口'}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          <button
            onClick={onRefresh}
            disabled={loading}
            className={cn(
              'w-full text-b3 text-brand-600 hover:text-brand-700 py-1 text-left',
              loading && 'opacity-60 cursor-not-allowed',
            )}
          >
            {loading ? '加载中...' : '↻ 刷新窗口列表'}
          </button>

          {windows.length === 0 && !loading && (
            <p className="text-b3 text-text-tertiary py-2 text-center">
              未检测到可捕获窗口
            </p>
          )}

          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {windows.map((win) => (
              <button
                key={win.id}
                onClick={() => { onSelect(win); setExpanded(false); }}
                className={cn(
                  'flex items-start gap-2 p-kb-sm rounded-kb-sm text-left transition-colors',
                  selected?.id === win.id
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                    : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary',
                )}
              >
                {win.thumbnail && (
                  <img
                    src={win.thumbnail}
                    alt=""
                    className="w-16 h-9 rounded-kb-xs object-cover flex-shrink-0 border border-border/30"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-b3 leading-tight line-clamp-2 block">{win.title}</span>
                  {win.matched && (
                    <span className="text-[10px] text-brand-500 leading-tight">匹配：{win.matched}</span>
                  )}
                </div>
                {(win.score ?? 0) >= 100 && (
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// 采集控制栏
// ================================================================

const MODE_OPTIONS: { value: CaptureMode; label: string; icon: typeof Eye }[] = [
  { value: 'vision', label: '视觉', icon: Eye },
  { value: 'audio', label: '音频', icon: Mic },
  { value: 'mixed', label: '混合', icon: Layers },
];

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; icon: typeof Play }> = {
  idle: { label: '空闲', color: 'text-text-tertiary', icon: Clock },
  capturing: { label: '采集中', color: 'text-semantic-error', icon: Loader2 },
  processing: { label: '处理中', color: 'text-brand-600', icon: Loader2 },
  paused: { label: '已暂停', color: 'text-semantic-warning', icon: Pause },
  error: { label: '错误', color: 'text-semantic-error', icon: XCircle },
};

function ControlBar({
  status, mode, stats, onStart, onPause, onStop, onModeChange, disabled,
}: ControlBarProps) {
  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="border-b border-border/30 px-3 py-3 space-y-3">
      {/* 状态指示 */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-b3 font-medium', statusCfg.color)}>
          <StatusIcon
            className={cn('w-3.5 h-3.5', status === 'capturing' && 'animate-spin')}
            strokeWidth={1.5}
          />
          {statusCfg.label}
        </div>
        <div className="flex items-center gap-3 text-b3 text-text-tertiary">
          <span title="已截取帧数">帧 {stats.frames}</span>
          <span title="已提取片段数">段 {stats.extracted}</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-2">
        {status !== 'capturing' ? (
          <button
            onClick={onStart}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20',
              'active:scale-95 transition-all duration-kb-fast',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
            开始
          </button>
        ) : (
          <button
            onClick={onPause}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-semantic-warning/10 text-semantic-warning hover:bg-semantic-warning/20',
              'active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
            暂停
          </button>
        )}

        {status !== 'idle' && status !== 'error' && (
          <button
            onClick={onStop}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-bg-secondary text-text-secondary border border-border/50',
              'hover:bg-bg-tertiary hover:text-text-primary',
              'active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <Square className="w-3.5 h-3.5" strokeWidth={1.5} />
            停止
          </button>
        )}
      </div>

      {/* 模式切换 */}
      <div className="flex items-center gap-1">
        {MODE_OPTIONS.map(({ value, label, icon: ModeIcon }) => (
          <button
            key={value}
            onClick={() => onModeChange(value)}
            disabled={status === 'capturing' || status === 'processing'}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-kb-sm text-b3 font-medium',
              'transition-all duration-kb-fast',
              mode === value
                ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50',
              (status === 'capturing' || status === 'processing') && 'opacity-50 cursor-not-allowed',
            )}
          >
            <ModeIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// 实时提取结果展示区
// ================================================================

function SegmentList({
  segments, selectedIds, onToggleSelect, onInsertSelected, onInsertAll,
}: SegmentListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新片段到达时自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments.length]);

  const hasSelected = selectedIds.size > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 操作栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <span className="text-b3 font-medium text-text-tertiary">
          提取结果 ({segments.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onInsertSelected}
            disabled={!hasSelected}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-b3 font-medium',
              'transition-all duration-kb-fast',
              hasSelected
                ? 'bg-brand-50 text-brand-600 hover:bg-brand-100'
                : 'text-text-tertiary cursor-not-allowed',
            )}
          >
            <Plus className="w-3 h-3" strokeWidth={2} />
            插入选中
          </button>
          <button
            onClick={onInsertAll}
            disabled={segments.length === 0}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-b3 font-medium',
              'transition-all duration-kb-fast',
              segments.length > 0
                ? 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                : 'text-text-tertiary cursor-not-allowed',
            )}
          >
            <ListPlus className="w-3 h-3" strokeWidth={2} />
            全部插入
          </button>
        </div>
      </div>

      {/* 片段列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {segments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <Eye className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
            <p className="text-b3">采集开始后提取结果将在此显示</p>
          </div>
        )}

        {segments.map((seg) => {
          const isSelected = selectedIds.has(seg.id);
          const sourceLabel = seg.source === 'vision' ? '视觉' : seg.source === 'audio' ? '音频' : 'UI';
          const sourceColor = seg.source === 'vision'
            ? 'bg-accent-500/10 text-accent-600'
            : seg.source === 'audio'
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-amber-500/10 text-amber-600';

          return (
            <div
              key={seg.id}
              onClick={() => onToggleSelect(seg.id)}
              className={cn(
                'group p-2.5 rounded-kb-sm cursor-pointer transition-all duration-kb-fast',
                'border border-transparent',
                isSelected
                  ? 'bg-brand-50/50 border-brand-200/50'
                  : 'hover:bg-bg-tertiary/50',
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn('px-1.5 py-0.5 rounded-kb-xs text-[10px] font-medium', sourceColor)}>
                  {sourceLabel}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {new Date(seg.timestamp).toLocaleTimeString()}
                </span>
                {isSelected && (
                  <CheckCircle2 className="ml-auto w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
                )}
              </div>
              <p className="text-b3 text-text-secondary leading-relaxed line-clamp-3">
                {seg.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
// 设置区
// ================================================================

const LANGUAGE_OPTIONS: { value: CaptureSidebarConfig['language']; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'mixed', label: '混合' },
];

function SettingsPanel({ config, onChange }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2.5 text-b2',
          'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50',
          'transition-colors duration-kb-fast',
        )}
      >
        <Settings2 className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        <span className="font-medium flex-1 text-left">设置</span>
        {open ? (
          <ChevronDown className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* 截图间隔 */}
          <div>
            <label className="text-b3 text-text-tertiary mb-1 block">截图间隔 (秒)</label>
            <input
              type="range"
              min={1}
              max={30}
              value={config.screenshotInterval / 1000}
              onChange={(e) => onChange({ screenshotInterval: Number(e.target.value) * 1000 })}
              className="w-full accent-brand-600"
            />
            <span className="text-b3 text-text-secondary">{config.screenshotInterval / 1000}s</span>
          </div>

          {/* 语言选择 */}
          <div>
            <label className="text-b3 text-text-tertiary mb-1 block">识别语言</label>
            <div className="flex gap-1">
              {LANGUAGE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onChange({ language: value })}
                  className={cn(
                    'flex-1 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
                    config.language === value
                      ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                      : 'text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 自动插入开关 */}
          <div className="flex items-center justify-between">
            <span className="text-b3 text-text-secondary">自动插入笔记</span>
            <button
              onClick={() => onChange({ autoInsert: !config.autoInsert })}
              className={cn(
                'relative w-9 h-5 rounded-kb-full transition-colors duration-kb-fast',
                config.autoInsert ? 'bg-brand-600' : 'bg-bg-tertiary',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-kb-full bg-white shadow-sm',
                  'transition-transform duration-kb-fast',
                  config.autoInsert && 'translate-x-4',
                )}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// IPC 响应类型（主进程返回值，避免 inline type assertion）
// ================================================================

interface IPCAudioStartResult {
  success: boolean;
  error?: string;
}

interface IPCStopResult {
  success: boolean;
}

// ================================================================
// CaptureSidebar 主组件
// ================================================================

export interface CaptureSidebarProps {
  /** 将提取的文本插入到笔记编辑器 */
  onInsertText?: (text: string) => void;
}

export function CaptureSidebar({ onInsertText }: CaptureSidebarProps) {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
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

  // @ai-context Path B 智能模式状态：路径选择、数据汇总、分析结果
  const [capturePath, setCapturePath] = useState<CapturePath>('fine');
  const [smartBundle, setSmartBundle] = useState<Partial<SessionBundle>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // @ai-context Path C 全程录制状态：录制实时状态 + 产出视频文件路径
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);

  // 渲染端音频资源引用（getUserMedia stream + AudioContext）
  const audioCleanupRef = useRef<(() => void | Promise<void>) | null>(null);

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

  // 组件卸载时停止采集会话
  // 注意：不能调用 captureManager.dispose()，因为 React StrictMode 开发模式下
  // effect cleanup 会先执行（清空 workers），但 useMemo 不会重建实例，
  // 导致 remount 后 pipeline 无 Worker 可用。仅停止会话即可。
  useEffect(() => {
    return () => {
      captureManager.stopSession().catch(() => {});
    };
  }, [captureManager]);

  // ----------------------------------------------------------------
  // 监听 captureEventBus 提取结果事件，更新 UI 片段列表
  // ----------------------------------------------------------------
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

    const offError = captureEventBus.on<{
      message: string;
    }>('extraction:error', (data) => {
      setExtractionError(data.message);
    });

    return () => {
      offCompleted();
      offError();
    };
  }, []);

  // ----------------------------------------------------------------
  // @ai-context Path B：监听智能模式关键帧和 bundle 就绪事件
  // ----------------------------------------------------------------
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

  // ----------------------------------------------------------------
  // @ai-context Path C：监听录制视频就绪事件 + 轮询录制状态
  // ----------------------------------------------------------------
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

  // ----------------------------------------------------------------
  // 监听截图帧（主进程 → 渲染进程）
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;

    const off = window.electronAPI.on('screen_capture_frame', (...args: unknown[]) => {
      const frameData = args[0] as ScreenshotData;
      captureManager.pushFrame(frameData);
      setStats((prev) => ({ ...prev, frames: prev.frames + 1 }));
    });
    return off;
  }, [status, captureManager]);

  // ----------------------------------------------------------------
  // 监听音频块（主进程 → 渲染进程）
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;

    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as AudioChunkData;
      captureManager.pushAudioChunk(chunk);
    });
    return off;
  }, [status, captureManager]);

  // ----------------------------------------------------------------
  // 监听音频采集生命周期指令（主进程 → 渲染进程）
  // audio_capture_do_start: 启动 getUserMedia + Web Audio 切片
  // audio_capture_do_stop:  停止渲染端音频管道
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!window.electronAPI) return;

    const offStart = window.electronAPI.on(
      'audio_capture_do_start',
      (...args: unknown[]) => {
        // 如果渲染端已主动启动了音频管道，忽略重复指令
        if (audioCleanupRef.current) return;

        const payload = args[0] as {
          sourceId: string;
          options: { sampleRate: number; channels: number; chunkDurationMs: number };
        };

        (async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                // Electron 扩展约束：从 desktopCapturer source 捕获系统音频
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: payload.sourceId,
              } as MediaTrackConstraintSet,
            });

            const audioCtx = new AudioContext({ sampleRate: payload.options.sampleRate });
            const sourceNode = audioCtx.createMediaStreamSource(stream);
            const bufferSize = Math.ceil(
              (payload.options.sampleRate * payload.options.chunkDurationMs) / 1000,
            );
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
            // eslint-disable-next-line no-console -- 音频管道启动失败
            console.error('[CaptureSidebar] Renderer audio pipeline start failed:', err);
          }
        })();
      },
    );

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

  // ----------------------------------------------------------------
  // 获取窗口列表
  // ----------------------------------------------------------------
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

  // ----------------------------------------------------------------
  // 开始采集
  // ----------------------------------------------------------------
  const handleStart = useCallback(async () => {
    if (!selectedWindow || !window.electronAPI) return;

    try {
      setStatus('capturing');
      setStats({ frames: 0, extracted: 0 });
      setSegments([]);
      setSelectedIds(new Set());

      // 预检网关连通性
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
  }, [selectedWindow, config, mode, capturePath, captureManager]);

  // ----------------------------------------------------------------
  // 暂停采集（停止推送帧到流水线，主进程继续截图）
  // ----------------------------------------------------------------
  const handlePause = useCallback(() => {
    if (status === 'capturing') {
      setStatus('paused');
      captureManager.pauseSession();
    } else if (status === 'paused') {
      setStatus('capturing');
      captureManager.resumeSession();
    }
  }, [status, captureManager]);

  // ----------------------------------------------------------------
  // 停止采集
  // ----------------------------------------------------------------
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
            handleVideoAnalyze(stopResult.filePath);
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
          handleAnalyze();
        }
      }
    } catch (err) {
      setStatus('error');
      // eslint-disable-next-line no-console -- 采集停止失败
      console.error('[CaptureSidebar] Stop capture failed:', err);
    }
  }, [captureManager, capturePath, smartBundle]);

  // ----------------------------------------------------------------
  // 模式切换
  // ----------------------------------------------------------------
  const handleModeChange = useCallback((newMode: CaptureMode) => {
    setMode(newMode);
    setConfig((prev) => ({ ...prev, mode: newMode }));
  }, []);

  // ----------------------------------------------------------------
  // 片段选择
  // ----------------------------------------------------------------
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ----------------------------------------------------------------
  // 插入片段到笔记
  // ----------------------------------------------------------------
  const handleInsertSelected = useCallback(() => {
    const texts = segments
      .filter((s) => selectedIds.has(s.id))
      .map((s) => s.text)
      .join('\n\n');
    if (texts && onInsertText) {
      onInsertText(texts);
    }
    setSelectedIds(new Set());
  }, [segments, selectedIds, onInsertText]);

  const handleInsertAll = useCallback(() => {
    const texts = segments.map((s) => s.text).join('\n\n');
    if (texts && onInsertText) {
      onInsertText(texts);
    }
    setSelectedIds(new Set());
    setSegments([]);
  }, [segments, onInsertText]);

  // ----------------------------------------------------------------
  // 配置变更
  // ----------------------------------------------------------------
  const handleConfigChange = useCallback((patch: Partial<CaptureSidebarConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  // ----------------------------------------------------------------
  // @ai-context Path B：调用多模态分析接口，生成结构化课堂笔记
  // ----------------------------------------------------------------
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
      // 错误分类展示
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

  // ----------------------------------------------------------------
  // @ai-context Path C：调用视频多模态分析接口，生成结构化课堂笔记
  // ----------------------------------------------------------------
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
      // 错误分类展示
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

  const canStart = !!selectedWindow;

  return (
    <aside
      className={cn(
        'relative flex-shrink-0 h-full bg-bg-elevated border-l border-border/50',
        'transition-all duration-300 ease-kb-default',
        collapsed ? 'w-10' : 'w-80',
      )}
    >
      {/* 折叠/展开按钮 */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className={cn(
          'absolute -left-3 top-3 z-10',
          'w-6 h-6 rounded-kb-full bg-bg-elevated border border-border/50',
          'flex items-center justify-center',
          'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary',
          'transition-all duration-kb-fast shadow-kb-sm',
        )}
        title={collapsed ? '展开回声定位' : '收起回声定位'}
      >
        {collapsed ? (
          <PanelRightOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
        ) : (
          <PanelRightClose className="w-3.5 h-3.5" strokeWidth={1.5} />
        )}
      </button>

      {collapsed ? (
        // 折叠态：仅显示图标
        <div className="flex flex-col items-center gap-3 pt-12">
          <Monitor className="w-5 h-5 text-text-tertiary" strokeWidth={1.5} />
          {status === 'capturing' && (
            <span className="w-2 h-2 rounded-kb-full bg-semantic-error animate-pulse" />
          )}
        </div>
      ) : (
        // 展开态：完整 UI
        <div className="flex flex-col h-full">
          {/* 标题栏 */}
          <div className="flex items-center gap-2 px-3 py-3 border-b border-border/30">
            <Monitor className="w-icon-md h-icon-md text-brand-500" strokeWidth={1.5} />
            <span className="text-b2 font-semibold text-text-primary flex-1">回声定位</span>
            {status === 'capturing' && (
              <span className="w-2 h-2 rounded-kb-full bg-semantic-error animate-pulse" />
            )}
          </div>

          {/* 窗口选择器 */}
          <WindowSelector
            windows={windows}
            selected={selectedWindow}
            onSelect={setSelectedWindow}
            onRefresh={refreshWindows}
            loading={windowsLoading}
          />

          {/* @ai-context Path 路径选择器：精细 / 智能 / 录制（三模式） */}
          <div className="px-3 py-2 border-b border-border/20 space-y-1.5">
            <div className="flex items-center gap-1">
              {[
                { value: 'fine' as CapturePath, label: '精细', icon: Crosshair, brief: '逐帧截图' },
                { value: 'smart' as CapturePath, label: '智能', icon: Sparkles, brief: 'AI关键帧' },
                { value: 'full_record' as CapturePath, label: '录制', icon: Video, brief: '全程录像' },
              ].map(({ value, label, icon: PathIcon, brief }) => (
                <button
                  key={value}
                  onClick={() => setCapturePath(value)}
                  disabled={status === 'capturing' || status === 'processing'}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-kb-sm transition-all duration-kb-fast border',
                    capturePath === value
                      ? 'bg-brand-50 border-brand-200/50 text-brand-600'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50',
                    (status === 'capturing' || status === 'processing') && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <PathIcon className="w-4 h-4" strokeWidth={1.5} />
                  <span className="text-b3 font-medium leading-tight">{label}</span>
                  <span className={cn('text-[10px] leading-tight', capturePath === value ? 'text-brand-400' : 'text-text-tertiary/70')}>{brief}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-tertiary leading-relaxed px-0.5">
              {capturePath === 'fine' && '按固定间隔截屏，逐帧 OCR/AI 识别，适合板书密集场景'}
              {capturePath === 'smart' && 'AI 检测画面变化自动截图，同步录音智能分段，资源占用低'}
              {capturePath === 'full_record' && '录制完整课堂视频，课后 AI 生成结构化笔记'}
            </p>
          </div>

          {/* 采集控制栏 */}
          <ControlBar
            status={status}
            mode={mode}
            stats={stats}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
            onModeChange={handleModeChange}
            disabled={!canStart}
          />

          {/* 提取错误提示 */}
          {extractionError && (
            <div
              className={cn(
                'mx-3 my-2 p-3 rounded-kb-lg',
                'bg-semantic-error/5 backdrop-blur-xl border border-semantic-error/10',
                'shadow-kb-md',
              )}
            >
              <div className="flex items-start gap-2">
                <XCircle
                  className="w-4 h-4 mt-0.5 flex-shrink-0 text-semantic-error"
                  strokeWidth={1.5}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-b3 text-semantic-error font-medium leading-snug">
                    {extractionError}
                  </p>
                  <p className="text-b3 text-text-tertiary mt-1">
                    请在设置中检查AI网关配置
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 条件渲染内容区域：fine=逐帧结果 / smart=智能时间轴 / full_record=预留 */}
          {capturePath === 'fine' && (
            <SegmentList
              segments={segments}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onInsertSelected={handleInsertSelected}
              onInsertAll={handleInsertAll}
            />
          )}

          {capturePath === 'smart' && (
            <SmartCapturePanel
              bundle={smartBundle}
              isRecording={status === 'capturing'}
            />
          )}

          {capturePath === 'full_record' && (
            <VideoRecordPanel
              recordingStatus={recordingStatus}
              isRecording={status === 'capturing'}
            />
          )}

          {/* Path B 分析预览面板 */}
          {(isAnalyzing || analysisResult || analysisError) && (
            <AnalysisPreview
              result={analysisResult}
              isAnalyzing={isAnalyzing}
              error={analysisError}
              onInsert={(content) => {
                onInsertText?.(content);
                handleDismissAnalysis();
              }}
              onDismiss={handleDismissAnalysis}
              onRetry={handleAnalyze}
            />
          )}

          {/* 设置区 */}
          <SettingsPanel config={config} onChange={handleConfigChange} />
        </div>
      )}
    </aside>
  );
}

export default CaptureSidebar;
