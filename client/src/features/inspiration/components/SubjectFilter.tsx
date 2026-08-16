/**
 * 学科筛选药丸（subject filter pills）
 * Subject filter pills extracted from InspirationPage.
 *
 * @ai-context: 从 InspirationPage 拆出的学科筛选区：学科标签药丸（点击切换）、
 * 已选学科时的"清除"按钮。筛选值经 props 由页面状态驱动，渲染结构与原内联一致。
 * @ai-context: Extracted from InspirationPage; active subject and callbacks are
 * driven by page state via props, markup identical to the original inline JSX.
 */

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubjectFilterProps {
  subjects: string[];
  activeSubject: string | null;
  onToggleSubject: (subject: string) => void;
  onClearSubject: () => void;
}

export default function SubjectFilter({
  subjects,
  activeSubject,
  onToggleSubject,
  onClearSubject,
}: SubjectFilterProps) {
  return (
    <motion.div
      className="flex items-center gap-2 flex-wrap mt-2"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
    >
      <span className="text-c1 text-text-tertiary min-w-[4em]">学科:</span>
      {subjects.map(s => (
        <motion.button key={s} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => onToggleSubject(s)}
          className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
            activeSubject === s
              ? 'text-brand-700 bg-brand-100 border-brand-300 dark:text-brand-300 dark:bg-brand-900/20 dark:border-brand-700'
              : 'text-text-tertiary bg-bg-secondary border-border/40 hover:text-text-secondary')}>
          {s}
        </motion.button>
      ))}
      {activeSubject && (
        <motion.button whileTap={{ scale: 0.9 }}
          onClick={onClearSubject}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full text-xs text-text-tertiary hover:text-semantic-error transition-colors">
          <X className="w-3 h-3" /> 清除
        </motion.button>
      )}
    </motion.div>
  );
}
