/**
 * 深海发现揭示弹窗
 * Deep sea discovery reveal modal
 *
 * @ai-context: 全屏暗化 → 深海光束照亮发现物 → 生物名称 + 稀有度标签 +
 * 趣味描述。可忽略（右上角 X，无惩罚）。尊重自主权：无倒计时自动消失。
 * @ai-context: Full-screen dim → deep-sea beam illuminates discovery →
 * creature name + rarity tag + fun description. Dismissible without penalty.
 */
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DEEP_SEA_EASE } from '@/lib/animation/presets';
import { getRarityConfig } from '../lib/discoveryEngine';
import { useDiscoveryStore } from '../store/useDiscoveryStore';

export function DiscoveryReveal() {
  const prefersReduced = useReducedMotion();
  const { pendingDiscovery, pendingDepth, collect, dismiss } = useDiscoveryStore();

  const visible = pendingDiscovery !== null;
  const rarityConfig = pendingDiscovery
    ? getRarityConfig(pendingDiscovery.rarity)
    : null;

  return createPortal(
    <AnimatePresence>
      {visible && pendingDiscovery && rarityConfig && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* 暗化背景 / Dimmed background */}
          <div className="absolute inset-0 bg-[#020810]/95" onClick={dismiss} />

          {/* 光束效果 / Light beam effect */}
          {!prefersReduced && (
            <motion.div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-full pointer-events-none"
              style={{
                background: 'conic-gradient(from 180deg at 50% 0%, transparent 40%, rgba(56,189,248,0.08) 50%, transparent 60%)',
              }}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.8, ease: DEEP_SEA_EASE, delay: 0.2 }}
            />
          )}

          {/* 主内容 / Main content */}
          <motion.div
            className={cn(
              'relative z-10 w-full max-w-xs mx-4 p-6 rounded-2xl text-center',
              'bg-white/5 backdrop-blur-md border border-white/10',
              'flex flex-col items-center gap-3',
              'shadow-2xl',
              rarityConfig.glowColor,
            )}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 30 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.5, ease: DEEP_SEA_EASE, delay: 0.3 }}
          >
            {/* 关闭按钮 / Close button */}
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              aria-label="忽略"
            >
              <X className="w-4 h-4" />
            </button>

            {/* 发现标签 / Discovery label */}
            <motion.p
              className="text-[11px] uppercase tracking-widest text-cyber/60 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              深海发现
            </motion.p>

            {/* 生物图标区域 / Creature icon area */}
            <motion.div
              className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center',
                'bg-gradient-to-br from-cyber/10 to-blue-500/5',
                'border border-cyber/20',
              )}
              initial={prefersReduced ? {} : { scale: 0, rotate: -180 }}
              animate={prefersReduced ? {} : { scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.5 }}
            >
              <Sparkles className={cn('w-9 h-9', rarityConfig.color)} strokeWidth={1.2} />
            </motion.div>

            {/* 名称 + 稀有度 / Name + rarity */}
            <div>
              <h3 className="text-lg font-semibold text-white/90">{pendingDiscovery.name}</h3>
              <span className={cn(
                'inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                'bg-white/10 border border-white/10',
                rarityConfig.color,
              )}>
                {rarityConfig.label}
              </span>
            </div>

            {/* 描述 / Description */}
            <p className="text-xs text-white/50 leading-relaxed">
              {pendingDiscovery.description}
            </p>

            {/* 深度信息 / Depth info */}
            <p className="text-[11px] text-cyber/50">
              发现于 -{Math.round(pendingDepth)}m 深处
            </p>

            {/* 收集按钮 / Collect button */}
            <motion.button
              onClick={collect}
              className={cn(
                'w-full py-2.5 rounded-xl text-sm font-medium',
                'bg-cyber/60 hover:bg-cyber/50 text-text-inverse',
                'transition-colors mt-1',
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              收入生态缸
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
