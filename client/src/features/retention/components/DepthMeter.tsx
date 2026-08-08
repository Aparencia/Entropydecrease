/**
 * 累计深度计组件
 * Cumulative depth meter component
 *
 * @ai-context: 显示累计下潜深度 + 深海分层标签 + 当前所在层 + 下一层进度。
 * 放置于 Dashboard 英雄区域。身份认同机制：让用户看到"我已经是怎样的人"。
 * @ai-context: Shows cumulative dive depth + zone labels + current zone +
 * progress to next zone. Placed in Dashboard hero area. Identity mechanism.
 */
import { motion } from 'framer-motion';
import { Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { getDepthZone, getZoneProgress, DEPTH_ZONES } from '../lib/coralEngine';

export function DepthMeter() {
  const prefersReduced = useReducedMotion();
  const { totalDepth, corals, initialized } = useEcosystemStore();

  if (!initialized) return null;

  const zone = getDepthZone(totalDepth);
  const progress = getZoneProgress(totalDepth);
  const depthLabel = totalDepth >= 1000
    ? `${(totalDepth / 1000).toFixed(1)}km`
    : `${Math.round(totalDepth)}m`;

  const healthyCount = corals.filter((c) => c.health === 'healthy').length;

  return (
    /* 浅色模式适配：白色半透明背景 + 灰色边框 + 微阴影，确保在浅灰页面上有清晰视觉边界 */
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/80 dark:bg-white/5 border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none">
      {/* 标题行 / Header row —— 浅色模式使用深灰文字提升对比度 */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/50">
          <Anchor className="w-3.5 h-3.5" strokeWidth={1.5} />
          累计深度
        </span>
        {/* 浅色模式使用深蓝青色，保证在白底上可读 */}
        <span className="text-sm font-semibold text-cyber dark:text-cyber">{depthLabel}</span>
      </div>

      {/* 当前分层 / Current zone —— 浅色模式文字颜色加深 */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-600 dark:text-white/40">当前：{zone.name}</span>
        <span className="text-gray-400 dark:text-white/30">{healthyCount} 株珊瑚</span>
      </div>

      {/* 进度条 / Progress bar —— 浅色模式轨道使用更深的灰色背景，提升进度条可见度 */}
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${zone.color}, #38bdf8)` }}
          initial={prefersReduced ? {} : { width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
        />
      </div>

      {/* 分层指示器 / Zone indicators */}
      <div className="flex gap-1 mt-0.5">
        {DEPTH_ZONES.map((z) => (
          <div
            key={z.name}
            className={cn(
              'flex-1 h-0.5 rounded-full transition-colors',
              totalDepth >= z.minDepth ? 'opacity-80' : 'opacity-20',
            )}
            style={{ backgroundColor: z.color }}
            title={`${z.name} (${z.minDepth}m+)`}
          />
        ))}
      </div>
    </div>
  );
}
