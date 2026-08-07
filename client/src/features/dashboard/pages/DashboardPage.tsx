/**
 * DashboardPage — 「知识星空」沉浸式学习生态可视化（薄容器）
 *
 * 三视图认知架构：今日（计划与行动）/ 成长（回顾与觉察）/ 世界（身份与生态）。
 * - 数据由 useDashboardData / useDashboardRitual 聚合（拆分自旧版长滚动页）
 * - 视图懒挂载 + 常驻：首次激活才挂载（WorldView 的 3D 星座 Canvas 避免后台空转），
 *   之后保持挂载保留页面状态；切换用 opacity 交叉淡入（0.2s，无卸载）
 * - 双方案视觉语言由 useHomeScheme 驱动（深海毛玻璃 / 穹顶平面）
 *
 * @ai-context: dashboard 功能模块页面：DashboardPage。
 */
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import { useHomeScheme } from '../hooks/useHomeScheme';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDashboardRitual } from '../hooks/useDashboardRitual';
import { useDomeNebula } from '../hooks/useDomeNebula';
import { DashboardViewSwitcher, type DashboardView } from '../components/views/DashboardViewSwitcher';
import { DashboardWelcome } from '../components/DashboardWelcome';
import { TodayView } from '../components/views/TodayView';
import { GrowthView } from '../components/views/GrowthView';
import { WorldView } from '../components/views/WorldView';
import DashboardNebula from '../components/DashboardNebula';
import StartupRitual from '../components/StartupRitual';
import '../styles/dashboard.css';

/** 视图叠放容器样式：当前视图可见，其余透明且不响应指针（opacity 交叉淡入） */
function viewLayerStyle(active: boolean): CSSProperties {
  return {
    gridArea: '1 / 1',
    opacity: active ? 1 : 0,
    pointerEvents: active ? 'auto' : 'none',
    transition: 'opacity 0.2s ease',
  };
}

export default function DashboardPage() {
  const data = useDashboardData();
  const ritual = useDashboardRitual({ notes: data.notes });
  const { scheme } = useHomeScheme();
  const domeNebula = useDomeNebula();

  /* ── 视图切换：懒挂载 + 常驻（保留页面状态） ── */
  const [view, setView] = useState<DashboardView>('today');
  const [mountedViews, setMountedViews] = useState<ReadonlySet<DashboardView>>(() => new Set(['today']));

  const handleViewChange = useCallback((v: DashboardView) => {
    setView(v);
    setMountedViews((prev) => {
      if (prev.has(v)) return prev;
      const next = new Set(prev);
      next.add(v);
      return next;
    });
  }, []);

  return (
    <div className="relative min-h-full overflow-x-hidden">
      {/* 星云氛围背景：靛蓝/赛博青/琥珀星云 + 闪烁星点（降级由 nebulaDegradation 控制） */}
      <DashboardNebula degradation={data.nebulaDegradation} />

      {/* 双方案背景层次（C1）：深海=海底光斑漂浮；穹顶=云层层次（可关闭退化为纯净晨光） */}
      {scheme === 'deep-sea' ? (
        <div className="kb-seafloor-glow" aria-hidden="true" />
      ) : domeNebula ? (
        <div className="kb-dome-clouds" aria-hidden="true" />
      ) : null}

      {/* 全局欢迎区：固定首屏门面（回归奖赏），三视图共享 */}
      <DashboardWelcome
        greetingText={data.greetingText}
        streakDays={data.streakDays}
        streakState={data.streakState}
      />

      {/* 三视图切换器：sticky 顶部常驻，切换入口随时可达 */}
      <DashboardViewSwitcher view={view} onChange={handleViewChange} scheme={scheme} />

      {/* 三视图叠放：已挂载视图常驻，当前视图可见 */}
      <div className="grid">
        {mountedViews.has('today') && (
          <div key="today" style={viewLayerStyle(view === 'today')} aria-hidden={view !== 'today'}>
            <TodayView
              isLoading={data.isLoading}
              todayPomodoroCount={data.todayPomodoroCount}
              noteTotal={data.noteTotal}
              dueFlashcardCount={data.dueFlashcardCount}
              feynmanInProgressCount={data.feynmanInProgressCount}
              goalData={data.goalData}
              analyticsLoading={data.analyticsLoading}
              knowledgeCards={data.knowledgeCards}
              emptyQuote={data.emptyQuote}
            />
          </div>
        )}

        {mountedViews.has('growth') && (
          <div key="growth" style={viewLayerStyle(view === 'growth')} aria-hidden={view !== 'growth'}>
            <GrowthView
              analytics={data.analytics}
              analyticsLoading={data.analyticsLoading}
              radarData={data.radarData}
              progressItems={data.progressItems}
              profileData={data.profileData}
              recentActivities={data.recentActivities}
            />
          </div>
        )}

        {mountedViews.has('world') && (
          <div key="world" style={viewLayerStyle(view === 'world')} aria-hidden={view !== 'world'}>
            <WorldView
              retentionEnabled={data.retentionEnabled}
              calendarDays={data.calendarDays}
              streakDays={data.streakDays}
              todayCheckIn={data.todayCheckIn}
              checkInLoading={data.checkInLoading}
              knowledgeGraph={data.knowledgeGraph}
              knowledgeLoading={data.knowledgeLoading}
              knowledgeError={data.knowledgeError}
              effectiveTier={data.effectiveTier}
            />
          </div>
        )}
      </div>

      {/* ══ 学习启动仪式模态层 ══ */}
      {ritual.showRitual && (
        <StartupRitual
          onComplete={ritual.handleRitualComplete}
          onSkip={ritual.handleRitualSkip}
          lastSession={ritual.lastSession}
          quickTags={ritual.ritualQuickTags}
          streakDays={ritual.ritualStreak}
          soundOn={ritual.ritualSoundOn}
          onSoundToggle={ritual.handleRitualSoundToggle}
          plan={ritual.ritualPlan}
          recentEchoes={ritual.ritualEchoes}
          recallQuestion={ritual.recallQuestion}
        />
      )}

      {/* ══ 仪式反馈 toast（复习卡已安排） ══ */}
      {ritual.ritualToast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-kb-full bg-bg-elevated/95 border border-border/60 shadow-kb-md text-sm text-text-primary animate-fade-in-up"
        >
          {ritual.ritualToast}
        </div>
      )}
    </div>
  );
}
