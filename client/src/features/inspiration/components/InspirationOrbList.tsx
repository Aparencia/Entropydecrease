/**
 * 灵感球群列表（按内容性质分组）
 * Inspiration orb list grouped by content nature.
 *
 * @ai-context: 从 InspirationPage 拆出的列表区：按 groupInspirationsByNature 分组，
 * 组间分隔线 + 类别名，组内 InspirationCard 球群（支持批量勾选）。过滤后的条目
 * 经 props 注入，渲染结构与原内联 JSX 完全一致。
 * @ai-context: Extracted from InspirationPage; filtered items are injected via
 * props, markup identical to the original inline JSX.
 */

import { motion, AnimatePresence } from 'framer-motion';
import InspirationCard from './InspirationCard';
import { NATURE_MAP } from '../constants';
import { groupInspirationsByNature } from '../lib/orbLayout';
import { listVariants } from '../constants';
import type { InspirationItem } from '../store/inspirationStore';

interface InspirationOrbListProps {
  items: InspirationItem[];
  batchMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

export default function InspirationOrbList({
  items,
  batchMode,
  selectedIds,
  onToggleSelect,
}: InspirationOrbListProps) {
  return (
    <motion.div className="space-y-6 relative z-10" variants={listVariants}>
      <AnimatePresence mode="popLayout">
        {Object.entries(groupInspirationsByNature(items)).map(([nature, groupItems]) => (
          <div key={nature}>
            {/* 分组分隔线 + 类别名 */}
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px bg-border/20 flex-1" />
              <span className="text-xs text-text-tertiary opacity-30">
                {NATURE_MAP[nature]?.label ?? nature}
              </span>
              <div className="h-px bg-border/20 flex-1" />
            </div>
            {/* 球群容器 */}
            <div className="flex flex-wrap gap-4 justify-center">
              {groupItems.map(item => (
                <InspirationCard
                  key={item.id}
                  item={item}
                  batchMode={batchMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => onToggleSelect(item.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
