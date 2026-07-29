/**
 * 萤火海沟 — 标签编辑弹出层
 * @ai-context 灵感卡片标签行点击后弹出的编辑面板，支持修改内容性质、认知深度与学科领域
 */

import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useInspirationStore, type InspirationItem } from '../store/inspirationStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { CONTENT_NATURE_OPTIONS, COGNITIVE_DEPTH_OPTIONS } from '../constants';

interface TagEditPopoverProps {
  item: InspirationItem;
  onClose: () => void;
}

function TagEditPopover({ item, onClose }: TagEditPopoverProps) {
  const { updateTags } = useInspirationStore(useShallow(s => s));
  const [nature, setNature] = useState(item.tags.content_nature);
  const [depth, setDepth] = useState(item.tags.cognitive_depth);
  const [subject, setSubject] = useState(item.tags.subject);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSave = () => {
    updateTags(item.id, { content_nature: nature, cognitive_depth: depth, subject });
    onClose();
  };

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const }}
      className={cn(
        'absolute left-0 top-full mt-1 z-30',
        'bg-bg-elevated/90 backdrop-blur-xl border border-border/60 rounded-kb-lg shadow-xl',
        'p-3 w-64 space-y-3',
      )}
    >
      <div>
        <div className="text-c1 text-text-tertiary mb-1">内容性质</div>
        <div className="flex flex-wrap gap-1">
          {CONTENT_NATURE_OPTIONS.map(opt => (
            <motion.button key={opt.value} whileTap={{ scale: 0.9 }}
              onClick={() => setNature(opt.value)}
              className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
                nature === opt.value ? cn(opt.color, opt.bg, 'ring-1 ring-brand-300') : 'text-text-tertiary bg-bg-secondary border-border/40 hover:text-text-secondary')}>
              {opt.label}
            </motion.button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-c1 text-text-tertiary mb-1">认知深度</div>
        <div className="flex flex-wrap gap-1">
          {COGNITIVE_DEPTH_OPTIONS.map(opt => (
            <motion.button key={opt.value} whileTap={{ scale: 0.9 }}
              onClick={() => setDepth(opt.value)}
              className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
                depth === opt.value ? cn(opt.color, opt.bg, 'ring-1 ring-brand-300') : 'text-text-tertiary bg-bg-secondary border-border/40 hover:text-text-secondary')}>
              {opt.label}
            </motion.button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-c1 text-text-tertiary mb-1">学科领域</div>
        <input value={subject} onChange={e => setSubject(e.target.value)}
          className={cn('w-full px-2 py-1 rounded-kb-md text-xs bg-bg-secondary border border-border/40 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-300')}
          placeholder="输入学科..." />
      </div>
      <div className="flex justify-end gap-2">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onClose}
          className="px-2 py-1 rounded-kb-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors">取消</motion.button>
        <motion.button whileTap={{ scale: 0.95 }} onClick={handleSave}
          className="px-2 py-1 rounded-kb-md text-xs bg-brand-600 text-text-inverse hover:bg-brand-700 transition-colors">保存</motion.button>
      </div>
    </motion.div>
  );
}

export default TagEditPopover;
