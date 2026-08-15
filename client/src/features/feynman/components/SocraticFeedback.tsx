/**
 * 苏格拉底追问 — 多维反馈子组件（雷达图 + 反馈卡片）
 *
 * @ai-context: 从 SocraticDialogue 拆出。DimensionRadar 用 recharts 渲染
 * 四维雷达（准确/完整/逻辑/表达，满分 10）；MultiFeedbackCard 按阈值
 * 分类优势(≥7)/盲区(<5)/建议(hints[0])。维度标签 DIMENSION_LABELS 为
 * 展示契约，与网关评估维度对齐。
 */
import { motion } from 'framer-motion';
import { TrendingUp, AlertCircle, Lightbulb } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { SPRING } from '@/lib/animation/springConfig';
import type { SocraticRound, DimensionScore } from '../types';
import { DIMENSION_LABELS } from './dimensionLabels';

// react-refresh: 组件文件只导出组件；DIMENSION_LABELS 已移至 ./dimensionLabels，
// 此处 re-export 保持导出签名不变（展示契约，与网关评估维度对齐）
export { DIMENSION_LABELS } from './dimensionLabels';

export function DimensionRadar({ dimensions }: { dimensions: DimensionScore }) {
  const data = (Object.keys(DIMENSION_LABELS) as (keyof DimensionScore)[]).map(key => ({
    dimension: DIMENSION_LABELS[key],
    score: dimensions[key],
    fullMark: 10,
  }));

  return (
    <div className="w-36 h-36 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--kb-border-default)" strokeOpacity={0.4} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 11, fill: 'var(--kb-text-tertiary)' }}
          />
          <Radar
            dataKey="score"
            stroke="var(--kb-brand-500)"
            fill="var(--kb-brand-500)"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 多维反馈卡片 — 优势/盲区/建议 */
export function MultiFeedbackCard({ round }: { round: SocraticRound }) {
  if (!round.dimensions) return null;
  const dims = round.dimensions;
  const strengths = (Object.keys(DIMENSION_LABELS) as (keyof DimensionScore)[]).filter(k => dims[k] >= 7);
  const weaknesses = (Object.keys(DIMENSION_LABELS) as (keyof DimensionScore)[]).filter(k => dims[k] < 5);

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.gentle}
    >
      {/* 优势 */}
      <div className="p-2.5 rounded-kb-lg bg-emerald-500/8 border border-emerald-400/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-c1 font-semibold text-emerald-600 dark:text-emerald-400">优势</span>
        </div>
        {strengths.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {strengths.map(k => (
              <span key={k} className="text-c1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {DIMENSION_LABELS[k]}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-c1 text-text-tertiary">继续努力</span>
        )}
      </div>

      {/* 盲区 */}
      <div className="p-2.5 rounded-kb-lg bg-amber-500/8 border border-amber-400/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
          <span className="text-c1 font-semibold text-amber-600 dark:text-amber-400">盲区</span>
        </div>
        {weaknesses.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {weaknesses.map(k => (
              <span key={k} className="text-c1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                {DIMENSION_LABELS[k]}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-c1 text-text-tertiary">表现不错!</span>
        )}
      </div>

      {/* 建议 */}
      <div className="p-2.5 rounded-kb-lg bg-brand-500/8 border border-brand-400/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
          <span className="text-c1 font-semibold text-brand-600 dark:text-brand-400">建议</span>
        </div>
        {round.hints.length > 0 ? (
          <p className="text-c1 text-text-secondary line-clamp-2">{round.hints[0]}</p>
        ) : (
          <span className="text-c1 text-text-tertiary">保持节奏</span>
        )}
      </div>
    </motion.div>
  );
}

/** 详细评分折叠区（雷达图 + 维度进度条） */
export function DimensionDetail({ dimensions }: { dimensions: DimensionScore }) {
  return (
    <motion.div
      className="p-kb-md rounded-kb-lg bg-bg-elevated border border-border/30"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-4">
        <DimensionRadar dimensions={dimensions} />
        <div className="flex flex-col gap-1.5">
          {(Object.keys(DIMENSION_LABELS) as (keyof DimensionScore)[]).map(key => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-c1 text-text-tertiary w-14">{DIMENSION_LABELS[key]}</span>
              <div className="w-20 h-1.5 bg-bg-tertiary rounded-kb-full overflow-hidden">
                <motion.div
                  className="h-full bg-brand-500 rounded-kb-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(dimensions[key] / 10) * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                />
              </div>
              <span className="text-c1 text-text-secondary w-5 text-right font-medium">
                {dimensions[key]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
