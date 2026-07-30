/**
 * 萤火海沟 — 标签气泡组件
 * @ai-context 灵感卡片上的可点击标签芯片，展示内容性质 / 认知深度 / 学科领域
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TagChipProps {
  label: string;
  color: string;
  bg: string;
  onClick?: () => void;
}

function TagChip({ label, color, bg, onClick }: TagChipProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer select-none', color, bg)}
    >
      {label}
    </motion.button>
  );
}

export default TagChip;
