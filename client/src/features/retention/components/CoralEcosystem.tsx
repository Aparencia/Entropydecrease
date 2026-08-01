/**
 * 珊瑚生态缸组件
 * Coral ecosystem tank component
 *
 * @ai-context: 展示用户的珊瑚生态全貌：CSS/SVG 程序化珊瑚 + 白化状态。
 * Dashboard 一角展示缩略图，点击展开全屏。身份认同机制核心可视化。
 * @ai-context: Displays user's coral ecosystem: CSS/SVG procedural corals +
 * bleaching state. Thumbnail in Dashboard corner, click to expand fullscreen.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { getCoralTypeColor, getCoralTypeLabel } from '../lib/coralEngine';
import type { CoralRecord } from '../types';

export function CoralEcosystem() {
  const prefersReduced = useReducedMotion();
  const { corals, initialized } = useEcosystemStore();
  const [expanded, setExpanded] = useState(false);

  if (!initialized || corals.length === 0) return null;

  const recentCorals = corals.slice(-12); // 最近 12 株
  const bleachedCount = corals.filter((c) => c.health === 'bleached').length;

  return (
    <>
      {/* 缩略入口 / Thumbnail entry */}
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/8 transition-colors w-full"
      >
        {/* 迷你珊瑚预览 / Mini coral preview */}
        <div className="flex -space-x-1">
          {recentCorals.slice(-5).map((c) => (
            <div
              key={c.id}
              className={cn(
                'w-3 h-3 rounded-full border border-white/20',
                c.health === 'bleached' && 'opacity-30 saturate-0',
              )}
              style={{ backgroundColor: getCoralTypeColor(c.type) }}
            />
          ))}
        </div>
        <span className="text-[11px] text-white/50 flex-1 text-left">
          我的深海生态 · {corals.length} 株
        </span>
        {bleachedCount > 0 && (
          <span className="text-[10px] text-white/30">{bleachedCount} 株休眠中</span>
        )}
      </button>

      {/* 全屏生态缸 / Fullscreen ecosystem */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="fixed inset-0 z-[9998] flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a1628] via-[#0d2040] to-[#061020]" />

            {/* 顶部栏 / Top bar */}
            <div className="relative z-10 flex items-center justify-between p-4">
              <h2 className="text-sm font-medium text-white/80">我的深海生态</h2>
              <button
                onClick={() => setExpanded(false)}
                className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 珊瑚网格 / Coral grid */}
            <div className="relative z-10 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-w-lg mx-auto">
                {corals.map((coral, i) => (
                  <CoralItem key={coral.id} coral={coral} index={i} prefersReduced={!!prefersReduced} />
                ))}
              </div>
            </div>

            {/* 底部统计 / Bottom stats */}
            <div className="relative z-10 p-4 text-center text-[11px] text-white/30">
              共 {corals.length} 株珊瑚 · {corals.filter((c) => c.health === 'healthy').length} 株健康
              {bleachedCount > 0 && ` · ${bleachedCount} 株休眠（完成深潜即可唤醒）`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── 单株珊瑚 / Single coral item ──────────────────────────────────

function CoralItem({ coral, index, prefersReduced }: {
  coral: CoralRecord;
  index: number;
  prefersReduced: boolean;
}) {
  const color = getCoralTypeColor(coral.type);
  const isBleached = coral.health === 'bleached';

  return (
    <motion.div
      className={cn(
        'flex flex-col items-center gap-1 p-2 rounded-lg',
        'bg-white/5 border border-white/5',
      )}
      initial={prefersReduced ? {} : { opacity: 0, scale: 0.8 }}
      animate={prefersReduced ? {} : { opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      title={`${getCoralTypeLabel(coral.type)} · ${Math.round(coral.depth)}m`}
    >
      {/* 珊瑚形状（CSS 程序化） / Coral shape (CSS procedural) */}
      <div
        className={cn(
          'w-8 h-8 rounded-full transition-all duration-500',
          isBleached && 'opacity-30 saturate-0 grayscale',
        )}
        style={{
          background: `radial-gradient(circle at 40% 40%, ${color}88, ${color}33)`,
          boxShadow: isBleached ? 'none' : `0 0 8px ${color}33`,
        }}
      />
      <span className={cn(
        'text-[9px] leading-tight text-center',
        isBleached ? 'text-white/20' : 'text-white/40',
      )}>
        {getCoralTypeLabel(coral.type)}
      </span>
    </motion.div>
  );
}
