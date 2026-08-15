/**
 * 费曼会话列表卡片
 *
 * @ai-context: 从 FeynmanPage 拆出。单条学习会话卡片：状态指示条/图标/
 * 标签/相对时间/更多操作/两段式删除确认（点删除→行内确认）。
 * 更多按钮经合成事件坐标弹出与右键相同的 ContextMenu。
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Tag } from '@/components/ui';
import { BookOpen, AlertTriangle, Trash2, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeynmanNote, FeynmanWeakPoint } from '@/types/models';
import { formatRelativeDate } from './formatRelativeDate';

// react-refresh: 组件文件只导出组件；formatRelativeDate 已移至 ./formatRelativeDate，
// 此处 re-export 保持导出签名不变
// oxlint-disable-next-line react/only-export-components
export { formatRelativeDate } from './formatRelativeDate';

const stepLabels: Record<number, string> = { 1: '选择概念', 2: '讲解中', 3: '标注薄弱', 4: '简化重述' };

const statusConfig: Record<string, { label: string; color: 'default' | 'feynman' | 'brand' }> = {
  not_started: { label: '未开始', color: 'default' },
  in_progress: { label: '进行中', color: 'feynman' },
  completed:   { label: '已完成', color: 'brand' },
};

const noteCardVariants = {
  hidden: { opacity: 0, x: -20, scale: 0.97 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
  exit: { opacity: 0, x: 20, scale: 0.95, transition: { duration: 0.2 } },
};

interface FeynmanNoteCardProps {
  note: FeynmanNote;
  weakPoints: FeynmanWeakPoint[];
  deleteConfirming: boolean;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMoreClick: (e: React.MouseEvent) => void;
  onRequestDelete: () => void;
  onConfirmDelete: (e: React.MouseEvent) => void;
  onCancelDelete: () => void;
}

export function FeynmanNoteCard({
  note: n, weakPoints, deleteConfirming,
  onOpen, onContextMenu, onMoreClick,
  onRequestDelete, onConfirmDelete, onCancelDelete,
}: FeynmanNoteCardProps) {
  const { label, color } = statusConfig[n.status] ?? statusConfig.not_started;
  const weakCount = weakPoints.filter((wp) => !wp.mastered).length;
  const isCompleted = n.status === 'completed';
  const isInProgress = n.status === 'in_progress';

  return (
    <motion.div
      layout
      variants={noteCardVariants}
      whileHover={{ x: 4, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
      whileTap={{ scale: 0.98, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
      exit={noteCardVariants.exit}
    >
      <div
        className="group relative flex items-center gap-4 p-kb-md rounded-[var(--kb-radius-md)]
          bg-bg-secondary/60 backdrop-blur-xl border border-border/30
          hover:border-[#F59E0B]/30 cursor-pointer overflow-hidden
          transition-colors duration-300"
        onClick={onOpen}
        onContextMenu={onContextMenu}
      >
        {/* hover 光泽 */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.04) 0%, transparent 50%, rgba(245,158,11,0.02) 100%)',
          }}
        />

        {/* 左侧状态指示条 */}
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full"
          style={{
            background: isCompleted
              ? 'linear-gradient(180deg, #5B8A72, #4A7A62)'
              : isInProgress
                ? 'linear-gradient(180deg, #F59E0B, #D97706)'
                : 'linear-gradient(180deg, #9CA3AF, #6B7280)',
          }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
        />

        {/* 图标 */}
        <motion.div
          className={cn(
            'w-10 h-10 rounded-kb-lg flex items-center justify-center flex-shrink-0 relative z-10',
            isCompleted ? 'bg-brand-50 text-brand-600'
              : isInProgress ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
              : 'bg-bg-tertiary text-text-tertiary',
          )}
          whileHover={{ scale: 1.1, rotate: -5 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <BookOpen className="w-5 h-5" strokeWidth={1.5} />
          {isInProgress && (
            <motion.div
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#F59E0B]"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </motion.div>

        {/* 内容 */}
        <div className="flex-1 min-w-0 relative z-10">
          <h3 className="text-b1 font-medium text-text-primary truncate">{n.concept}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Tag color={color}>{label}</Tag>
            <Tag color="feynman">步骤 {n.currentStep}: {stepLabels[n.currentStep]}</Tag>
            {weakCount > 0 && (
              <motion.span
                className="inline-flex items-center gap-0.5 text-c1 text-[#F59E0B]"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                {weakCount}
              </motion.span>
            )}
            <span className="text-c1 text-text-tertiary ml-auto">
              {formatRelativeDate(n.updatedAt)}
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 relative z-10">
          <motion.button
            onClick={onMoreClick}
            className="p-1.5 rounded-kb-full text-text-tertiary/0 group-hover:text-text-tertiary
              hover:!text-text-primary hover:bg-bg-tertiary transition-all duration-200"
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            title="更多操作"
          >
            <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
          </motion.button>

          <AnimatePresence mode="popLayout">
            {deleteConfirming ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onConfirmDelete}
                  className="px-2.5 py-1 rounded-kb-md bg-semantic-error/10 text-semantic-error text-c1 font-medium hover:bg-semantic-error/20 transition-all"
                >
                  确认删除
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
                  className="px-2.5 py-1 rounded-kb-md text-c1 text-text-tertiary hover:bg-bg-tertiary transition-all"
                >
                  取消
                </motion.button>
              </motion.div>
            ) : (
              <motion.button
                key="delete"
                onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
                className="p-1.5 rounded-kb-full text-text-tertiary/0 group-hover:text-text-tertiary
                  hover:!text-semantic-error hover:bg-semantic-error/10 transition-all duration-200"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                title="删除会话"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
