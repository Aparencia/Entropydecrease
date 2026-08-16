/**
 * SessionContentView — 课堂会话内容标签页容器（右侧运行/结果态）
 * 以「内容 / 分析笔记 / 课堂问答」三个 Tab 组织右侧展示，替代原先
 * 按采集路径散装多组件堆叠的分离式布局（内测反馈：事件时间轴与转写
 * 文本分离、笔记全文与时间线争抢高度、一屏内容互相挤压）。
 *
 * @ai-context: 各 Tab 面板保持挂载、用 hidden 切换显隐——运行中切走再
 * 切回不重置时间线滚动位置与编辑状态，实时性不受 Tab 影响。
 * 「分析笔记」Tab 即“存入笔记前的处理后内容预览”（AnalysisPreview：
 * AI 整理 + 口语书面化后的 Markdown 预览，确认后插入笔记）。
 * @ai-context: Tabbed session view; panels stay mounted (hidden toggle) so
 * live timeline state survives tab switches. Notes tab previews the
 * AI-processed result before inserting into a note.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useClassroomCapture } from '../hooks/useClassroomCapture';
import { SegmentList } from './SegmentList';
import { UnifiedTimeline } from './UnifiedTimeline';
import { ClassroomStatusBanners } from './ClassroomStatusBanners';
import { RecognitionStatsBar } from './RecognitionStatsBar';
import { StepFlowView } from './StepFlowView';
import { isLocalAsrReady } from '../utils/asrTranscriber';
import { AnalysisPreview } from '@/features/notes/components/AnalysisPreview';
import { VideoRecordPanel } from '@/features/notes/components/VideoRecordPanel';
import SessionQAPanel from './SessionQAPanel';
import { ChapterNav } from './ChapterNav';
import { PredictionOverlay } from './PredictionOverlay';

type TabId = 'content' | 'notes' | 'qa';

interface SessionContentViewProps {
  capture: ReturnType<typeof useClassroomCapture>;
  /** 打开"插入笔记"弹窗（由页面层持有状态） */
  onOpenNoteDialog: () => void;
}

const TAB_LABELS: Record<TabId, string> = {
  content: '内容',
  notes: '分析笔记',
  qa: '课堂问答',
};

export function SessionContentView({ capture, onOpenNoteDialog }: SessionContentViewProps) {
  const [tab, setTab] = useState<TabId>('content');
  const navigate = useNavigate();
  /** P2-7：内容视图子模式（技能类会话可用步骤卡片流） */
  const [viewMode, setViewMode] = useState<'timeline' | 'steps'>('timeline');
  const isSkillKind = capture.contentKind === 'software_skill' || capture.contentKind === 'craft_skill';

  // 首次检测到技能类内容时自动切到步骤视图（会话中途检测，仅切换一次）
  const skillDetectedRef = useRef(false);
  useEffect(() => {
    if (isSkillKind && !skillDetectedRef.current) {
      skillDetectedRef.current = true;
      setViewMode('steps');
    }
  }, [isSkillKind]);

  // 问答上下文：拼接各路径转写文本（fine 段 + smart 实时转录）
  const qaTranscript = capture.capturePath === 'fine'
    ? capture.segments.map((s) => s.text).join('\n')
    : capture.liveTranscripts.map((t) => t.text).join('\n');

  const notesTabVisible = capture.isAnalyzing || !!capture.analysisResult || !!capture.analysisError;
  const qaTabVisible = qaTranscript.trim().length > 0;

  const tabs: TabId[] = ['content', ...(notesTabVisible ? ['notes' as const] : []), ...(qaTabVisible ? ['qa' as const] : [])];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Tab 栏 ── */}
      <div className="flex items-center gap-1 px-4 pt-2 border-b border-border/20 flex-shrink-0">
        {tabs.map((id) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              'px-3 py-1.5 rounded-t-kb-md text-b3 font-medium transition-colors relative',
              tab === id
                ? 'text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary',
            )}>
            {TAB_LABELS[id]}
            {tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-500" />}
          </button>
        ))}
      </div>

      {/* ── 内容区：各 Tab 保持挂载，hidden 切换（不重置时间线状态） ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* 内容 Tab：按采集路径渲染会话内容 */}
        <div className={cn('flex-1 min-h-0 flex flex-col', tab !== 'content' && 'hidden')}>
          {capture.capturePath === 'smart' && (
            <>
              <ClassroomStatusBanners
                status={capture.status}
                partialCount={capture.partialCount}
                transcribedCount={capture.transcribedCount}
                audioHealth={capture.audioHealth}
                vadStats={capture.vadStats}
              />
              {/* P0-7 识别统计条：引擎徽标 / 帧数 / 句数 / VAD 语音状态 */}
              <RecognitionStatsBar
                status={capture.status}
                keyframeCount={capture.smartBundle?.keyframes?.length ?? 0}
                transcribedCount={capture.transcribedCount}
                vadStats={capture.vadStats}
                streamingAsrActive={capture.streamingAsrActive}
                localAsrReady={isLocalAsrReady()}
              />
              {/* P2-7 技能类会话：时间线 / 步骤卡片流切换 */}
              {isSkillKind && (
                <div className="mx-4 mt-2 flex gap-1">
                  {(['timeline', 'steps'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={cn(
                        'px-2.5 py-1 rounded-kb-sm text-[11px] font-medium transition-all',
                        viewMode === mode
                          ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                          : 'text-text-tertiary hover:bg-bg-tertiary',
                      )}
                    >
                      {mode === 'timeline' ? '时间线' : '步骤卡片'}
                    </button>
                  ))}
                </div>
              )}
              {/* M2 自动锚点以时间线行展示（autoAnchors 独立数据源） */}
              {viewMode === 'steps' && isSkillKind ? (
                <StepFlowView bundle={capture.smartBundle} />
              ) : (
                <UnifiedTimeline
                  bundle={capture.smartBundle}
                  liveTranscripts={capture.liveTranscripts}
                  autoAnchors={capture.autoAnchors}
                  partialText={capture.partialText}
                  isActive={capture.status === 'capturing' && (capture.mode === 'audio' || capture.mode === 'mixed')}
                  onEditTranscript={capture.handleEditTranscript}
                  onCycleSpeaker={capture.handleCycleSpeaker}
                />
              )}
            </>
          )}

          {capture.capturePath === 'fine' && (
            <SegmentList
              segments={capture.segments}
              selectedIds={capture.selectedIds}
              onToggleSelect={capture.handleToggleSelect}
              onInsertSelected={() => {
                const texts = capture.segments.filter((s) => capture.selectedIds.has(s.id)).map((s) => s.text).join('\n\n');
                if (texts) navigator.clipboard.writeText(texts);
              }}
              onInsertAll={() => {
                const texts = capture.segments.map((s) => s.text).join('\n\n');
                if (texts) navigator.clipboard.writeText(texts);
              }}
            />
          )}

          {capture.capturePath === 'full_record' && (
            <VideoRecordPanel recordingStatus={capture.recordingStatus} isRecording={capture.status === 'capturing'} />
          )}
        </div>

        {/* 分析笔记 Tab：存入笔记前的处理后内容预览 */}
        <div className={cn('flex-1 min-h-0 overflow-y-auto', tab !== 'notes' && 'hidden')}>
          {notesTabVisible && (
            <>
              <AnalysisPreview
                result={capture.analysisResult}
                isAnalyzing={capture.isAnalyzing}
                error={capture.analysisError?.message ?? null}
                onInsert={() => onOpenNoteDialog()}
                onDismiss={capture.handleDismissAnalysis}
                onRetry={capture.analysisResult?.modelUsed === 'local-concat'
                  ? capture.handleRetryMerge
                  : capture.analysisError?.action === 'settings' ? undefined : capture.handleAnalyze}
                onGoSettings={capture.analysisError && capture.analysisError.action !== 'retry'
                  ? () => navigate('/settings') : undefined}
                onGenerateCards={capture.handleGenerateCards}
              />
              {/* P2-2 章节速览：从笔记 Markdown 提取章节导航 */}
              {capture.analysisResult?.content && (
                <ChapterNav content={capture.analysisResult.content} />
              )}
            </>
          )}
        </div>

        {/* 课堂问答 Tab */}
        <div className={cn('flex-1 min-h-0 overflow-y-auto', tab !== 'qa' && 'hidden')}>
          {qaTabVisible && <SessionQAPanel transcript={qaTranscript} />}
        </div>
      </div>

      {/* M1 课堂实时弹幕：录制中每 30s 基于转写做 AI 预测（右下角悬浮条） */}
      <PredictionOverlay
        liveTranscripts={capture.liveTranscripts}
        isActive={capture.status === 'capturing'}
      />
    </div>
  );
}

export default SessionContentView;
