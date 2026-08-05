/** @file 学习分析页面 — 五维雷达 / 热力图 / 趋势 / 时段推荐 *
 * @ai-context: dashboard 功能模块页面：AnalyticsPage。
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, Activity, RefreshCw, FileText, Repeat, Lightbulb, Timer, TrendingUp, TrendingDown, Minus, Share2, Download, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal, Button } from '@/components/ui';
import { useLearningAnalytics } from '../hooks/useLearningAnalytics';
import RadarChart from '../components/RadarChart';
import HeatmapChart from '../components/HeatmapChart';
import TrendChart from '../components/TrendChart';
import type { WeeklySummary } from '../types/analytics';
import { renderShareCard } from '@/features/share/lib/renderShareCard';

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

      {/* ── 本周回顾（W1 周报摘要）── */}
      {data && !loading && (
        <WeeklyReviewCard summary={data.weekly} />
      )}

      {/* ── 心流通道（P32 挑战-技能匹配）── */}
      {data && !loading && (
        <FlowChannelCard
          cells={data.flow.cells}
          insight={data.flow.insight}
        />
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
            <RadarChart data={data?.radar ?? []} loading={loading} drill={data?.drill} />
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

/* ── 本周回顾卡片（W1）── */
function WeeklyReviewCard({ summary }: { summary: WeeklySummary }) {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  const minutesLabel = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`);
  const delta = summary.totalMinutes - summary.prevTotalMinutes;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaCls = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-amber-400' : 'text-text-tertiary';

  /** 生成分享卡预览（不含隐私数据，只有聚合统计） */
  const handleShare = async () => {
    setShareOpen(true);
    setShareLoading(true);
    setShareUrl(null);
    const url = await renderShareCard(summary);
    setShareUrl(url);
    setShareLoading(false);
  };

  /** 关闭分享弹窗时释放 blob URL（防内存泄漏） */
  const handleCloseShare = () => {
    setShareOpen(false);
    if (shareUrl) {
      URL.revokeObjectURL(shareUrl);
      setShareUrl(null);
    }
  };

  const handleDownload = () => {
    if (!shareUrl) return;
    const a = document.createElement('a');
    a.href = shareUrl;
    a.download = `entropy-weekly-${summary.weekStart}.png`;
    a.click();
  };

  const items = [
    { icon: Timer, label: '本周深潜', value: minutesLabel(summary.totalMinutes), sub: `上周 ${minutesLabel(summary.prevTotalMinutes)}` },
    { icon: FileText, label: '结礁', value: String(summary.noteCount), sub: '篇笔记' },
    { icon: Repeat, label: '反衰减呼吸', value: String(summary.reviewCount), sub: '次复习' },
    { icon: Lightbulb, label: '浮出水面', value: String(summary.feynmanCount), sub: '次费曼' },
    { icon: Activity, label: '复习及时率', value: summary.reviewTimeliness === null ? '—' : `${summary.reviewTimeliness}%`, sub: summary.reviewTimeliness === null ? '样本不足' : '到期后如期复习' },
    { icon: Clock, label: '掌握度变化', value: summary.masteryDelta === null ? '—' : `${summary.masteryDelta > 0 ? '+' : ''}${summary.masteryDelta}d`, sub: summary.masteryDelta === null ? '样本不足' : '平均复习间隔变化' },
  ];

  return (
    <motion.div
      variants={cardVariants}
      className="mb-5 rounded-[var(--kb-radius-xl)] border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.06] to-transparent backdrop-blur-sm p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
          <span className="text-[15px]">🌊</span> 本周回顾
          <span className="text-[10px] font-normal text-text-tertiary">{summary.weekStart} ~ {summary.weekEnd}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleShare()}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-tertiary transition-colors hover:text-brand-400 hover:bg-brand-500/10"
            aria-label="生成学习成果分享卡"
          >
            <Share2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            分享
          </button>
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', deltaCls)}>
            <DeltaIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
            较上周 {delta >= 0 ? '+' : ''}{minutesLabel(Math.abs(delta))}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} className="rounded-[16px] border border-border/20 bg-bg-elevated/30 p-3 transition-colors hover:border-brand-400/30">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
                <span className="text-[10px] text-text-tertiary">{it.label}</span>
              </div>
              <div className="text-[17px] font-bold text-text-primary tabular-nums leading-tight">{it.value}</div>
              <div className="text-[9px] text-text-tertiary mt-0.5 truncate">{it.sub}</div>
            </div>
          );
        })}
      </div>

      {/* 分享卡预览（仅聚合统计，无隐私数据） */}
      <Modal
        open={shareOpen}
        onClose={handleCloseShare}
        title="本周学习回顾 · 分享卡"
        description="只包含聚合统计，不含任何个人信息"
        size="md"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={handleCloseShare}>
              关闭
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={handleDownload}
              disabled={!shareUrl}
            >
              下载 PNG
            </Button>
          </>
        }
      >
        {shareLoading ? (
          <div className="flex h-56 items-center justify-center text-[12px] text-text-tertiary">
            生成中…
          </div>
        ) : shareUrl ? (
          <img
            src={shareUrl}
            alt="本周学习回顾分享卡"
            className="w-full rounded-[var(--kb-radius-lg)] border border-border/20"
          />
        ) : (
          <div className="flex h-56 items-center justify-center text-[12px] text-text-tertiary">
            生成失败，请重试
          </div>
        )}
      </Modal>
    </motion.div>
  );
}

/* ── 心流通道卡片（P32）── */
function FlowChannelCard({ cells, insight }: { cells: import('../types/analytics').FlowCell[]; insight: string }) {
  const levels = ['low', 'medium', 'high'] as const;
  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  const challengeLabel = { low: '短深潜', medium: '标准', high: '长深潜' } as const;
  const skillLabel = { low: '难完成', medium: '稳完成', high: '轻松完成' } as const;

  return (
    <motion.div variants={cardVariants} className="rounded-[var(--kb-radius-xl)] border border-border/30 bg-bg-elevated/50 backdrop-blur-sm p-5">
      <h2 className="text-[13px] font-semibold text-text-primary mb-1 flex items-center gap-2">
        <Waves className="w-4 h-4 text-cyan-500" strokeWidth={1.5} />
        心流通道
        <span className="text-[10px] font-normal text-text-tertiary">挑战 × 能力匹配（近 30 天）</span>
      </h2>
      <p className="mb-4 text-[11px] text-text-secondary">{insight}</p>
      <div className="flex items-stretch gap-1">
        {/* 行标签（挑战档） */}
        <div className="flex flex-col justify-between py-1 pr-1 text-right">
          {levels.map((c) => (
            <span key={c} className="text-[9px] text-text-tertiary leading-[26px]">{challengeLabel[c]}</span>
          ))}
        </div>
        <div className="flex-1">
          {/* 列标签（技能档） */}
          <div className="mb-1 flex gap-1">
            {levels.map((sk) => (
              <div key={sk} className="flex-1 text-center text-[9px] text-text-tertiary">{skillLabel[sk]}</div>
            ))}
          </div>
          {/* 3×3 矩阵（行=挑战，列=技能） */}
          {levels.map((c) => (
            <div key={c} className="mb-1 flex gap-1 last:mb-0">
              {levels.map((sk) => {
                const cell = cells.find((x) => x.challenge === c && x.skill === sk);
                const count = cell?.count ?? 0;
                const ratio = count / maxCount;
                const isFlow =
                  (c === 'medium' && (sk === 'medium' || sk === 'high')) ||
                  (c === 'high' && sk === 'high');
                return (
                  <div
                    key={`${c}-${sk}`}
                    className={cn(
                      'flex h-[26px] flex-1 items-center justify-center rounded-[6px] text-[11px] font-medium tabular-nums transition-colors',
                      count === 0 && 'bg-bg-tertiary/15 text-text-tertiary/50',
                      count > 0 && !isFlow && 'bg-cyan-500/15 text-cyan-400',
                      count > 0 && isFlow && 'bg-emerald-500/25 text-emerald-300',
                    )}
                    style={count > 0 ? { opacity: 0.4 + ratio * 0.6 } : undefined}
                    title={`${challengeLabel[c]}×${skillLabel[sk]}：${count} 次`}
                  >
                    {count}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
