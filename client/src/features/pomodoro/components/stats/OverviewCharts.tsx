/**
 * 专注统计页 — 概览卡片 + 周趋势 + 热力图区块
 *
 * @ai-context: 从 PomodoroStatsPage 拆分（单文件 ≤300 行规范），
 * 纯展示组件，数据由页面层计算后传入。
 */
import { motion } from 'framer-motion';
import { Clock, Target, Flame, TrendingUp } from 'lucide-react';
import { Card, RichTooltip } from '@/components/ui';
import { cn } from '@/lib/utils';

interface StatsCardsProps {
  focusTime: string;
  pomodoroCount: number;
  streak: number;
}

export function StatsCards({ focusTime, pomodoroCount, streak }: StatsCardsProps) {
  return (
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
  );
}

interface WeeklyTrendChartProps {
  weeklyData: { day: string; hours: number }[];
}

export function WeeklyTrendChart({ weeklyData }: WeeklyTrendChartProps) {
  const maxHours = Math.max(...weeklyData.map((d) => d.hours), 0.1);

  return (
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
  );
}

interface HeatmapChartProps {
  heatmap: number[][];
}

export function HeatmapChart({ heatmap }: HeatmapChartProps) {
  const getIntensityClass = (count: number): string => {
    if (count === 0) return 'bg-bg-tertiary';
    if (count <= 2) return 'bg-pomodoro/20';
    if (count <= 4) return 'bg-pomodoro/40';
    if (count <= 6) return 'bg-pomodoro/60';
    return 'bg-pomodoro';
  };

  return (
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
  );
}
