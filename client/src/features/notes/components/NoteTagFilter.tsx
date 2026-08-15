/**
 * @ai-context: 通用组件：NoteTagFilter。
 * P1-5 修复：原实现 useShallow((s) => s.getAllTags())——selector 内调用返回
 * 新数组的 action，useShallow 浅比较永远失败，任何 store 变化都触发重渲染；
 * 改为订阅 notes 原始数组 + useMemo 派生标签（getAllTags 为纯派生函数）。
 */
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNoteStore } from '../store/useNoteStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * 笔记标签筛选器
 * v0.9.0: chip 样式多选标签筛选
 */
export function NoteTagFilter() {
  const notes = useNoteStore((s) => s.notes);
  const selectedTags = useNoteStore((s) => s.selectedTags);
  const toggleTag = useNoteStore((s) => s.toggleTag);
  const clearTagFilter = useNoteStore((s) => s.clearTagFilter);
  const prefersReduced = useReducedMotion();

  // 标签由 notes 派生（与 store.getAllTags 同算法，保持行为一致）
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const note of notes) {
      for (const tag of note.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [notes]);

  if (allTags.length === 0) return null;

  const hasFilter = selectedTags.length > 0;

  const springTransition = prefersReduced
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 400, damping: 28 };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <AnimatePresence>
        {hasFilter && (
          <motion.button
            key="clear-tags"
            initial={{ opacity: 0, scale: 0.85, width: 0 }}
            animate={{ opacity: 1, scale: 1, width: 'auto' }}
            exit={{ opacity: 0, scale: 0.85, width: 0 }}
            transition={springTransition}
            whileTap={{ scale: 0.9 }}
            onClick={clearTagFilter}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
              'text-[11px] font-medium whitespace-nowrap overflow-hidden',
              'bg-semantic-error/10 text-semantic-error border border-semantic-error/20',
              'hover:bg-semantic-error/20 transition-colors duration-200',
            )}
          >
            <X className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
            清除
          </motion.button>
        )}
      </AnimatePresence>
      {allTags.map((tag) => {
        const isActive = selectedTags.includes(tag);
        return (
          <motion.button
            key={tag}
            whileTap={{ scale: 0.95 }}
            onClick={() => toggleTag(tag)}
            className={cn(
              'px-2.5 py-0.5 text-[11px] rounded-full border transition-all duration-200 whitespace-nowrap',
              isActive
                ? 'bg-brand-500/10 text-brand-600 border-brand-300/50 font-medium shadow-[0_0_0_1px_rgba(91,138,114,0.08)]'
                : 'bg-bg-tertiary/30 text-text-secondary border-border/30 hover:bg-bg-tertiary/60 hover:border-border/50',
            )}
          >
            <span className="flex items-center gap-1">
              {isActive && (
                <motion.span
                  layoutId={`tag-check-${tag}`}
                  className="w-1.5 h-1.5 rounded-full bg-brand-500"
                  transition={springTransition}
                />
              )}
              {tag}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
