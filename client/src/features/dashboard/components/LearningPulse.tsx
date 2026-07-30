/**
 * LearningPulse — 学习强度波形可视化
 * - 使用 recharts AreaChart 绘制学习强度曲线
 * - 品牌色渐变填充（深色靛蓝→赛博青，浅色蓝→琥珀）
 * - 呼吸动画（scale Y轴 ±2%，周期 4秒）
 * - reduced-motion 时禁用呼吸
 *
 * @ai-context: 通用组件：LearningPulse。
 */
import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { TrendPoint } from '../types/analytics';

interface LearningPulseProps {
  data: TrendPoint[];
  loading?: boolean;
}

export default function LearningPulse({ data, loading }: LearningPulseProps) {
  const reducedMotion = useReducedMotion();

  // 确保至少有7个数据点用于展示
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      // 生成占位数据
      return Array.from({ length: 7 }, (_, i) => ({
        date: `Day ${i + 1}`,
        value: 0,
      }));
    }
    return data.slice(-14); // 最近14天
  }, [data]);

  if (loading) {
    return (
      <div className="w-full h-[180px] rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />
    );
  }

  return (
    <section className="relative w-full">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-rhythm-sm">
        <div className="p-1.5 rounded-kb-sm bg-brand-500/10">
          <Activity className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
        </div>
        <h2 className="text-b2 font-semibold text-text-primary">学习脉搏</h2>
        <span className="text-c1 text-text-tertiary ml-auto">近14天学习强度</span>
      </div>

      {/* 曲线容器 - 呼吸动画 */}
      <motion.div
        className="relative w-full h-[180px] rounded-kb-xl overflow-hidden border border-border/20 bg-bg-elevated/20 backdrop-blur-sm"
        animate={reducedMotion ? {} : {
          scaleY: [1, 1.02, 1, 0.98, 1],
        }}
        transition={reducedMotion ? {} : {
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ transformOrigin: 'center bottom' }}
      >
        {/* 交融渐变背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-400/[0.03] via-transparent to-accent-400/[0.05] pointer-events-none" />

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pulseGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--kb-brand-500)" stopOpacity={0.8} />
                <stop offset="100%" stopColor="var(--kb-accent-500)" stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--kb-brand-500)" stopOpacity={0.3} />
                <stop offset="50%" stopColor="var(--kb-accent-500)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="var(--kb-brand-500)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--kb-text-tertiary)', fontSize: 10 }}
              tickFormatter={(val: string) => {
                // 显示日期的日部分
                const parts = val.split('-');
                return parts.length === 3 ? `${parseInt(parts[2])}日` : val;
              }}
            />
            <YAxis hide />
            <Area
              type="monotone"
              dataKey="value"
              stroke="url(#pulseGradient)"
              strokeWidth={2.5}
              fill="url(#pulseFill)"
              animationDuration={1200}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
    </section>
  );
}
