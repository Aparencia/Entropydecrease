/**
 * 灵感列表空状态（无匹配 / 冷启动）
 * Empty states for the inspiration list (no match / cold start).
 *
 * @ai-context: 从 InspirationPage 拆出的两种空状态：有筛选但无匹配时展示"没有匹配的
 * 萤火海沟记录 + 清除筛选"；无任何记录时展示冷启动仪式文案"海沟尚暗，等待第一只萤火"。
 * 渲染结构与原内联 JSX 完全一致。
 * @ai-context: Extracted from InspirationPage; renders the "no match" state when
 * a filter is active, otherwise the cold-start ritual copy, markup identical.
 */

import { motion } from 'framer-motion';

interface EmptyStateProps {
  /** 是否有筛选在生效（items 非空但 filteredItems 为空） */
  hasActiveFilter: boolean;
  onClearFilters: () => void;
}

export default function EmptyState({ hasActiveFilter, onClearFilters }: EmptyStateProps) {
  if (hasActiveFilter) {
    return (
      <motion.div className="text-center py-12 relative z-10"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <p className="text-b2 text-text-tertiary">没有匹配的萤火海沟记录</p>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={onClearFilters}
          className="mt-2 text-sm text-brand-600 hover:underline">
          清除筛选
        </motion.button>
      </motion.div>
    );
  }
  return (
    <motion.div className="relative z-10"
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
      {/* 冷启动仪式空状态：海沟尚暗，等待第一只萤火 */}
      <div className="kb-ritual-empty py-kb-xl">
        <p className="kb-ritual-empty-title">海沟尚暗</p>
        <p className="kb-ritual-empty-note">等待第一只萤火</p>
      </div>
    </motion.div>
  );
}
