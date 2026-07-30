/**
 * @ai-context: 同步状态 UI 组件：ConflictDialog。
 */
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { textDiff, type DiffLine } from '@/lib/utils/textDiff';
import {
  ArrowLeftRight, Check, Monitor, Cloud, Merge,
} from 'lucide-react';
import type { SyncConflict } from '@/types/models';

/**
 * 三向冲突解决对话框
 * v0.9.0: 本地版本 / 远端版本 / 合并预览 — 差异高亮
 */

export interface ConflictDialogProps {
  conflict: SyncConflict;
  open: boolean;
  onClose: () => void;
  /** 保留本地版本 */
  onResolveLocal: (conflictId: string) => void;
  /** 保留远端版本 */
  onResolveRemote: (conflictId: string) => void;
  /** 手动合并（使用预览内容） */
  onResolveManual: (conflictId: string, mergedData: string) => void;
}

/** 渲染差异行 */
function DiffView({ lines, className }: { lines: DiffLine[]; className?: string }) {
  return (
    <div className={cn('font-mono text-[12px] leading-relaxed overflow-auto max-h-60', className)}>
      {lines.length === 0 ? (
        <p className="text-text-tertiary text-center py-4">无内容</p>
      ) : (
        lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'px-3 py-0.5 whitespace-pre-wrap border-l-2',
              line.type === 'add' && 'bg-emerald-500/10 border-emerald-400 text-emerald-700 dark:text-emerald-400',
              line.type === 'remove' && 'bg-rose-500/10 border-rose-400 text-rose-700 dark:text-rose-400 line-through opacity-75',
              line.type === 'equal' && 'border-transparent text-text-secondary',
            )}
          >
            {line.type === 'add' && <span className="text-emerald-500 mr-1 select-none">+</span>}
            {line.type === 'remove' && <span className="text-rose-500 mr-1 select-none">-</span>}
            {line.type === 'equal' && <span className="mr-1 select-none">&nbsp;</span>}
            {line.content || '\u00A0'}
          </div>
        ))
      )}
    </div>
  );
}

export function ConflictDialog({
  conflict,
  open,
  onClose,
  onResolveLocal,
  onResolveRemote,
  onResolveManual,
}: ConflictDialogProps) {
  const prefersReduced = useReducedMotion();
  const [mergePreview, setMergePreview] = useState('');
  const [activeView, setActiveView] = useState<'diff' | 'merge'>('diff');

  // 计算差异
  const diffLines = useMemo(() => {
    try {
      return textDiff(conflict.localData, conflict.remoteData);
    } catch {
      return [];
    }
  }, [conflict.localData, conflict.remoteData]);

  // 尝试自动合并（简单策略：保留两边都有的行）
  const autoMerged = useMemo(() => {
    return diffLines
      .filter((l) => l.type !== 'remove')
      .map((l) => l.content)
      .join('\n');
  }, [diffLines]);

  const handleMerge = () => {
    setMergePreview(autoMerged);
    setActiveView('merge');
  };

  const handleConfirmManual = () => {
    onResolveManual(conflict.id, mergePreview || autoMerged);
  };

  const springTransition = prefersReduced
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 300, damping: 28 };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="数据冲突解决"
      description={`实体类型: ${conflict.entityType} — 本地版本 v${conflict.localVersion} vs 远端版本 v${conflict.remoteVersion}`}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {/* 视图切换 */}
        <div className="flex items-center gap-2 border-b border-border/30 pb-2">
          <button
            onClick={() => setActiveView('diff')}
            className={cn(
              'px-3 py-1.5 rounded-kb-md text-b3 font-medium transition-all duration-200',
              activeView === 'diff'
                ? 'bg-brand-500/10 text-brand-600'
                : 'text-text-secondary hover:bg-bg-tertiary/40',
            )}
          >
            差异对比
          </button>
          <button
            onClick={handleMerge}
            className={cn(
              'px-3 py-1.5 rounded-kb-md text-b3 font-medium transition-all duration-200',
              activeView === 'merge'
                ? 'bg-brand-500/10 text-brand-600'
                : 'text-text-secondary hover:bg-bg-tertiary/40',
            )}
          >
            合并预览
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeView === 'diff' ? (
            <motion.div
              key="diff"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springTransition}
              className="grid grid-cols-2 gap-3"
            >
              {/* 本地版本 */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Monitor className="w-3.5 h-3.5 text-blue-500" strokeWidth={1.5} />
                  <span className="text-c1 font-medium text-text-primary">本地版本</span>
                  <span className="text-c1 text-text-tertiary ml-auto">v{conflict.localVersion}</span>
                </div>
                <div className="rounded-kb-md border border-border/40 overflow-hidden bg-bg-secondary/50">
                  <DiffView
                    lines={diffLines.filter((l) => l.type !== 'add')}
                  />
                </div>
              </div>

              {/* 远端版本 */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Cloud className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
                  <span className="text-c1 font-medium text-text-primary">远端版本</span>
                  <span className="text-c1 text-text-tertiary ml-auto">v{conflict.remoteVersion}</span>
                </div>
                <div className="rounded-kb-md border border-border/40 overflow-hidden bg-bg-secondary/50">
                  <DiffView
                    lines={diffLines.filter((l) => l.type !== 'remove')}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="merge"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springTransition}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Merge className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
                <span className="text-c1 font-medium text-text-primary">合并预览</span>
              </div>
              <div className="rounded-kb-md border border-border/40 overflow-hidden bg-bg-secondary/50">
                <textarea
                  value={mergePreview || autoMerged}
                  onChange={(e) => setMergePreview(e.target.value)}
                  rows={12}
                  className={cn(
                    'w-full px-3 py-2 font-mono text-[12px] leading-relaxed',
                    'bg-transparent outline-none text-text-primary resize-y',
                  )}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2 border-t border-border/30">
          <Button
            variant="secondary"
            size="sm"
            icon={<Monitor className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={() => onResolveLocal(conflict.id)}
            className="flex-1"
          >
            保留本地
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Cloud className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={() => onResolveRemote(conflict.id)}
            className="flex-1"
          >
            保留远端
          </Button>
          {activeView === 'merge' && (
            <Button
              size="sm"
              icon={<Check className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              onClick={handleConfirmManual}
              className="flex-1"
            >
              确认合并
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
