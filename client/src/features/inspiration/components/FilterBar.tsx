/**
 * 萤火海沟 — 筛选栏组件
 * @ai-context 灵感列表上方的筛选面板，支持按内容性质与认知深度过滤
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CONTENT_NATURE_OPTIONS, COGNITIVE_DEPTH_OPTIONS, filterVariants } from '../constants';
import type { FilterState } from '../types';

interface FilterBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <motion.div variants={filterVariants} className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-c1 text-text-tertiary min-w-[4em]">性质:</span>
        {CONTENT_NATURE_OPTIONS.map(opt => (
          <motion.button key={opt.value} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => onChange({ ...filters, content_nature: filters.content_nature === opt.value ? null : opt.value })}
            className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
              filters.content_nature === opt.value ? cn(opt.color, opt.bg) : 'text-text-tertiary bg-bg-secondary border-border/40 hover:text-text-secondary')}>
            {opt.label}
          </motion.button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-c1 text-text-tertiary min-w-[4em]">深度:</span>
        {COGNITIVE_DEPTH_OPTIONS.map(opt => (
          <motion.button key={opt.value} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => onChange({ ...filters, cognitive_depth: filters.cognitive_depth === opt.value ? null : opt.value })}
            className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
              filters.cognitive_depth === opt.value ? cn(opt.color, opt.bg) : 'text-text-tertiary bg-bg-secondary border-border/40 hover:text-text-secondary')}>
            {opt.label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

export default FilterBar;
