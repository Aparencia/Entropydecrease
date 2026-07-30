/**
 * 采集侧边栏（笔记页嵌入）— 回声定位
 *
 * @ai-context: 2026-07 拆分后的纯 UI 组合层。会话编排见 useCaptureSession，
 * AI 分析见 useCaptureAnalysis；子组件（窗口选择/路径选择/控制栏/结果列表/
 * 设置面板）均为纯展示+回调注入。
 * @ai-context: 采集全流程依赖 Electron IPC，Web 环境下功能不可用。
 * 三条内容区路径互斥渲染：fine=逐帧结果、smart=智能时间轴、full_record=录制面板。
 */
import { useState, useCallback } from 'react';
import { Monitor, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SmartCapturePanel } from './SmartCapturePanel';
import { AnalysisPreview } from './AnalysisPreview';
import { VideoRecordPanel } from './VideoRecordPanel';
import { WindowSelector } from './WindowSelector';
import { ControlBar } from './ControlBar';
import { SegmentList } from './SegmentList';
import { SettingsPanel } from './SettingsPanel';
import { CapturePathSelector, ExtractionErrorBanner } from './CapturePathSelector';
import { useCaptureSession } from '../hooks/useCaptureSession';

export interface CaptureSidebarProps {
  /** 将提取的文本插入到笔记编辑器 */
  onInsertText?: (text: string) => void;
}

export function CaptureSidebar({ onInsertText }: CaptureSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const session = useCaptureSession();
  const {
    windows, windowsLoading, selectedWindow, setSelectedWindow, refreshWindows,
    status, mode, capturePath, setCapturePath, config, stats,
    segments, setSegments, extractionError, smartBundle, recordingStatus,
    handleStart, handlePause, handleStop, handleModeChange, handleConfigChange,
    canStart,
    isAnalyzing, analysisResult, analysisError, analyzeBundle, dismissAnalysis,
  } = session;

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
  }, [segments, onInsertText, setSegments]);

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

          <WindowSelector
            windows={windows}
            selected={selectedWindow}
            onSelect={setSelectedWindow}
            onRefresh={refreshWindows}
            loading={windowsLoading}
          />

          <CapturePathSelector
            capturePath={capturePath}
            status={status}
            onChange={setCapturePath}
          />

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

          {extractionError && <ExtractionErrorBanner message={extractionError} />}

          {/* 条件渲染内容区域：fine=逐帧结果 / smart=智能时间轴 / full_record=录制面板 */}
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

          {/* Path B/C 分析预览面板 */}
          {(isAnalyzing || analysisResult || analysisError) && (
            <AnalysisPreview
              result={analysisResult}
              isAnalyzing={isAnalyzing}
              error={analysisError}
              onInsert={(content) => {
                onInsertText?.(content);
                dismissAnalysis();
              }}
              onDismiss={dismissAnalysis}
              onRetry={() => analyzeBundle(smartBundle)}
            />
          )}

          <SettingsPanel config={config} onChange={handleConfigChange} />
        </div>
      )}
    </aside>
  );
}

export default CaptureSidebar;
