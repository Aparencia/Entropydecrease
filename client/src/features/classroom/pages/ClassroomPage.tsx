/**
 * ClassroomPage — 课堂助手（回声定位）独立全页模块（装配层）
 * Echo-location full-page module: assembly layer only.
 *
 * 布局：双阶段左栏（配置态/运行态变形，一屏容纳不滚动）+ 右侧内容区。
 * 配置态左栏：窗口卡片 → 路径/模式 → 设置折叠区 → 底部声呐启动按钮；
 * 运行态左栏：SonarControls 仪表盘；右侧空态为当前配置说明书（IdleGuidePanel），
 * 运行/结果态由 SessionContentView 以「内容 / 分析笔记 / 课堂问答」标签页组织
 * （统一时间线合并事件与转写，一屏内互不挤压）。
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
import { NoteInsertDialog } from '../components/NoteInsertDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WindowSelectCard } from '../components/WindowSelectCard';
import { PathModeSelector } from '../components/PathModeSelector';
import { SettingsCollapse } from '../components/SettingsCollapse';
import { SonarControls } from '../components/SonarControls';
import { VisionModeSelector } from '../components/VisionModeSelector';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { IdleGuidePanel } from '../components/IdleGuidePanel';
import { CourseInfoCard } from '../components/CourseInfoCard';
import { AsrModelPrompt } from '../components/AsrModelPrompt';
import { HotwordDialog } from '../components/HotwordDialog';
import { SessionContentView } from '../components/SessionContentView';

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

  // M 快捷键：课中标记重点；C 快捷键：手动补截当前画面（P1-8）
  const { handleBookmark, handleManualCapture } = capture;
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'm' || e.key === 'M') {
      // 避免在输入框中触发
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      handleBookmark();
    }
    if (e.key === 'c' || e.key === 'C') {
      // 避免在输入框中触发（快捷键截图同样跳过编辑态）
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      handleManualCapture();
    }
  }, [handleBookmark, handleManualCapture]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    /* 高度锚定视口而非 h-full：面板（FunctionalOverlay）是 max-h + overflow 容器，
       height:auto 下子级百分比高度失效，h-full 链断裂会让页面高度=内容高度、
       内容超高时面板整体滚动。面板 sm+ 断点 max-h=85vh（含 1px border ×2）+
       md 断点 p-8 padding（4rem）→ 内容区恰为 calc(85vh-4rem-2px)，锚定后
       与面板精确贴合（一屏式布局） */
    <div className="flex h-[calc(85vh-4rem-2px)] min-h-0">
      {/* ── 左侧控制面板：一屏容纳，不滚动 ── */}
      <div className="w-80 flex-shrink-0 border-r border-border/30 flex flex-col overflow-hidden">
        {/* 标题：回声定位仪式标识（compact） */}
        <div className="flex items-center px-4 py-2.5 border-b border-border/30">
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
            <div className="flex-1 min-h-0 p-3 space-y-2.5 overflow-y-auto">
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
              {/* P8 视觉提取模式：写入截图 metadata.visionMode，VisionWorker 按模式提取 */}
              <VisionModeSelector value={capture.visionMode} onChange={capture.setVisionMode} />
              <SettingsCollapse config={capture.config} onChange={capture.handleConfigChange} />
            </div>
            <div className="p-3 border-t border-border/20">
              <button onClick={capture.requestStart} disabled={!capture.canStart}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-kb-lg text-b2 font-semibold transition-all active:scale-[0.98]',
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

      {/* ── 右侧内容区：一屏内独立滚动（空态/标签页各自滚动） ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* 错误提示（P0-1：按错误类渲染差异化文案与操作按钮，取代固定文案） */}
        {capture.extractionError && (() => {
          const errInfo = classifyAnalysisError(capture.extractionError);
          return (
            <div className="mx-4 mt-3 p-3 rounded-kb-lg bg-semantic-error/5 border border-semantic-error/10 flex-shrink-0">
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
          /* 空态：当前配置说明书 + 课程信息卡（独立滚动） */
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
          /* 运行/结果态：标签页容器（内容/分析笔记/课堂问答） */
          <SessionContentView capture={capture} onOpenNoteDialog={() => void handleOpenNoteDialog()} />
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
