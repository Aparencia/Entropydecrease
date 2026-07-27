/**
 * ClassroomPage — 课堂助手（回声定位）独立全页模块
 * 左侧窄栏：窗口选择 + 路径/模式 + 控制 + 设置
 * 右侧宽区：提取结果 / 智能时间轴 / 录制面板 / 分析预览
 */
import { useRef, useEffect, useCallback } from 'react';
import {
  Monitor, Play, Pause, Square, Eye, Mic, Layers,
  Settings2, ChevronDown, ChevronRight, Plus, ListPlus,
  Clock, CheckCircle2, XCircle, Loader2, Clapperboard,
  Crosshair, Sparkles, Video, Info, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClassroomCapture } from '../hooks/useClassroomCapture';
import { LiveTranscript } from '../components/LiveTranscript';
import { SmartCapturePanel } from '@/features/notes/components/SmartCapturePanel';
import { AnalysisPreview } from '@/features/notes/components/AnalysisPreview';
import { VideoRecordPanel } from '@/features/notes/components/VideoRecordPanel';
import type { WindowInfo, ExtractedSegment, CaptureMode, SessionStatus, CaptureSidebarConfig, CourseMeta } from '@/lib/capture';
import type { CapturePath } from '@/lib/capture';

// ================================================================
// 子组件
// ================================================================

const MODE_OPTIONS: { value: CaptureMode; label: string; icon: typeof Eye; desc: string }[] = [
  { value: 'vision', label: '视觉', icon: Eye, desc: '仅截取屏幕画面进行文字识别' },
  { value: 'audio', label: '音频', icon: Mic, desc: '仅录制声音进行语音转文字' },
  { value: 'mixed', label: '混合', icon: Layers, desc: '同时采集画面与声音，融合分析' },
];

/** 采集路径配置：图标 + 简短描述 + 详细说明 */
const PATH_OPTIONS: { value: CapturePath; label: string; icon: typeof Crosshair; brief: string; detail: string }[] = [
  {
    value: 'fine',
    label: '精细',
    icon: Crosshair,
    brief: '逐帧截图',
    detail: '按固定间隔截取屏幕画面，逐帧进行 OCR/AI 识别。适合板书密集、需要完整记录每一帧内容的场景。',
  },
  {
    value: 'smart',
    label: '智能',
    icon: Sparkles,
    brief: 'AI 关键帧',
    detail: 'AI 自动检测画面变化，仅在幻灯片切换、板书出现等关键时刻截图，同时录制语音并智能分段。资源占用低，适合长时间课堂。',
  },
  {
    value: 'full_record',
    label: '录制',
    icon: Video,
    brief: '全程录像',
    detail: '录制完整课堂视频（含音频），课后可通过 AI 生成结构化笔记。适合需要完整回放或课后深度分析的场景。',
  },
];

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; icon: typeof Play }> = {
  idle: { label: '空闲', color: 'text-text-tertiary', icon: Clock },
  capturing: { label: '采集中', color: 'text-semantic-error', icon: Loader2 },
  processing: { label: '处理中', color: 'text-brand-600', icon: Loader2 },
  paused: { label: '已暂停', color: 'text-semantic-warning', icon: Pause },
  error: { label: '错误', color: 'text-semantic-error', icon: XCircle },
};

const LANGUAGE_OPTIONS: { value: CaptureSidebarConfig['language']; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'mixed', label: '多语' },
];

function WindowSelector({ windows, selected, onSelect, onRefresh, loading }: {
  windows: WindowInfo[]; selected: WindowInfo | null;
  onSelect: (w: WindowInfo) => void; onRefresh: () => void; loading: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-b3 font-medium text-text-tertiary">目标窗口</span>
        <button onClick={onRefresh} disabled={loading}
          className="text-b3 text-brand-600 hover:text-brand-700 disabled:opacity-50">
          {loading ? '加载中...' : '↻ 刷新'}
        </button>
      </div>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {windows.length === 0 && !loading && (
          <p className="text-b3 text-text-tertiary py-2 text-center">未检测到可捕获窗口</p>
        )}
        {windows.map((win) => (
          <button key={win.id} onClick={() => onSelect(win)}
            className={cn(
              'flex items-center gap-2 p-2 rounded-kb-sm text-left transition-colors',
              selected?.id === win.id
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary',
            )}>
            {win.thumbnail && (
              <img src={win.thumbnail} alt="" className="w-14 h-8 rounded-kb-xs object-cover border border-border/30" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-b3 leading-tight line-clamp-1 block">{win.title}</span>
              {win.matched && (
                <span className="text-[10px] text-brand-500 leading-tight">匹配：{win.matched}</span>
              )}
            </div>
            {(win.score ?? 0) >= 100 && (
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" strokeWidth={1.5} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function SegmentList({ segments, selectedIds, onToggleSelect, onInsertSelected, onInsertAll }: {
  segments: ExtractedSegment[]; selectedIds: Set<string>;
  onToggleSelect: (id: string) => void; onInsertSelected: () => void; onInsertAll: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [segments.length]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <span className="text-b2 font-medium text-text-secondary">提取结果 ({segments.length})</span>
        <div className="flex items-center gap-2">
          <button onClick={onInsertSelected} disabled={selectedIds.size === 0}
            className={cn('inline-flex items-center gap-1 px-2.5 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
              selectedIds.size > 0 ? 'bg-brand-50 text-brand-600 hover:bg-brand-100' : 'text-text-tertiary cursor-not-allowed')}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2} /> 插入选中
          </button>
          <button onClick={onInsertAll} disabled={segments.length === 0}
            className={cn('inline-flex items-center gap-1 px-2.5 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
              segments.length > 0 ? 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary' : 'text-text-tertiary cursor-not-allowed')}>
            <ListPlus className="w-3.5 h-3.5" strokeWidth={2} /> 全部插入
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {segments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
            <Eye className="w-12 h-12 mb-3 opacity-20" strokeWidth={1} />
            <p className="text-b2">采集开始后提取结果将在此显示</p>
            <p className="text-b3 mt-1 opacity-60">选择目标窗口并点击"开始"</p>
          </div>
        )}
        {segments.map((seg) => {
          const isSelected = selectedIds.has(seg.id);
          const sourceLabel = seg.source === 'vision' ? '视觉' : seg.source === 'audio' ? '音频' : 'UI';
          const sourceColor = seg.source === 'vision'
            ? 'bg-accent-500/10 text-accent-600'
            : seg.source === 'audio' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600';
          return (
            <div key={seg.id} onClick={() => onToggleSelect(seg.id)}
              className={cn('group p-3 rounded-kb-md cursor-pointer transition-all border border-transparent',
                isSelected ? 'bg-brand-50/50 border-brand-200/50' : 'hover:bg-bg-tertiary/50')}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn('px-1.5 py-0.5 rounded-kb-xs text-[10px] font-medium', sourceColor)}>{sourceLabel}</span>
                <span className="text-[10px] text-text-tertiary">{new Date(seg.timestamp).toLocaleTimeString()}</span>
                {isSelected && <CheckCircle2 className="ml-auto w-4 h-4 text-brand-500" strokeWidth={1.5} />}
              </div>
              <p className="text-b2 text-text-primary leading-relaxed">{seg.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
// 主页面
// ================================================================

export default function ClassroomPage() {
  const capture = useClassroomCapture();
  const statusCfg = STATUS_CONFIG[capture.status];
  const StatusIcon = statusCfg.icon;

  // M 快捷键：课中标记重点
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'm' || e.key === 'M') {
      // 避免在输入框中触发
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      capture.handleBookmark();
    }
  }, [capture.handleBookmark]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleInsertSelected = () => {
    // 全页模式下暂无笔记编辑器目标，复制到剪贴板
    const texts = capture.segments.filter((s) => capture.selectedIds.has(s.id)).map((s) => s.text).join('\n\n');
    if (texts) navigator.clipboard.writeText(texts);
  };
  const handleInsertAll = () => {
    const texts = capture.segments.map((s) => s.text).join('\n\n');
    if (texts) navigator.clipboard.writeText(texts);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ── 左侧控制面板 ── */}
      <div className="w-80 flex-shrink-0 border-r border-border/30 flex flex-col overflow-y-auto">
        {/* 标题 */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border/30">
          <Clapperboard className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
          <h1 className="text-b1 font-semibold text-text-primary">回声定位</h1>
          {capture.status === 'capturing' && (
            <span className="ml-auto w-2.5 h-2.5 rounded-full bg-semantic-error animate-pulse" />
          )}
        </div>

        <div className="p-4 space-y-5">
          {/* 窗口选择 */}
          <WindowSelector
            windows={capture.windows}
            selected={capture.selectedWindow}
            onSelect={capture.setSelectedWindow}
            onRefresh={capture.refreshWindows}
            loading={capture.windowsLoading}
          />

          {/* 路径选择 */}
          <div>
            <span className="text-b3 font-medium text-text-tertiary block mb-2">采集路径</span>
            <div className="flex flex-col gap-1.5">
              {PATH_OPTIONS.map(({ value, label, icon: PathIcon, brief }) => (
                <button key={value} onClick={() => capture.setCapturePath(value)}
                  disabled={capture.status === 'capturing' || capture.status === 'processing'}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-kb-md text-left transition-all border',
                    capture.capturePath === value
                      ? 'bg-brand-50 border-brand-200/60 shadow-kb-sm'
                      : 'border-transparent hover:bg-bg-tertiary/50',
                    (capture.status === 'capturing' || capture.status === 'processing') && 'opacity-50 cursor-not-allowed',
                  )}>
                  <PathIcon className={cn('w-4 h-4 flex-shrink-0', capture.capturePath === value ? 'text-brand-600' : 'text-text-tertiary')} strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <span className={cn('text-b3 font-medium block', capture.capturePath === value ? 'text-brand-700' : 'text-text-secondary')}>
                      {label}
                    </span>
                    <span className={cn('text-[11px] leading-tight', capture.capturePath === value ? 'text-brand-500' : 'text-text-tertiary')}>
                      {brief}
                    </span>
                  </div>
                  {capture.capturePath === value && (
                    <CheckCircle2 className="w-4 h-4 text-brand-500 flex-shrink-0" strokeWidth={1.5} />
                  )}
                </button>
              ))}
            </div>
            {/* 当前路径详细说明 */}
            <div className="mt-2 flex items-start gap-2 px-3 py-2.5 rounded-kb-md bg-bg-secondary/60 border border-border/20">
              <Info className="w-3.5 h-3.5 text-text-tertiary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <p className="text-[11px] leading-relaxed text-text-tertiary">
                {PATH_OPTIONS.find((p) => p.value === capture.capturePath)?.detail}
              </p>
            </div>
          </div>

          {/* 状态 + 控制 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className={cn('flex items-center gap-1.5 text-b3 font-medium', statusCfg.color)}>
                <StatusIcon className={cn('w-4 h-4', capture.status === 'capturing' && 'animate-spin')} strokeWidth={1.5} />
                {statusCfg.label}
              </div>
              <div className="flex items-center gap-3 text-b3 text-text-tertiary">
                <span>帧 {capture.stats.frames}</span>
                <span>段 {capture.stats.extracted}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {capture.status !== 'capturing' ? (
                <button onClick={capture.handleStart} disabled={!capture.canStart}
                  className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-kb-md text-b3 font-medium',
                    'bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20',
                    'active:scale-95 transition-all', !capture.canStart && 'opacity-50 cursor-not-allowed')}>
                  <Play className="w-4 h-4" strokeWidth={1.5} /> 开始
                </button>
              ) : (
                <button onClick={capture.handlePause}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-kb-md text-b3 font-medium bg-semantic-warning/10 text-semantic-warning hover:bg-semantic-warning/20 active:scale-95 transition-all">
                  <Pause className="w-4 h-4" strokeWidth={1.5} /> 暂停
                </button>
              )}
              {capture.status !== 'idle' && capture.status !== 'error' && (
                <button onClick={capture.handleStop}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-kb-md text-b3 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-95 transition-all">
                  <Square className="w-4 h-4" strokeWidth={1.5} /> 停止
                </button>
              )}
              {capture.status === 'capturing' && (
                <button onClick={capture.handleBookmark}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-kb-md text-b3 font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 active:scale-95 transition-all"
                  title="标记重点 (M)">
                  <Star className="w-4 h-4" strokeWidth={1.5} /> 标记
                </button>
              )}
            </div>
          </div>

          {/* 采集模式 */}
          <div>
            <span className="text-b3 font-medium text-text-tertiary block mb-2">采集模式</span>
            <div className="flex items-center gap-1">
              {MODE_OPTIONS.map(({ value, label, icon: ModeIcon }) => (
                <button key={value} onClick={() => capture.handleModeChange(value)}
                  disabled={capture.status === 'capturing' || capture.status === 'processing'}
                  className={cn('flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-kb-sm text-b3 font-medium transition-all',
                    capture.mode === value
                      ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50',
                    (capture.status === 'capturing' || capture.status === 'processing') && 'opacity-50 cursor-not-allowed')}>
                  <ModeIcon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-text-tertiary leading-relaxed">
              {MODE_OPTIONS.find((m) => m.value === capture.mode)?.desc}
            </p>
          </div>

          {/* 设置 */}
          <SettingsSection config={capture.config} onChange={capture.handleConfigChange} />

          {/* 课程信息 */}
          <CourseInfoSection
            courseMeta={capture.courseMeta}
            onChange={capture.setCourseMeta}
            aiDetectEnabled={capture.aiDetectEnabled}
            onAiDetectToggle={capture.setAiDetectEnabled}
          />
        </div>
      </div>

      {/* ── 右侧内容区 ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* 错误提示 */}
        {capture.extractionError && (
          <div className="mx-4 mt-3 p-3 rounded-kb-lg bg-semantic-error/5 border border-semantic-error/10">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 mt-0.5 text-semantic-error" strokeWidth={1.5} />
              <div>
                <p className="text-b3 text-semantic-error font-medium">{capture.extractionError}</p>
                <p className="text-b3 text-text-tertiary mt-0.5">请在设置中检查AI网关配置</p>
              </div>
            </div>
          </div>
        )}

        {/* 条件渲染内容 */}
        {capture.capturePath === 'fine' && (
          <SegmentList
            segments={capture.segments}
            selectedIds={capture.selectedIds}
            onToggleSelect={capture.handleToggleSelect}
            onInsertSelected={handleInsertSelected}
            onInsertAll={handleInsertAll}
          />
        )}

        {capture.capturePath === 'smart' && (
          <>
            <SmartCapturePanel bundle={capture.smartBundle} isRecording={capture.status === 'capturing'} />
            {capture.partialCount > 0 && (
              <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-kb-md bg-brand-50/50 border border-brand-100/50">
                <CheckCircle2 className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
                <span className="text-b3 text-brand-600">已增量分析 {capture.partialCount} 段，课后将快速合并生成笔记</span>
              </div>
            )}
            {capture.transcribedCount > 0 && (
              <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-kb-md bg-emerald-50/50 border border-emerald-100/50">
                <Mic className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                <span className="text-b3 text-emerald-600">已转写 {capture.transcribedCount} 段语音</span>
              </div>
            )}
            {/* 实时转录上屏 */}
            <LiveTranscript
              transcripts={capture.liveTranscripts}
              isActive={capture.status === 'capturing' && (capture.mode === 'audio' || capture.mode === 'mixed')}
              className="mt-auto"
            />
          </>
        )}

        {capture.capturePath === 'full_record' && (
          <VideoRecordPanel recordingStatus={capture.recordingStatus} isRecording={capture.status === 'capturing'} />
        )}

        {/* 分析预览 */}
        {(capture.isAnalyzing || capture.analysisResult || capture.analysisError) && (
          <AnalysisPreview
            result={capture.analysisResult}
            isAnalyzing={capture.isAnalyzing}
            error={capture.analysisError}
            onInsert={() => capture.handleDismissAnalysis()}
            onDismiss={capture.handleDismissAnalysis}
            onRetry={capture.analysisResult?.modelUsed === 'local-concat' ? undefined : capture.handleAnalyze}
            onGenerateCards={capture.handleGenerateCards}
          />
        )}
      </div>
    </div>
  );
}

// ================================================================
// 设置区（内联）
// ================================================================

function SettingsSection({ config, onChange }: {
  config: CaptureSidebarConfig;
  onChange: (patch: Partial<CaptureSidebarConfig>) => void;
}) {
  return (
    <div className="space-y-3 pt-3 border-t border-border/20">
      <div className="flex items-center gap-2 text-b3 text-text-tertiary">
        <Settings2 className="w-4 h-4" strokeWidth={1.5} />
        <span className="font-medium">设置</span>
      </div>
      <div>
        <label className="text-b3 text-text-tertiary mb-1 block">截图间隔: {config.screenshotInterval / 1000}s</label>
        <input type="range" min={1} max={30} value={config.screenshotInterval / 1000}
          onChange={(e) => onChange({ screenshotInterval: Number(e.target.value) * 1000 })}
          className="w-full accent-brand-600" />
      </div>
      <div>
        <label className="text-b3 text-text-tertiary mb-1 block">识别语言</label>
        <div className="flex gap-1">
          {LANGUAGE_OPTIONS.map(({ value, label }) => (
            <button key={value} onClick={() => onChange({ language: value })}
              className={cn('flex-1 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
                config.language === value
                  ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                  : 'text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary')}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 课程信息区（内联）
// ================================================================

const SUBJECT_OPTIONS = [
  { value: 'math', label: '数学' },
  { value: 'physics', label: '物理' },
  { value: 'cs', label: '计算机' },
  { value: 'english', label: '英语' },
  { value: 'other', label: '其他' },
];

function CourseInfoSection({ courseMeta, onChange, aiDetectEnabled, onAiDetectToggle }: {
  courseMeta: CourseMeta;
  onChange: (meta: CourseMeta) => void;
  aiDetectEnabled: boolean;
  onAiDetectToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="space-y-3 pt-3 border-t border-border/20">
      <div className="flex items-center gap-2 text-b3 text-text-tertiary">
        <Sparkles className="w-4 h-4" strokeWidth={1.5} />
        <span className="font-medium">课程信息</span>
        {courseMeta.detectedBy && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-kb-xs bg-brand-50 text-brand-500">
            {courseMeta.detectedBy === 'ai' ? 'AI 识别' : courseMeta.detectedBy === 'window_title' ? '自动提取' : '手动'}
          </span>
        )}
      </div>
      <div>
        <label className="text-b3 text-text-tertiary mb-1 block">课程名称</label>
        <input
          type="text"
          value={courseMeta.courseName ?? ''}
          onChange={(e) => onChange({ ...courseMeta, courseName: e.target.value || undefined, detectedBy: 'manual' })}
          placeholder="如：高等数学、数据结构..."
          className="w-full px-2.5 py-1.5 rounded-kb-sm text-b3 bg-bg-secondary border border-border/30 text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:ring-1 focus:ring-brand-300"
        />
      </div>
      <div>
        <label className="text-b3 text-text-tertiary mb-1 block">学科</label>
        <div className="flex gap-1 flex-wrap">
          {SUBJECT_OPTIONS.map(({ value, label }) => (
            <button key={value} onClick={() => onChange({ ...courseMeta, subject: value, detectedBy: 'manual' })}
              className={cn('px-2 py-1 rounded-kb-sm text-[11px] font-medium transition-all',
                courseMeta.subject === value
                  ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                  : 'text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* AI 识别开关 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={aiDetectEnabled}
          onChange={(e) => onAiDetectToggle(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-brand-600"
        />
        <span className="text-b3 text-text-tertiary">采集开始时 AI 自动识别课程</span>
      </label>
    </div>
  );
}
