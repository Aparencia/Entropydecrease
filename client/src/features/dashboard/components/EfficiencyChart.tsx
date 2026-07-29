/**
 * @ai-context: 通用组件：EfficiencyChart。
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { PomodoroSession, FlashcardReview, FeynmanNote, StudyCheckIn } from '@/types/models';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EfficiencyData {
  pomodoroSessions: PomodoroSession[];
  flashcardReviews: FlashcardReview[];
  feynmanNotes: FeynmanNote[];
  studyCheckIns: StudyCheckIn[];
}

// ─── Color tokens ────────────────────────────────────────────────────────────

const BRAND_500 = '#5B8A72';
const SUCCESS_500 = '#66D9A0';
const WARNING_500 = '#C4956A';
const ERROR_500 = '#FF6B6B';
const PIE_COLORS = [BRAND_500, SUCCESS_500, WARNING_500, ERROR_500];

// ─── Animation helpers ───────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
};

// ─── Glass Card wrapper ──────────────────────────────────────────────────────

function GlassCard({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      variants={cardVariants}
      transition={{ delay }}
      className={`relative rounded-[var(--kb-radius-lg)] bg-bg-secondary/60 backdrop-blur-xl border border-border/30
        hover:border-brand-400/20 transition-colors duration-300 overflow-hidden p-kb-lg ${className}`}
    >
      {/* subtle top gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/30 to-transparent" />
      {children}
    </motion.div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().split('T')[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function shortLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// ─── Sub-component: Study Trend Line Chart ───────────────────────────────────

function StudyTrendChart({ sessions }: { sessions: PomodoroSession[] }) {
  const data = useMemo(() => {
    const cutoff = daysAgo(30);
    const map = new Map<string, number>();
    for (let i = 29; i >= 0; i--) map.set(daysAgo(i), 0);
    sessions.forEach((s) => {
      const dateStr = toDateStr(s.completedAt);
      if (dateStr >= cutoff) map.set(dateStr, (map.get(dateStr) ?? 0) + s.actualDuration);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, seconds]) => ({ date: shortLabel(date), minutes: Math.round(seconds / 60) }));
  }, [sessions]);

  return (
    <GlassCard>
      <h3 className="text-h2 text-text-primary mb-kb-md font-semibold">学习趋势（近 30 天）</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)', strokeOpacity: 0.3 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}m`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(var(--color-bg-elevated-rgb, 30,30,30), 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(91,138,114,0.2)',
                borderRadius: '12px',
                fontSize: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              }}
              formatter={(value) => [`${Number(value)} 分钟`, '学习时长']}
            />
            <Line
              type="monotone"
              dataKey="minutes"
              stroke={BRAND_500}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: BRAND_500, stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

// ─── Sub-component: Module Time Pie Chart ────────────────────────────────────

function ModuleTimePieChart({
  sessions, reviews, feynmanNotes,
}: {
  sessions: PomodoroSession[];
  reviews: FlashcardReview[];
  feynmanNotes: FeynmanNote[];
}) {
  const data = useMemo(() => {
    const pomodoroMin = sessions.reduce((sum, s) => sum + s.actualDuration, 0) / 60;
    const flashcardMin = reviews.reduce((sum, r) => sum + (r.timeSpent ?? 0), 0) / 60;
    const feynmanMin = feynmanNotes.reduce((sum, n) => {
      const diffSec = Math.max(0, (new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime()) / 1000);
      return sum + diffSec;
    }, 0) / 60;
    return [
      { name: '深潜', value: Math.round(pomodoroMin) },
      { name: '反衰减呼吸复习', value: Math.round(flashcardMin) },
      { name: '浮出水面学习', value: Math.round(feynmanMin) },
    ].filter((d) => d.value > 0);
  }, [sessions, reviews, feynmanNotes]);

  if (data.length === 0) {
    return (
      <GlassCard>
        <h3 className="text-h2 text-text-primary mb-kb-md font-semibold">模块时间占比</h3>
        <div className="h-64 flex items-center justify-center">
          <span className="text-b2 text-text-tertiary">暂无数据</span>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <h3 className="text-h2 text-text-primary mb-kb-md font-semibold">模块时间占比</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              animationBegin={200}
              animationDuration={800}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value: string) => <span className="text-b2 text-text-secondary">{value}</span>}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(var(--color-bg-elevated-rgb, 30,30,30), 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(91,138,114,0.2)',
                borderRadius: '12px',
                fontSize: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              }}
              formatter={(value) => [`${Number(value)} 分钟`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

// ─── Sub-component: Check-In Heatmap ─────────────────────────────────────────

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function getHeatColor(moduleCount: number): string {
  if (moduleCount === 0) return 'bg-bg-tertiary/50';
  if (moduleCount <= 1) return 'bg-brand-200';
  if (moduleCount <= 2) return 'bg-brand-400';
  return 'bg-brand-600';
}

function CheckInHeatmap({ checkIns }: { checkIns: StudyCheckIn[] }) {
  const grid = useMemo(() => {
    const dateMap = new Map<string, number>();
    checkIns.forEach((c) => dateMap.set(c.date, c.modulesUsed.length));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 89);
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + mondayOffset);
    const weeks: { date: string; count: number }[][] = [];
    const cursor = new Date(startDate);
    while (cursor <= today || weeks.length < 13) {
      const week: { date: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = cursor.toISOString().split('T')[0];
        week.push({ date: dateStr, count: dateMap.get(dateStr) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      if (cursor > today && weeks.length >= 13) break;
    }
    return weeks;
  }, [checkIns]);

  return (
    <GlassCard>
      <h3 className="text-h2 text-text-primary mb-kb-md font-semibold">打卡热力图（近 90 天）</h3>

      {/* Legend */}
      <div className="flex items-center gap-2 mb-kb-sm text-c1 text-text-tertiary">
        <span>少</span>
        <span className="w-3 h-3 rounded-sm bg-bg-tertiary/50" />
        <span className="w-3 h-3 rounded-sm bg-brand-200" />
        <span className="w-3 h-3 rounded-sm bg-brand-400" />
        <span className="w-3 h-3 rounded-sm bg-brand-600" />
        <span>多</span>
      </div>

      {/* Grid */}
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 mr-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={i} className="w-4 h-4 flex items-center justify-end pr-1">
              {i % 2 === 0 && <span className="text-[10px] text-text-tertiary leading-none">{label}</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {grid.map((week, wi) => (
            <motion.div
              key={wi}
              className="flex flex-col gap-1"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: wi * 0.02 }}
            >
              {week.map((day, di) => (
                <motion.div
                  key={di}
                  className={`w-4 h-4 rounded-sm ${getHeatColor(day.count)} cursor-default`}
                  title={`${day.date}: ${day.count} 个模块`}
                  whileHover={{ scale: 1.5, zIndex: 10 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                />
              ))}
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function EfficiencyChart({ data }: { data: EfficiencyData }) {
  return (
    <motion.div
      className="space-y-kb-lg"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
      }}
    >
      <StudyTrendChart sessions={data.pomodoroSessions} />
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-kb-lg"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        <ModuleTimePieChart
          sessions={data.pomodoroSessions}
          reviews={data.flashcardReviews}
          feynmanNotes={data.feynmanNotes}
        />
        <CheckInHeatmap checkIns={data.studyCheckIns} />
      </motion.div>
    </motion.div>
  );
}
