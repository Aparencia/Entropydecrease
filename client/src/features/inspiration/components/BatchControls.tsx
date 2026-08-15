/**
 * 批量整理控件（入口按钮 + 操作条 + 进度条）
 * Batch sort controls (entry button, action bar and progress bar).
 *
 * @ai-context: 从 InspirationPage 拆出的批量模式 UI：进入/退出批量、全选/取消全选、
 * 一键分析（AIThinkingIndicator 分析中状态）、分析进度文案与进度条。选中数量与
 * 进度经 props 由页面状态驱动，渲染结构与原内联 JSX 完全一致。
 * @ai-context: Extracted from InspirationPage; selection count and progress are
 * driven by page state via props, markup identical to the original inline JSX.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Wand2 } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';

interface BatchControlsProps {
  batchMode: boolean;
  onToggleBatchMode: () => void;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBatchSort: () => void;
  batchProcessing: boolean;
  progress: number;
  total: number;
}

export default function BatchControls({
  batchMode,
  onToggleBatchMode,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBatchSort,
  batchProcessing,
  progress,
  total,
}: BatchControlsProps) {
  return (
    <>
      {/* ── 批量模式入口 ── */}
      <div className="flex items-center justify-between mt-1">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onToggleBatchMode}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            batchMode
              ? 'bg-accent-500/10 border-accent-400/40 text-accent-600 dark:text-accent-400'
              : 'bg-bg-secondary border-border/40 text-text-tertiary hover:text-text-secondary',
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          {batchMode ? '退出批量' : '批量整理'}
        </motion.button>
        {batchMode && selectedCount > 0 && (
          <span className="text-c1 text-text-tertiary">已选中 {selectedCount} 条</span>
        )}
      </div>
      {/* ── 批量操作条 ── */}
      <AnimatePresence>
        {batchMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 flex-wrap pt-1"
          >
            <motion.button whileTap={{ scale: 0.95 }} onClick={onSelectAll}
              className="px-2 py-0.5 rounded-full text-xs font-medium text-text-secondary bg-bg-secondary border border-border/40 hover:text-text-primary transition-colors">
              全选
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={onDeselectAll}
              className="px-2 py-0.5 rounded-full text-xs font-medium text-text-tertiary bg-bg-secondary border border-border/40 hover:text-text-secondary transition-colors">
              取消全选
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onBatchSort}
              disabled={selectedCount === 0 || batchProcessing}
              className={cn(
                'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium',
                'bg-gradient-to-r from-cyber to-brand-500 text-text-inverse',
                'hover:from-cyber/90 hover:to-brand-600 shadow-sm shadow-cyber/20',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {batchProcessing ? (<><AIThinkingIndicator size={3} gap={2} />分析中...</>) : (<><Wand2 className="w-3 h-3" />一键分析</>)}
            </motion.button>
            {batchProcessing && (
              <span className="text-c1 text-text-tertiary">正在分析 {progress}/{total}...</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── 批量进度条 ── */}
      {batchProcessing && total > 0 && (
        <div className="w-full h-1.5 rounded-full bg-bg-secondary overflow-hidden mt-1">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cyber to-brand-500"
            initial={{ width: 0 }}
            animate={{ width: `${(progress / total) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </>
  );
}
