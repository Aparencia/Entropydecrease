/**
 * WorldView — 「世界」视图：身份与生态
 *
 * 认知任务：知识地图空间化（星座）+ 身份认同（深度计）+ 养成生态（珊瑚缸/月历/成就）。
 * 布局层级：锚点标题 → 知识星座全宽主卡（宪法第六条空间化外壳）→ 留存生态网格 → 成就横幅。
 * 留存行1 三列：[深度计+珊瑚缸纵向组合 | 月历 | 气泡柱]（1fr:1.4fr:1fr，高度 153/182/140 协调）；
 * 行2 成就墙全宽（9 列网格 2 行，避免 4 列 5 行撑爆行高）。
 * retentionEnabled 守卫保留：关闭留存时仅展示星座。
 *
 * @ai-context: dashboard 三视图之世界视图。
 */
import { Suspense, lazy } from 'react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { DashboardCard } from '../DashboardCard';
import BubbleStreak from '../deep-sea/creatures/BubbleStreak';
import AnglerfishAchievements from '../deep-sea/creatures/AnglerfishAchievements';
import CoralReefCalendar from '../deep-sea/creatures/CoralReefCalendar';
import type { DashboardData } from '../../hooks/useDashboardData';

// 留存组件懒加载（世界视图激活时才进入 bundle 执行）
const DepthMeter = lazy(() => import('@/features/retention/components/DepthMeter').then(m => ({ default: m.DepthMeter })));
const CoralEcosystem = lazy(() => import('@/features/retention/components/CoralEcosystem').then(m => ({ default: m.CoralEcosystem })));
const KnowledgeConstellation = lazy(() => import('@/features/constellation/components/KnowledgeConstellation').then(m => ({ default: m.KnowledgeConstellation })));
const KnowledgeSky = lazy(() => import('@/lib/3d/scenes/KnowledgeSky').then(m => ({ default: m.KnowledgeSky })));

interface WorldViewProps {
  retentionEnabled: boolean;
  calendarDays: DashboardData['calendarDays'];
  streakDays: number;
  todayCheckIn: DashboardData['todayCheckIn'];
  checkInLoading: boolean;
  knowledgeGraph: DashboardData['knowledgeGraph'];
  knowledgeLoading: boolean;
  knowledgeError: DashboardData['knowledgeError'];
  effectiveTier: DashboardData['effectiveTier'];
}

export function WorldView({
  retentionEnabled, calendarDays, streakDays, todayCheckIn, checkInLoading,
  knowledgeGraph, knowledgeLoading, knowledgeError, effectiveTier,
}: WorldViewProps) {
  return (
    <div className="pb-rhythm-xl">
      {/* ════ 世界锚点（唯一主标题：视图开场） ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 pt-rhythm-md">
        <ModuleRitualHeader
          title="深海世界"
          note="身份与生态"
          sealChar="界"
          sealColor="#14B8A6"
          compact
          className="mb-rhythm-md"
        />
      </section>

      {/* ════ 知识星座（全宽主卡，世界视图精神中心） ════
          统一高度 h-56（224px）：3D 轨（KnowledgeSky）包固定高度容器与 DOM 轨/fallback 对齐；
          DashboardCard 提供统一卡片表面（双方案分支），星座不再裸渲染。 */}
      <section className="relative max-w-[1100px] mx-auto px-6">
        <DashboardCard className="overflow-hidden">
          <Suspense fallback={<div className="h-56 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
            {effectiveTier === 'high' && knowledgeGraph && !knowledgeGraph.coldStart && knowledgeGraph.nodes.length > 0 ? (
              <div className="h-56">
                <KnowledgeSky graph={knowledgeGraph} />
              </div>
            ) : (
              <KnowledgeConstellation graph={knowledgeGraph} loading={knowledgeLoading} error={knowledgeError} />
            )}
          </Suspense>
        </DashboardCard>
      </section>

      {/* ════ 留存生态区：行1 三列 + 行2 成就横幅 ════
          行1 [组合 | 月历 | 气泡]（1fr:1.4fr:1fr）：三件高度 153/182/140 协调，
          组合列 justify-between 顶天立地吸收高度差；月历 1.4fr 保证 7 列格子 ~47px 可读。
          行2 成就全宽：9 列网格（18 项 2 行）代替 4 列（5 行 371px 撑爆行高）。 */}
      {retentionEnabled && (
        <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-lg">
          {/* 行1：累计深度计+珊瑚缸组合 / 珊瑚礁月历 / 连续打卡状态 */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_1fr] gap-rhythm-sm items-stretch">
            {/* 列1：累计深度计 + 珊瑚生态缸入口（纵向组合，justify-between 顶天立地与行等高） */}
            <div className="flex flex-col justify-between gap-rhythm-xs">
              <Suspense fallback={<div className="h-24 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
                <DepthMeter />
              </Suspense>
              {/* 珊瑚生态缸缩略入口（点击展开全屏，损失规避机制） */}
              <Suspense fallback={<div className="h-12 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
                <CoralEcosystem />
              </Suspense>
            </div>

            {/* 列2：珊瑚礁月历：本月打卡热力图（与气泡计数互补） */}
            <CoralReefCalendar days={calendarDays} month={new Date().getMonth()} year={new Date().getFullYear()} />

            {/* 列3：连续打卡状态条（今日状态即时反馈） */}
            <BubbleStreak streakDays={streakDays} todayChecked={!!todayCheckIn} loading={checkInLoading} />
          </div>

          {/* 行2：灯笼鱼成就墙（全宽徽章横幅） */}
          <div className="mt-rhythm-sm">
            <AnglerfishAchievements />
          </div>
        </section>
      )}
    </div>
  );
}
