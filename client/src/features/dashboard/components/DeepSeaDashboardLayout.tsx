/**
 * @ai-context: 通用组件：DeepSeaDashboardLayout。
 */
import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Timer, FileText, Layers, Lightbulb,
  Activity, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DeepSeaContainer from './deep-sea/DeepSeaContainer';
import type { ActivityItem } from './deep-sea/creatures/PlanktonStream';

/* ── 深海生物组件懒加载（减少 Dashboard 初始 bundle 体积） ── */
const BubbleStreak = lazy(() => import('./deep-sea/creatures/BubbleStreak'));
const CoralReefCalendar = lazy(() => import('./deep-sea/creatures/CoralReefCalendar'));
const AnglerfishAchievements = lazy(() => import('./deep-sea/creatures/AnglerfishAchievements'));
const NeuronGalaxy = lazy(() => import('./deep-sea/creatures/NeuronGalaxy'));
const JellyfishRadar = lazy(() => import('./deep-sea/creatures/JellyfishRadar'));
const JellyfishTrend = lazy(() => import('./deep-sea/creatures/JellyfishTrend'));
const PlanktonStream = lazy(() => import('./deep-sea/creatures/PlanktonStream'));
const PearlGoal = lazy(() => import('./deep-sea/creatures/PearlGoal'));

import HeatmapChart from './HeatmapChart';
import type { StarPoint } from '@/components/ui/KnowledgeGalaxy';
import type { AnalyticsAggregate } from '../types/analytics';

/* ── 快速操作 ── */
const quickActions = [
  { label: '深潜', icon: Timer, path: '/pomodoro', accent: 'pomodoro' as const, gradient: 'from-brand-400/20 to-brand-600/10' },
  { label: '结礁', icon: FileText, path: '/notes', accent: 'note' as const, gradient: 'from-note/20 to-note/5' },
  { label: '反衰减呼吸', icon: Layers, path: '/flashcards', accent: 'flashcard' as const, gradient: 'from-flashcard/20 to-flashcard/5' },
  { label: '浮出水面', icon: Lightbulb, path: '/feynman', accent: 'feynman' as const, gradient: 'from-feynman/20 to-feynman/5' },
];

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
};

export type { ActivityItem } from './deep-sea/creatures/PlanktonStream';

interface DeepSeaDashboardLayoutProps {
  elasticProgress: number;
  streakDays: number;
  todayCheckIn: boolean;
  checkInLoading: boolean;
  calendarDays: { day: number | null; checked: boolean; isToday: boolean }[];
  analytics?: AnalyticsAggregate | null;
  analyticsLoading: boolean;
  starPoints: StarPoint[];
  recentActivities: ActivityItem[];
  isLoading: boolean;
}

export default function DeepSeaDashboardLayout({
  elasticProgress,
  streakDays,
  todayCheckIn,
  checkInLoading,
  calendarDays,
  analytics,
  analyticsLoading,
  starPoints,
  recentActivities,
  isLoading,
}: DeepSeaDashboardLayoutProps) {
  const navigate = useNavigate();
  const [analyticsDays, setAnalyticsDays] = useState(30);

  return (
    <DeepSeaContainer
      elasticProgress={elasticProgress}
      layers={[
        {
          zone: 'surface' as const,
          label: '海面 -- 今日核心',
          children: (
            <div className="flex flex-col gap-2.5">
              {/* Row 1: 气泡柱 + 珊瑚礁日历 */}
              <div className="grid grid-cols-[160px_1fr] gap-2.5">
                <Suspense fallback={null}>
                  <BubbleStreak streakDays={streakDays} todayChecked={todayCheckIn} loading={checkInLoading} />
                </Suspense>
                <Suspense fallback={null}>
                  <CoralReefCalendar days={calendarDays} month={new Date().getMonth()} year={new Date().getFullYear()} />
                </Suspense>
              </div>
              {/* Row 2: 快速开始 */}
              <motion.section className="flex flex-col gap-1.5" variants={itemVariants}>
                <h2 className="text-[11px] font-semibold text-cyan-200/70">快速开始</h2>
                <div className="grid grid-cols-4 gap-2">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <motion.button
                        key={action.path}
                        onClick={() => navigate(action.path)}
                        whileHover={{ y: -2, scale: 1.03 }}
                        whileTap={{ scale: 0.96 }}
                        className={cn(
                          'group flex flex-col items-center gap-1.5 rounded-[var(--kb-radius-lg)]',
                          'border border-cyan-400/15 bg-bg-elevated/30 backdrop-blur-sm',
                          'p-2 transition-all duration-300',
                          'hover:border-cyan-400/30 hover:shadow-[0_0_16px_rgba(34,211,238,0.08)]',
                        )}
                      >
                        <div className={cn('p-1.5 rounded-[var(--kb-radius-sm)] bg-gradient-to-br transition-all duration-300', action.gradient)}>
                          <Icon className="w-4 h-4" strokeWidth={1.5} />
                        </div>
                        <span className="text-[10px] font-medium text-cyan-200/70">{action.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.section>
            </div>
          ),
        },
        {
          zone: 'sunlight' as const,
          label: '透光层 -- 近期活跃',
          children: (
            <div className="grid grid-cols-2 gap-2.5">
              <Suspense fallback={null}>
                <JellyfishRadar data={analytics?.radar ?? []} loading={analyticsLoading} />
              </Suspense>
              <Suspense fallback={null}>
                <JellyfishTrend data={analytics?.trend ?? []} loading={analyticsLoading} />
              </Suspense>
            </div>
          ),
        },
        {
          zone: 'twilight' as const,
          label: '中层 -- 知识结构',
          children: (
            <div className="flex flex-col gap-2.5">
              {/* 学习分析 -- 时间范围控制 */}
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold text-cyan-200/70 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400/60" strokeWidth={1.5} />
                  学习分析
                </h2>
                <div className="flex gap-0.5 rounded-[8px] bg-bg-tertiary/20 p-0.5">
                  {[{ l: '7天', d: 7 }, { l: '30天', d: 30 }, { l: '全部', d: 3650 }].map((r) => (
                    <button
                      key={r.d}
                      onClick={() => setAnalyticsDays(r.d)}
                      className={cn(
                        'px-2 py-0.5 rounded-[6px] text-[9px] font-medium transition-all duration-200',
                        analyticsDays === r.d
                          ? 'bg-cyan-400/20 text-cyan-200'
                          : 'text-text-tertiary/60 hover:text-cyan-200/60',
                      )}
                    >
                      {r.l}
                    </button>
                  ))}
                </div>
              </div>
              <Suspense fallback={null}>
                <NeuronGalaxy points={starPoints} />
              </Suspense>
              <div className="rounded-[var(--kb-radius-lg)] border border-cyan-400/15 bg-bg-elevated/20 backdrop-blur-sm p-3">
                <h3 className="text-[10px] font-medium text-cyan-200/60 mb-2">学习热力图</h3>
                <HeatmapChart data={analytics?.heatmap ?? []} loading={analyticsLoading} />
              </div>
              {/* 智能时段推荐 */}
              {analytics?.recommendations?.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {analytics.recommendations.map((rec, i) => (
                    <div key={i} className="rounded-[var(--kb-radius-lg)] border border-cyan-400/10 bg-bg-elevated/20 backdrop-blur-sm p-2.5 transition-all duration-300 hover:border-cyan-400/25">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock className="w-3 h-3 text-cyan-400/60" strokeWidth={1.5} />
                        <span className="text-[9px] font-semibold text-cyan-300/60">推荐时段</span>
                        <span className="text-[8px] text-text-tertiary/40">{rec.score}%</span>
                      </div>
                      <p className="text-[10px] text-text-primary/70 leading-relaxed">{rec.reason}</p>
                      <div className="mt-1.5 h-1 rounded-full bg-bg-tertiary/20 overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-400/40 transition-all duration-500" style={{ width: `${rec.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          zone: 'midnight' as const,
          label: '深渊 -- 长期沉淀',
          children: (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <Suspense fallback={null}>
                  <AnglerfishAchievements />
                </Suspense>
                <Suspense fallback={null}>
                  <PlanktonStream
                    activities={recentActivities.map((a) => ({ icon: a.icon, text: a.text, time: a.time, accent: a.accent, timestamp: a.timestamp }))}
                    loading={isLoading}
                  />
                </Suspense>
              </div>
              <Suspense fallback={null}>
                <PearlGoal goals={analytics?.goals ?? []} loading={analyticsLoading} />
              </Suspense>
            </div>
          ),
        },
      ]}
    />
  );
}
