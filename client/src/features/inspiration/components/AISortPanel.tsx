/**
 * 萤火海沟 — AI 分拣建议面板
 * @ai-context 灵感卡片内联展开的 AI 归类建议列表，支持手动覆盖分类与一键转化
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown, Check, Pencil, ArrowRight, ListTodo } from 'lucide-react';
import { useInspirationStore } from '../store/inspirationStore';
import { useNoteStore } from '@/features/notes/store/useNoteStore';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { SortSuggestion } from '@/lib/ai/types';
import { SORT_TYPE_MAP, SORT_TYPE_ENTRIES } from '../constants';
import type { AISortPanelProps } from '../types';

function AISortPanel({ suggestions, item, onClose }: AISortPanelProps) {
  const { toast } = useToast();
  // P1-5 收尾：action 恒定引用，直接字段级订阅
  const confirmSort = useInspirationStore((s) => s.confirmSort);
  const updateSortStatus = useInspirationStore((s) => s.updateSortStatus);
  const createTodoNote = useNoteStore((s) => s.createTodoNote);
  const [localSuggestions, setLocalSuggestions] = useState<SortSuggestion[]>(suggestions);
  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null);
  const [overriddenSet, setOverriddenSet] = useState<Set<number>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (openDropdownIdx === null) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdownIdx]);

  const handleSelectCategory = useCallback((idx: number, newCategory: string) => {
    // 更新本地建议列表
    setLocalSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, category: newCategory as SortSuggestion['category'] } : s));
    // 标记为已手动覆盖
    setOverriddenSet(prev => new Set(prev).add(idx));
    // 调用 store 的 confirmSort 持久化
    confirmSort(item.id, newCategory);
    setOpenDropdownIdx(null);
    toast({ type: 'success', message: `已更改分类为「${SORT_TYPE_MAP[newCategory]?.label ?? newCategory}」` });
  }, [item.id, confirmSort, toast]);

  const handleConvert = useCallback((type: string) => {
    const label = SORT_TYPE_MAP[type]?.label ?? type;
    const text = `[${label}] ${item.content}`;
    navigator.clipboard.writeText(text).then(() => {
      toast({ type: 'success', message: `已复制为「${label}」格式到剪贴板` });
    }).catch(() => { toast({ type: 'error', message: '复制失败' }); });
  }, [item.content, toast]);

  /**
   * v0.11.0: 将灵感转化为待办笔记
   * @ai-context 仅当分拣结果为 todo/action_item 时可用。
   * 副作用：创建笔记 + 更新灵感 sortStatus 为 'transformed'
   */
  const handleConvertToTodo = useCallback(async (category: string) => {
    const priority = category === 'action_item' ? 'high' : 'medium';
    const subject = item.tags?.subject || undefined;
    await createTodoNote(
      {
        text: item.content,
        checked: false,
        priority,
        sourceInspirationId: item.id,
      },
      subject,
    );
    updateSortStatus(item.id, 'transformed');
    toast({ type: 'success', message: '已转化为待办笔记' });
  }, [item, createTodoNote, updateSortStatus, toast]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-c1 font-medium text-text-secondary">AI 归类建议</span>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="text-text-tertiary hover:text-text-secondary transition-colors">
            <X className="w-3.5 h-3.5" />
          </motion.button>
        </div>
        <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
          {localSuggestions.map((s, idx) => {
            const typeInfo = SORT_TYPE_MAP[s.category] ?? { label: s.category, color: 'text-text-secondary', bg: 'bg-bg-secondary border-border' };
            const isOverridden = overriddenSet.has(idx);
            const isDropdownOpen = openDropdownIdx === idx;
            return (
              <motion.div key={idx}
                variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0, transition: { duration: 0.25 } } }}
                className={cn('flex items-center gap-2 p-kb-sm rounded-kb-lg border bg-bg-secondary/50', typeInfo.bg)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap relative" ref={isDropdownOpen ? dropdownRef : undefined}>
                    {/* ── 可交互分类标签 ── */}
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setOpenDropdownIdx(isDropdownOpen ? null : idx)}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-semibold rounded-md px-1.5 py-0.5 border transition-all cursor-pointer',
                        typeInfo.color,
                        isOverridden && 'border-dashed border-current',
                        !isOverridden && 'border-transparent hover:border-current/30',
                      )}
                    >
                      {isOverridden && <Pencil className="w-3 h-3" />}
                      {typeInfo.label}
                      <ChevronDown className={cn('w-3 h-3 transition-transform', isDropdownOpen && 'rotate-180')} />
                    </motion.button>
                    <span className="text-c1 text-text-tertiary">{Math.round(s.confidence * 100)}%</span>
                    {s.confidence < 0.5 && <span className="text-c1 text-orange-500 font-medium">仅供参考</span>}
                    {isOverridden && <span className="text-c1 text-brand-500 font-medium">已手动调整</span>}

                    {/* ── 分类下拉面板 ── */}
                    <AnimatePresence>
                      {isDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 top-full mt-1 z-30 bg-bg-elevated/95 backdrop-blur-xl border border-border/60 rounded-kb-lg shadow-xl p-1.5 w-44"
                        >
                          {SORT_TYPE_ENTRIES.map(([key, opt]) => {
                            const isSelected = s.category === key;
                            return (
                              <motion.button
                                key={key}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => handleSelectCategory(idx, key)}
                                className={cn(
                                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-kb-md text-xs font-medium transition-colors text-left',
                                  isSelected ? cn(opt.color, opt.bg) : 'text-text-secondary hover:bg-bg-secondary',
                                )}
                              >
                                {isSelected && <Check className="w-3 h-3 flex-shrink-0" />}
                                <span className={cn(!isSelected && 'ml-5')}>{opt.label}</span>
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <p className="text-c1 text-text-secondary mt-0.5 truncate">{s.reason}</p>
                </div>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => handleConvert(s.category)}
                  className={cn('flex items-center gap-1 px-2 py-1 rounded-kb-md text-xs font-medium bg-bg-elevated border border-border/50 text-text-secondary hover:text-brand-600 hover:border-brand-300 transition-colors whitespace-nowrap')}>
                  转化 <ArrowRight className="w-3 h-3" />
                </motion.button>
                {/* v0.11.0: 分拣结果为 todo/action_item 时显示“转为待办笔记”桥接按钮 */}
                {(s.category === 'todo' || s.category === 'action_item') && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleConvertToTodo(s.category)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
                  >
                    <ListTodo className="w-3 h-3" />
                    转为待办笔记
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  );
}

export default AISortPanel;
