/** @file 学习分析页面 — 五维雷达 / 热力图 / 趋势 / 时段推荐 *
 * @ai-context: dashboard 功能模块页面：AnalyticsPage。
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, Activity, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLearningAnalytics } from '../hooks/useLearningAnalytics';
import RadarChart from '../components/RadarChart';
import HeatmapChart from '../components/HeatmapChart';
import TrendChart from '../components/TrendChart';

/* ── 动画 variants ── */
const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};
const headerVariants = {
  hidden: { opacity: 0, y: -16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as const } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as const } },
};

/* ── 时间范围选项 ── */
const TIME_RANGES = [
  { label: '本周', days: 7 },
  { label: '本月', days: 30 },
  { label: '全部', days: 3650 },
] as const;

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, loading, error, refresh } = useLearningAnalytics(days);

  return (
    <motion.div
      className="px-6 py-6 max-w-5xl mx-auto relative"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── 背景环境光 ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        <motion.div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, var(--kb-brand-500) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.05, 0.08, 0.05] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 -left-16 w-56 h-56 rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, var(--kb-accent-400) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.04, 0.06, 0.04] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
      </div>

      {/* ── 页头 ── */}
      <motion.div className="flex items-center justify-between mb-6 relative z-10" variants={headerVariants}>
        <div className="flex items-center gap-3">
          <motion.div
            className="w-10 h-10 rounded-[var(--kb-radius-lg)] bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-[var(--kb-shadow-brand)]"
            whileHover={{ scale: 1.1, rotate: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <BarChart3 className="w-5 h-5 text-white" strokeWidth={1.5} />
          </motion.div>
          <h1 className="text-[var(--kb-text-d2)] text-text-primary font-semibold">学习分析</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 时间范围筛选 */}
          <div className="flex gap-1 rounded-[var(--kb-radius-sm)] bg-bg-tertiary/30 p-1">
            {TIME_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'px-3 py-1 rounded-[6px] text-[12px] font-medium transition-all duration-200',
                  days === r.days
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-text-tertiary hover:text-text-primary',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* 刷新按钮 */}
          <motion.button
            onClick={refresh}
            whileHover={{ rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="p-2 rounded-[var(--kb-radius-sm)] text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/40 transition-colors"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
          </motion.button>
        </div>
      </motion.div>

      {/* ── 错误提示 ── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-[var(--kb-radius-md)] border border-color-error/30 bg-color-error/5 text-[12px] text-color-error"
        >
          {error}
        </motion.div>
      )}

      {/* ── 统计周期 ── */}
      {data?.period && (
        <motion.p variants={headerVariants} className="text-[11px] text-text-tertiary mb-4">
          统计周期：{data.period.start} ~ {data.period.end}
        </motion.p>
      )}

      {/* ── 图表网格 ── */}
      <div className="flex flex-col gap-5 relative z-10">
        {/* Row 1: 雷达图 + 趋势图 */}
        <div className="grid grid-cols-2 gap-5">
          <motion.div variants={cardVariants} className="rounded-[var(--kb-radius-xl)] border border-border/30 bg-bg-elevated/50 backdrop-blur-sm p-5">
            <h2 className="text-[13px] font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
              五维能力
            </h2>
            <RadarChart data={data?.radar ?? []} loading={loading} />
          </motion.div>
          <motion.div variants={cardVariants} className="rounded-[var(--kb-radius-xl)] border border-border/30 bg-bg-elevated/50 backdrop-blur-sm p-5">
            <h2 className="text-[13px] font-semibold text-text-primary mb-3">学习趋势</h2>
            <TrendChart data={data?.trend ?? []} loading={loading} />
          </motion.div>
        </div>

        {/* Row 2: 热力图 */}
        <motion.div variants={cardVariants} className="rounded-[var(--kb-radius-xl)] border border-border/30 bg-bg-elevated/50 backdrop-blur-sm p-5">
          <h2 className="text-[13px] font-semibold text-text-primary mb-4">学习热力图</h2>
          <HeatmapChart data={data?.heatmap ?? []} loading={loading} />
        </motion.div>

        {/* Row 3: 智能时段推荐 */}
        {data?.recommendations?.length ? (
          <motion.div variants={cardVariants}>
            <h2 className="text-[13px] font-semibold text-text-primary mb-3">智能时段推荐</h2>
            <div className="grid grid-cols-3 gap-4">
              {data.recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="rounded-[20px] border border-border/20 bg-bg-elevated/30 backdrop-blur-[12px] p-4 transition-all duration-300 hover:border-brand-400/30 hover:bg-bg-elevated/50 hover:shadow-[var(--kb-shadow-brand)]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-[var(--kb-radius-sm)] bg-brand-500/10 flex items-center justify-center">
                      <Clock className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-brand-500">推荐时段</span>
                      <span className="text-[9px] text-text-tertiary ml-1.5">匹配度 {rec.score}%</span>
                    </div>
                  </div>
                  <p className="text-[12px] text-text-primary leading-relaxed">{rec.reason}</p>
                  <div className="mt-2.5 h-1.5 rounded-full bg-bg-tertiary/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
                      style={{ width: `${rec.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          !loading && (
            <motion.div variants={cardVariants} className="text-center py-12 text-text-tertiary text-[13px]">
              暂无足够数据生成时段推荐，开始学习后将自动分析
            </motion.div>
          )
        )}
      </div>
    </motion.div>
  );
}
