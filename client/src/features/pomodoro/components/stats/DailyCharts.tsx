/**
 * 专注统计页 — 每日深潜数柱状图 + 专注时长趋势折线图区块
 *
 * @ai-context: 从 PomodoroStatsPage 拆分（单文件 ≤300 行规范），
 * recharts 图表封装，数据由页面层计算后传入。
 */
import { motion } from 'framer-motion';
import { Clock, Target } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

export type ChartRange = 7 | 14 | 30;

interface DailyChartData {
  date: string;
  label: string;
  count: number;
  minutes: number;
}

interface DailyChartsProps {
  chartData: DailyChartData[];
  chartRange: ChartRange;
  onChartRangeChange: (r: ChartRange) => void;
}

export function DailyCharts({ chartData, chartRange, onChartRangeChange }: DailyChartsProps) {
  return (
    <>
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
                  onClick={() => onChartRangeChange(r)}
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
    </>
  );
}
