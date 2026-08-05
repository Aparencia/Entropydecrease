/**
 * ClassroomPage — 课堂助手（回声定位）独立全页模块（装配层）
 * Echo-location full-page module: assembly layer only.
 *
 * 布局：双阶段左栏（配置态/运行态变形，一屏容纳不滚动）+ 右侧独立滚动内容区。
 * 配置态左栏：窗口卡片 → 路径/模式 → 设置折叠区 → 底部声呐启动按钮；
 * 运行态左栏：SonarControls 仪表盘；右侧空态为当前配置说明书（IdleGuidePanel）。
 *
 * @ai-context: classroom 功能模块页面。本文件仅做状态绑定与组件编排，业务
 * 逻辑全部在 useClassroomCapture 及其子 hooks 中，选项文案在 constants.ts。
 * @ai-context: Assembly-only page; capture orchestration lives in hooks and
 * all option copy lives in constants.ts. Keep this file under 300 lines.
 */
import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, Radar, SpellCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClassroomCapture } from '../hooks/useClassroomCapture';
import { classifyAnalysisError } from '../utils/analysisErrors';
import { LiveTranscript } from '../components/LiveTranscript';
import { NoteInsertDialog } from '../components/NoteInsertDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ClassroomStatusBanners } from '../components/ClassroomStatusBanners';
import { SegmentList } from '../components/SegmentList';
import { WindowSelectCard } from '../components/WindowSelectCard';
import { PathModeSelector } from '../components/PathModeSelector';
import { SettingsCollapse } from '../components/SettingsCollapse';
import { SonarControls } from '../components/SonarControls';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { IdleGuidePanel } from '../components/IdleGuidePanel';
import { CourseInfoCard } from '../components/CourseInfoCard';
import { SmartCapturePanel } from '@/features/notes/components/SmartCapturePanel';
import { AnalysisPreview } from '@/features/notes/components/AnalysisPreview';
import { VideoRecordPanel } from '@/features/notes/components/VideoRecordPanel';
import { AsrModelPrompt } from '../components/AsrModelPrompt';
import { HotwordDialog } from '../components/HotwordDialog';
import SessionQAPanel from '../components/SessionQAPanel';
import { PredictionOverlay } from '../components/PredictionOverlay';
import { TimelineAnchor } from '../components/TimelineAnchor';

export default function ClassroomPage() {
  const capture = useClassroomCapture();
  const navigate = useNavigate();

  // ── 阶段判定：运行态（左栏变形为仪表盘）/ 配置态（右侧显示说明书） ──
  const isRunning = capture.status === 'capturing' || capture.status === 'processing' || capture.status === 'paused';
  const hasSessionData = capture.segments.length > 0
    || (capture.smartBundle?.keyframes?.length ?? 0) > 0
    || (capture.smartBundle?.timeline?.length ?? 0) > 0
    || capture.liveTranscripts.length > 0
    || !!capture.videoFilePath;
  const showIdleGuide = !isRunning && !hasSessionData
    && !capture.isAnalyzing && !capture.analysisResult && !capture.analysisError;

  // ── 课堂问答上下文：拼接各路径转写文本（fine 段 + smart 实时转录）──
  const qaTranscript = capture.capturePath === 'fine'
    ? capture.segments.map((s) => s.text).join('\n')
    : capture.liveTranscripts.map((t) => t.text).join('\n');

  // ── 笔记插入弹窗状态 ──
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [sessionSeq, setSessionSeq] = useState(1);
  // ── 热词/替换词表弹窗状态（P1-3） ──
  const [showHotwordDialog, setShowHotwordDialog] = useState(false);

  /** 点击"插入笔记"时打开弹窗，并计算当天采集序号 */
  const handleOpenNoteDialog = useCallback(async () => {
    const seq = await capture.getSessionSeq();
    setSessionSeq(seq);
    setShowNoteDialog(true);
  }, [capture]);

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
      {/* ── 左侧控制面板：一屏容纳，不滚动 ── */}
      <div className="w-80 flex-shrink-0 border-r border-border/30 flex flex-col overflow-hidden">
        {/* 标题：回声定位仪式标识（compact） */}
        <div className="flex items-center px-4 py-3.5 border-b border-border/30">
          <ModuleRitualHeader
            title="回声定位"
            sealChar="回"
            sealColor="#14B8A6"
            compact
          />
          {/* P1-3：热词/替换词表入口 */}
          <button onClick={() => setShowHotwordDialog(true)} title="热词 / 替换词表"
            className="ml-auto p-1.5 rounded-kb-lg text-text-tertiary hover:text-text-primary hover:bg-bg-secondary active:scale-95 transition-all">
            <SpellCheck className="w-4 h-4" strokeWidth={1.5} />
          </button>
          {capture.status === 'capturing' && (
            <span className="ml-1.5 w-2.5 h-2.5 rounded-full bg-semantic-error animate-pulse" />
          )}
        </div>

        {isRunning ? (
          /* 运行态：声呐仪表盘 */
          <SonarControls
            status={capture.status}
            stats={capture.stats}
            mode={capture.mode}
            audioHealthy={capture.audioHealth.isHealthy}
            onPause={capture.handlePause}
            onResume={capture.handlePause}
            onStop={capture.handleStop}
            onBookmark={capture.handleBookmark}
          />
        ) : (
          /* 配置态：窗口/路径/模式/设置 + 底部启动按钮 */
          <>
            <div className="flex-1 min-h-0 p-4 space-y-4">
              <WindowSelectCard
                windows={capture.windows}
                selected={capture.selectedWindow}
                onSelect={capture.setSelectedWindow}
                onRefresh={capture.refreshWindows}
                loading={capture.windowsLoading}
              />
              <PathModeSelector
                capturePath={capture.capturePath}
                onPathChange={capture.setCapturePath}
                mode={capture.mode}
                onModeChange={capture.handleModeChange}
              />
              <SettingsCollapse config={capture.config} onChange={capture.handleConfigChange} />
            </div>
            <div className="p-4 border-t border-border/20">
              <button onClick={capture.requestStart} disabled={!capture.canStart}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-3 rounded-kb-lg text-b2 font-semibold transition-all active:scale-[0.98]',
                  capture.canStart
                    ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-kb-sm'
                    : 'bg-bg-secondary text-text-tertiary cursor-not-allowed',
                )}>
                <Radar className="w-5 h-5" strokeWidth={1.5} />
                {capture.gatewayStatus === 'checking' ? '检查网关中…' : '开始回声定位'}
              </button>
              {!capture.canStart && (
                <p className="mt-1.5 text-center text-[11px] text-text-tertiary">
                  {capture.gatewayStatus === 'checking' ? '正在确认 AI 网关可用性' : '请先选择目标窗口'}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 右侧内容区：独立滚动 ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* 错误提示（P0-1：按错误类渲染差异化文案与操作按钮，取代固定文案） */}
        {capture.extractionError && (() => {
          const errInfo = classifyAnalysisError(capture.extractionError);
          return (
            <div className="mx-4 mt-3 p-3 rounded-kb-lg bg-semantic-error/5 border border-semantic-error/10">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 mt-0.5 text-semantic-error" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-b3 text-semantic-error font-medium">{capture.extractionError}</p>
                  <p className="text-b3 text-text-tertiary mt-0.5">{errInfo.message}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {errInfo.action !== 'settings' && (
                      /* 提取随采集流自动继续：重试=清除滞留横幅，等待下一帧结果 */
                      <button onClick={() => capture.setExtractionError(null)}
                        className="px-2.5 py-1 rounded-kb-sm text-[11px] font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all">
                        重试
                      </button>
                    )}
                    {errInfo.action !== 'retry' && (
                      <button onClick={() => navigate('/settings')}
                        className="px-2.5 py-1 rounded-kb-sm text-[11px] font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all">
                        打开设置
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {showIdleGuide ? (
          /* 空态：当前配置说明书 + 课程信息卡 */
          <div className="flex-1 overflow-y-auto">
            {/* 本地 ASR 模型下载引导（首次进入时显示，可选增强） */}
            <AsrModelPrompt />
            <IdleGuidePanel
              capturePath={capture.capturePath}
              mode={capture.mode}
              hasWindow={!!capture.selectedWindow}
            >
              <CourseInfoCard
                courseMeta={capture.courseMeta}
                onChange={capture.setCourseMeta}
                aiDetectEnabled={capture.aiDetectEnabled}
                onAiDetectToggle={capture.setAiDetectEnabled}
              />
            </IdleGuidePanel>
          </div>
        ) : (
          <>
            {/* 运行/结果态：按采集路径条件渲染 */}
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
                {/* 状态横幅组（增量分析/转写/音频健康/VAD，抽组件控行数） */}
                <ClassroomStatusBanners
                  status={capture.status}
                  partialCount={capture.partialCount}
                  transcribedCount={capture.transcribedCount}
                  audioHealth={capture.audioHealth}
                  vadStats={capture.vadStats}
                />
                {/* 实时转录上屏 */}
                <LiveTranscript
                  transcripts={capture.liveTranscripts}
                  partialText={capture.partialText}
                  isActive={capture.status === 'capturing' && (capture.mode === 'audio' || capture.mode === 'mixed')}
                  className="mt-auto"
                />
                {/* M2 自动锚点：连续录制每 15 分钟生成，点击查看锚点文本 */}
                <TimelineAnchor anchors={capture.autoAnchors} className="mt-2" />
                {/* M1 课堂实时弹幕：录制中每 30s 基于转写做 AI 预测（右下角悬浮条） */}
                <PredictionOverlay
                  liveTranscripts={capture.liveTranscripts}
                  isActive={capture.status === 'capturing'}
                />
              </>
            )}

            {capture.capturePath === 'full_record' && (
              <VideoRecordPanel recordingStatus={capture.recordingStatus} isRecording={capture.status === 'capturing'} />
            )}

            {/* 分析预览（P0-2：local-concat 降级可重试合并；P0-1：错误按类给按钮） */}
            {(capture.isAnalyzing || capture.analysisResult || capture.analysisError) && (
              <AnalysisPreview
                result={capture.analysisResult}
                isAnalyzing={capture.isAnalyzing}
                error={capture.analysisError?.message ?? null}
                onInsert={() => void handleOpenNoteDialog()}
                onDismiss={capture.handleDismissAnalysis}
                onRetry={capture.analysisResult?.modelUsed === 'local-concat'
                  ? capture.handleRetryMerge
                  : capture.analysisError?.action === 'settings' ? undefined : capture.handleAnalyze}
                onGoSettings={capture.analysisError && capture.analysisError.action !== 'retry'
                  ? () => navigate('/settings') : undefined}
                onGenerateCards={capture.handleGenerateCards}
              />
            )}

            {/* D2 课堂问答：基于本次转写提问（有转写数据时显示） */}
            <SessionQAPanel transcript={qaTranscript} className="mt-auto" />
          </>
        )}

        {/* 笔记插入弹窗 */}
        {showNoteDialog && capture.analysisResult && (
          <NoteInsertDialog
            content={capture.analysisResult.content}
            courseName={capture.courseMeta.courseName ?? ''}
            sessionSeq={sessionSeq}
            fetchCourseNotes={capture.fetchCourseNotes}
            appendToNote={capture.appendToNote}
            createCourseNote={capture.createCourseNote}
            onDone={() => {
              setShowNoteDialog(false);
              capture.handleDismissAnalysis();
            }}
            onClose={() => setShowNoteDialog(false)}
          />
        )}
        {/* 应用内确认对话框（P0-5：替代 window.confirm） */}
        <ConfirmDialog open={!!capture.confirmRequest} title={capture.confirmRequest?.title ?? ''}
          description={capture.confirmRequest?.description} confirmLabel={capture.confirmRequest?.confirmLabel}
          onConfirm={capture.handleConfirm} onCancel={capture.handleCancel} />
        {/* 热词/替换词表管理（P1-3：本地词表 CRUD，会话启动自动按课程应用） */}
        {showHotwordDialog && (
          <HotwordDialog open courseId={capture.courseMeta.courseName} onClose={() => setShowHotwordDialog(false)} />
        )}
      </div>
    </div>
  );
}
