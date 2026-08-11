/**
 * 萤火海沟 — 灵感沉淀提醒条
 * @ai-context 当未处理灵感达到阈值时，以克制的方式提醒用户整理。
 * 遵循"存在感优先"原则：无 toast、无模态框，仅以细条形态安静浮出。
 * 玻璃拟态 + AnimatePresence 入场退场。
 */

import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

interface SortPendingBannerProps {
  pendingCount: number;
  onSortAll: () => void;
  onDismiss: () => void;
}

function SortPendingBanner({ pendingCount, onSortAll, onDismiss }: SortPendingBannerProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0, y: -8 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative z-10"
    >
      <div className="bg-bg-secondary/60 backdrop-blur-xl border border-amber-400/30 rounded-[var(--kb-radius-xl)] px-3 py-2 flex items-center gap-2">
        {/* 浮游图标 — 微光呼吸 */}
        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="shrink-0"
        >
          <Sparkles className="w-4 h-4 text-amber-400 opacity-70" />
        </motion.div>

        {/* 文案 */}
        <p className="text-xs text-text-secondary flex-1 leading-relaxed">
          海底已沉淀 <span className="font-semibold text-amber-500">{pendingCount}</span> 颗微光，
          是否让它们浮出水面？
        </p>

        {/* 操作区 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 开始整理 — 渐变色药丸 */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onSortAll}
            className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-cyber/20 to-amber/20 border border-cyber/30 text-text-secondary hover:text-text-primary transition-colors"
          >
            开始整理
          </motion.button>

          {/* 稍后再说 */}
          <button
            onClick={onDismiss}
            className="text-xs text-text-tertiary opacity-50 hover:opacity-80 transition-opacity"
            aria-label="稍后再说"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default SortPendingBanner;
