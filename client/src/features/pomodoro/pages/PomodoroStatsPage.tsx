/**
 * 专注统计页（装配页）
 *
 * @ai-context: 数据加载/聚合留在本页，图表与卡片区块已拆至
 * components/stats/（单文件 ≤300 行规范）。
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { Card, Skeleton, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { pomodoroSessionStore, pomodoroPresetStore } from '@/lib/storage';
import type { PomodoroSession, PomodoroPreset } from '@/types/models';
import { StatsCards, WeeklyTrendChart, HeatmapChart } from '../components/stats/OverviewCharts';
import { DailyCharts, type ChartRange } from '../components/stats/DailyCharts';

type TimeRange = 'today' | 'week' | 'month';

/** 数据窗口：91 天（热力图周期），范围查询替代全表加载 */
const DATA_WINDOW_DAYS = 91;

const RANGE_LABELS: Record<TimeRange, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
};

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

// Helpers
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }
  return `${minutes}`;
}

function computeStreak(sessions: PomodoroSession[]): number {
  if (sessions.length === 0) return 0;
  const daySet = new Set(
    sessions.map((s) => getDayKey(new Date(s.completedAt))),
  );
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(today);
  while (daySet.has(getDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function PomodoroStatsPage() {
  const [range, setRange] = useState<TimeRange>('today');
  const [chartRange, setChartRange] = useState<ChartRange>(7);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 按预设分组筛选（A5：会话已带 presetId，统计页补上分组视图）
  const [presets, setPresets] = useState<PomodoroPreset[]>([]);
  const [presetFilter, setPresetFilter] = useState<string>('all');

  useEffect(() => {
    // 范围查询：仅取数据窗口内会话（索引 completedAt），替代全表 getAll
    const since = new Date(Date.now() - DATA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    pomodoroSessionStore
      .getTable()
      .where('completedAt').aboveOrEqual(since)
      .toArray()
      .then((data) => setSessions(data))
      .finally(() => setIsLoading(false));
    pomodoroPresetStore.getAll().then(setPresets).catch(() => {});
  }, []);

  // Filter sessions by range
  const filteredSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((s) => {
      // 预设筛选：'all' 不过滤；'none' = 旧数据无 presetId
      if (presetFilter === 'none') {
        if (s.presetId) return false;
      } else if (presetFilter !== 'all' && s.presetId !== presetFilter) {
        return false;
      }
      const d = new Date(s.completedAt);
      if (range === 'today') return isSameDay(d, now);
      if (range === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return d >= weekAgo;
      }
      // month
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return d >= monthAgo;
    });
  }, [sessions, range, presetFilter]);

  // Stats
  const focusTime = useMemo(
    () =>
      formatDuration(
        filteredSessions.reduce((sum, s) => sum + s.actualDuration, 0),
      ),
    [filteredSessions],
  );
  const pomodoroCount = filteredSessions.length;
  const streak = useMemo(() => computeStreak(sessions), [sessions]);

  // Weekly trend: last 7 days
  const weeklyData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { day: string; hours: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDayKey(d);
      const totalSec = sessions
        .filter((s) => getDayKey(new Date(s.completedAt)) === key)
        .reduce((sum, s) => sum + s.actualDuration, 0);
      days.push({ day: DAY_NAMES[d.getDay()], hours: +(totalSec / 3600).toFixed(1) });
    }
    return days;
  }, [sessions]);

  // 图表数据：按日期聚合番茄数量和专注时长
  const chartData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { date: string; label: string; count: number; minutes: number }[] = [];
    for (let i = chartRange - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDayKey(d);
      const daySessions = sessions.filter((s) => getDayKey(new Date(s.completedAt)) === key);
      const totalSec = daySessions.reduce((sum, s) => sum + s.actualDuration, 0);
      days.push({
        date: key,
        label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`,
        count: daySessions.length,
        minutes: +(totalSec / 60).toFixed(1),
      });
    }
    return days;
  }, [sessions, chartRange]);

  // Heatmap: last 91 days (13 weeks x 7 days)
  const heatmap = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Build day->count map
    const countMap = new Map<string, number>();
    sessions.forEach((s) => {
      const key = getDayKey(new Date(s.completedAt));
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });
    // 13 weeks x 7 days = 91 days, arranged as columns of weeks
    const weeks: number[][] = [];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 90);
    // Align to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());
    let currentWeek: number[] = [];
    const cursor = new Date(startDate);
    while (cursor <= today) {
      const key = getDayKey(cursor);
      currentWeek.push(countMap.get(key) || 0);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(0);
      weeks.push(currentWeek);
    }
    return weeks;
  }, [sessions]);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-kb-md py-kb-lg">
        <h1 className="text-h1 font-semibold text-text-primary mb-kb-lg">专注统计</h1>
        <div className="grid grid-cols-3 gap-kb-md mb-kb-lg">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} variant="default" padding="md">
              <Skeleton lines={2} height="1.5rem" />
            </Card>
          ))}
        </div>
        <Card variant="default" padding="lg" className="mb-kb-lg">
          <Skeleton variant="rectangular" height="128px" />
        </Card>
        <Card variant="default" padding="lg">
          <Skeleton variant="rectangular" height="100px" />
        </Card>
      </div>
    );
  }

  if (filteredSessions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-kb-md py-kb-lg">
        <h1 className="text-h1 font-semibold text-text-primary mb-kb-lg">专注统计</h1>
        <Card variant="default" padding="lg">
          <EmptyState
            icon={<Clock className="w-12 h-12" strokeWidth={1.2} />}
            title="暂无专注记录"
            description="完成一次深潜后，这里会展示你的专注数据统计"
          />
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      className="max-w-2xl mx-auto px-kb-md py-kb-lg"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }}
    >
      {/* Page title */}
      <motion.h1
        className="text-h1 font-semibold text-text-primary mb-kb-lg"
        variants={{ hidden: { opacity: 0, y: -12, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}
      >专注统计</motion.h1>

      {/* Time range selector - segmented control + 预设分组筛选 */}
      <motion.div
        className="flex flex-wrap items-center gap-kb-sm mb-kb-lg"
        variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      >
        <div className="flex items-center gap-kb-xs p-1 bg-bg-secondary/80 backdrop-blur-sm rounded-kb-lg border border-border/40 w-fit">
          {(['today', 'week', 'month'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-4 py-1.5 rounded-kb-md text-b2 font-medium',
                'transition-all duration-kb-fast ease-kb-default',
                'hover:scale-[1.02] active:scale-[0.98]',
                range === r
                  ? 'bg-bg-elevated text-text-primary shadow-kb-sm border border-border/30'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        {/* 按预设分组（A5）：会话已带 presetId，支持按学习场景查看统计 */}
        <select
          value={presetFilter}
          onChange={(e) => setPresetFilter(e.target.value)}
          aria-label="按预设筛选"
          className="bg-bg-secondary/80 border border-border/40 rounded-kb-md px-2.5 py-1.5 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        >
          <option value="all">全部预设</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value="none">未分组（旧数据）</option>
        </select>
      </motion.div>

      <StatsCards focusTime={focusTime} pomodoroCount={pomodoroCount} streak={streak} />
      <WeeklyTrendChart weeklyData={weeklyData} />
      <HeatmapChart heatmap={heatmap} />
      <DailyCharts chartData={chartData} chartRange={chartRange} onChartRangeChange={setChartRange} />
    </motion.div>
  );
}
