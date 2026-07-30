/**
 * 薄弱点右侧抽屉面板（步骤 3）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出。展示讲解中标记的薄弱点，
 * 支持掌握状态切换/删除/一键生成闪卡。掌握态用删除线+绿色对勾区分。
 * 薄弱点数据经 useFeynmanStore 持久化，回调由父组件注入。
 */
import { motion } from 'framer-motion';
import { X, Layers, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeynmanWeakPoint } from '@/types/models';

interface WeakPointPanelProps {
  weakPoints: FeynmanWeakPoint[];
  onToggleMastered: (wpId: string) => void;
  onRemove: (wpId: string) => void;
  onOpenDeckModal: () => void;
  onClose: () => void;
}

export function WeakPointPanel({
  weakPoints, onToggleMastered, onRemove, onOpenDeckModal, onClose,
}: WeakPointPanelProps) {
  return (
    <motion.aside
      className={cn(
        'w-72 flex-shrink-0 border-l border-border/50 bg-bg-secondary/80 backdrop-blur-xl',
        'shadow-[-8px_0_24px_rgba(0,0,0,0.12)]',
        'overflow-y-auto hidden md:block',
      )}
      initial={{ opacity: 0, x: 24, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 16, scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const }}
    >
      <div className="p-kb-md">
        <div className="flex items-center justify-between mb-kb-md">
          <h3 className="text-b1 font-semibold text-text-primary">薄弱点列表</h3>
          <div className="flex items-center gap-1">
            {weakPoints.some((wp) => !wp.mastered) && (
              <button
                onClick={onOpenDeckModal}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-kb-md text-c1 font-medium',
                  'bg-[#F59E0B]/10 text-[#B45309] dark:text-[#F59E0B]',
                  'hover:bg-[#F59E0B]/20 transition-all duration-kb-fast',
                )}
                title="将未掌握的薄弱点转为闪卡"
              >
                <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
                生成闪卡
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
        {weakPoints.length === 0 ? (
          <p className="text-b2 text-text-tertiary text-center py-4">
            选中讲解文本即可标记薄弱点
          </p>
        ) : (
          <div className="space-y-2.5">
            {weakPoints.map((wp, i) => (
              <motion.div
                key={wp.id}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                className={cn(
                  'flex gap-2.5 p-3 rounded-kb-md',
                  'bg-bg-elevated border border-border/40',
                  'group',
                )}
              >
                <button
                  onClick={() => wp.id && onToggleMastered(wp.id)}
                  className="flex-shrink-0 mt-0.5"
                  title={wp.mastered ? '标记为未掌握' : '标记为已掌握'}
                >
                  {wp.mastered ? (
                    <CheckCircle2 className="w-5 h-5 text-semantic-success" strokeWidth={1.5} />
                  ) : (
                    <Circle className="w-5 h-5 text-text-tertiary" strokeWidth={1.5} />
                  )}
                </button>
                <p className={cn(
                  'text-b3 leading-relaxed flex-1',
                  wp.mastered ? 'text-text-tertiary line-through' : 'text-text-secondary',
                )}>
                  {wp.text}
                </p>
                <button
                  onClick={() => wp.id && onRemove(wp.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-semantic-error transition-all duration-kb-fast"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.aside>
  );
}
