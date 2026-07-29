/**
 * @ai-context: pomodoro 功能模块页面：PomodoroStatsPage。
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Target, Flame, TrendingUp } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, Skeleton, EmptyState, RichTooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { pomodoroSessionStore } from '@/lib/storage';
import type { PomodoroSession } from '@/types/models';

type TimeRange = 'today' | 'week' | 'month';
type ChartRange = 7 | 14 | 30;

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

  useEffect(() => {
    pomodoroSessionStore
      .getAll()
      .then((data) => setSessions(data))
      .finally(() => setIsLoading(false));
  }, []);

  // Filter sessions by range
  const filteredSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((s) => {
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
  }, [sessions, range]);

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

  const maxHours = Math.max(...weeklyData.map((d) => d.hours), 0.1);

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
        label: `${d.getMonth() + 1}/${d.getDate()}`,
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

  const getIntensityClass = (count: number): string => {
    if (count === 0) return 'bg-bg-tertiary';
    if (count <= 2) return 'bg-pomodoro/20';
    if (count <= 4) return 'bg-pomodoro/40';
    if (count <= 6) return 'bg-pomodoro/60';
    return 'bg-pomodoro';
  };

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

  if (sessions.length === 0) {
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

      {/* Time range selector - segmented control */}
      <motion.div
        className="flex items-center gap-kb-xs p-1 bg-bg-secondary/80 backdrop-blur-sm rounded-kb-lg border border-border/40 mb-kb-lg w-fit"
        variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      >
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
      </motion.div>

      {/* Overview cards */}
      <motion.div
        className="grid grid-cols-3 gap-kb-md mb-kb-lg"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
        <Card variant="default" padding="md" className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(91,138,114,0.04) 0%, transparent 60%)' }} />
          <div className="flex flex-col gap-kb-xs relative z-10">
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <Clock className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
              <span className="text-c1">专注时长</span>
            </div>
            <RichTooltip content="今日累计专注时间（分钟）" position="bottom" delay={200}>
              <span className="text-h1 font-semibold text-text-primary font-timer cursor-help">
                {focusTime}
              </span>
            </RichTooltip>
          </div>
        </Card>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
        <Card variant="default" padding="md" className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(91,138,114,0.04) 0%, transparent 60%)' }} />
          <div className="flex flex-col gap-kb-xs relative z-10">
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <Target className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
              <span className="text-c1">完成深潜</span>
            </div>
            <RichTooltip content="今日完成的深潜数量" position="bottom" delay={200}>
              <span className="text-h1 font-semibold text-text-primary font-timer cursor-help">
                {pomodoroCount}
              </span>
            </RichTooltip>
          </div>
        </Card>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
        <Card variant="default" padding="md" className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.04) 0%, transparent 60%)' }} />
          <div className="flex flex-col gap-kb-xs relative z-10">
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <Flame className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
              <span className="text-c1">连续天数</span>
            </div>
            <span className="text-h1 font-semibold text-text-primary font-timer">
              {streak}
            </span>
          </div>
        </Card>
        </motion.div>
      </motion.div>

      {/* Bar chart - weekly focus */}
      <motion.div variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-lg">
        <div className="flex items-center gap-2 mb-kb-md">
          <TrendingUp className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">本周专注趋势</h2>
        </div>

        <div className="flex items-end justify-between gap-2 h-32">
          {weeklyData.map((d, i) => {
            const heightPct = (d.hours / maxHours) * 100;
            const isToday = i === weeklyData.length - 1;
            return (
              <div key={`${d.day}-${i}`} className="flex flex-col items-center flex-1 gap-1">
                <span className="text-c2 text-text-tertiary">{d.hours}h</span>
                <motion.div
                  className={cn(
                    'w-full rounded-t-kb-sm transition-colors duration-kb-normal',
                    isToday
                      ? 'bg-brand-600'
                      : 'bg-brand-200/60',
                  )}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(heightPct, 4)}%` }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const, delay: 0.2 + i * 0.06 }}
                  whileHover={{ scaleX: 1.15, filter: 'brightness(1.15)' }}
                />
                <span className="text-c2 text-text-tertiary">{d.day}</span>
              </div>
            );
          })}
        </div>
      </Card>
      </motion.div>

      {/* Heatmap - focus intensity */}
      <motion.div variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-lg">
        <h2 className="text-h3 font-medium text-text-primary mb-kb-md">专注热力图</h2>

        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-fit">
            {heatmap.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((count, di) => (
                  <motion.div
                    key={di}
                    className={cn(
                      'w-3 h-3 rounded-[3px] transition-colors duration-kb-fast',
                      getIntensityClass(count),
                    )}
                    whileHover={{ scale: 1.8, borderRadius: '2px' }}
                    transition={{ duration: 0.15 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-kb-xs mt-kb-sm text-c1 text-text-tertiary">
          <span>少</span>
          <div className="w-3 h-3 rounded-[3px] bg-bg-tertiary" />
          <div className="w-3 h-3 rounded-[3px] bg-pomodoro/20" />
          <div className="w-3 h-3 rounded-[3px] bg-pomodoro/40" />
          <div className="w-3 h-3 rounded-[3px] bg-pomodoro/60" />
          <div className="w-3 h-3 rounded-[3px] bg-pomodoro" />
          <span>多</span>
        </div>
      </Card>
      </motion.div>

      {/* 每日番茄数柱状图 */}
      <motion.div variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}>
      <Card variant="default" padding="lg" className="mb-kb-lg">
        <div className="flex items-center justify-between mb-kb-md">
          <div className="flex items-center gap-2">
            <Target className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
            <h2 className="text-h3 font-medium text-text-primary">每日深潜数</h2>
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-bg-secondary rounded-kb-md border border-border/30">
            {([7, 14, 30] as ChartRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={cn(
                  'px-2.5 py-1 rounded-kb-sm text-c1 font-medium transition-all duration-kb-fast',
                  chartRange === r
                    ? 'bg-bg-elevated text-text-primary shadow-kb-sm'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                {r}天
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--kb-border, #e5e7eb)" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--kb-text-tertiary, #9ca3af)' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--kb-text-tertiary, #9ca3af)' }} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: 'var(--kb-bg-elevated, #fff)', border: '1px solid var(--kb-border, #e5e7eb)', borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [`${value} 个`, '深潜数']}
              labelFormatter={(label) => `日期: ${label}`}
            />
            <Bar dataKey="count" fill="#7C3AED" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      </motion.div>

      {/* 每日专注时长折线图 */}
      <motion.div variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}>
      <Card variant="default" padding="lg">
        <div className="flex items-center gap-2 mb-kb-md">
          <Clock className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">专注时长趋势</h2>
        </div>

        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--kb-border, #e5e7eb)" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--kb-text-tertiary, #9ca3af)' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--kb-text-tertiary, #9ca3af)' }} tickLine={false} width={36} unit="m" />
            <Tooltip
              contentStyle={{ background: 'var(--kb-bg-elevated, #fff)', border: '1px solid var(--kb-border, #e5e7eb)', borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [`${value} 分钟`, '专注时长']}
              labelFormatter={(label) => `日期: ${label}`}
            />
            <Line
              type="monotone"
              dataKey="minutes"
              stroke="#7C3AED"
              strokeWidth={2}
              dot={{ r: 3, fill: '#7C3AED' }}
              activeDot={{ r: 5, fill: '#7C3AED' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      </motion.div>
    </motion.div>
  );
}
