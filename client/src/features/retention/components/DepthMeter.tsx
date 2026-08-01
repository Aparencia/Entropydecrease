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
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/5">
      {/* 标题行 / Header row */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-white/50">
          <Anchor className="w-3.5 h-3.5" strokeWidth={1.5} />
          累计深度
        </span>
        <span className="text-sm font-semibold text-cyan-300">{depthLabel}</span>
      </div>

      {/* 当前分层 / Current zone */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-white/40">当前：{zone.name}</span>
        <span className="text-white/30">{healthyCount} 株珊瑚</span>
      </div>

      {/* 进度条 / Progress bar */}
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
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
