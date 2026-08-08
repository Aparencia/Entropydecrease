/**
 * 学习流面板——笔记-费曼-闪卡三角闭环可视化
 * Learning flow panel — note-feynman-flashcard triangle visualization
 *
 * @ai-context: 展示当前笔记的完整学习状态：笔记状态（草稿/已整理/已复习）、
 * 费曼状态（未创建/已创建/已掌握）、闪卡状态（已生成/已复习/已掌握）。
 * 以深海探索进度条的方式展示整体进度。
 * @ai-context: Shows the complete learning status of the current note:
 * note status (draft/sorted/reviewed), feynman status (not created/created/
 * mastered), flashcard status (generated/reviewed/mastered).
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, GraduationCap, Layers, TrendingUp, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LearningFlowProps {
  noteId: string;
  noteTitle: string;
  noteWordCount: number;
  hasFeynmanSession: boolean;
  hasFlashcards: boolean;
  isOpen: boolean;
  onClose: () => void;
}

type FlowStage = 'draft' | 'sorted' | 'reviewed' | 'feynman_created' | 'feynman_mastered' | 'flashcard_created' | 'flashcard_reviewed';

const STAGE_CONFIG: Record<FlowStage, { label: string; icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>; depth: string; color: string }> = {
  draft: { label: '草稿', icon: FileText, depth: '海面', color: 'text-sky-400' },
  sorted: { label: '已整理', icon: Layers, depth: '浅海', color: 'text-blue-400' },
  reviewed: { label: '已复习', icon: TrendingUp, depth: '中层', color: 'text-indigo-400' },
  feynman_created: { label: '已创建费曼', icon: GraduationCap, depth: '深海', color: 'text-violet-400' },
  feynman_mastered: { label: '费曼已掌握', icon: GraduationCap, depth: '海沟', color: 'text-purple-400' },
  flashcard_created: { label: '已生成闪卡', icon: Layers, depth: '深海', color: 'text-violet-400' },
  flashcard_reviewed: { label: '闪卡已复习', icon: TrendingUp, depth: '海沟', color: 'text-purple-400' },
};

export function LearningFlow({
  noteId,
  noteTitle,
  noteWordCount,
  hasFeynmanSession,
  hasFlashcards,
  isOpen,
  onClose,
}: LearningFlowProps) {
  const navigate = useNavigate();

  // 计算当前进度
  const stages: FlowStage[] = ['draft'];
  if (noteWordCount > 100) stages.push('sorted');
  if (hasFeynmanSession) {
    stages.push('feynman_created');
    stages.push('feynman_mastered');
  }
  if (hasFlashcards) {
    stages.push('flashcard_created');
    stages.push('flashcard_reviewed');
  }

  const progress = Math.min((stages.length / 7) * 100, 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed right-0 top-0 h-full w-80 z-50 backdrop-blur-xl bg-bg-elevated/90 border-l border-border/40 shadow-kb-lg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <div className="flex items-center gap-2 px-4 py-4 border-b border-border/40 flex-shrink-0">
            <div className="w-8 h-8 rounded-kb-full bg-brand-50 flex items-center justify-center">
              <TrendingUp className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-b1 font-semibold text-text-primary">学习流</h2>
              <p className="text-c1 text-text-tertiary truncate">{noteTitle}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors">
              <X className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* 深海进度条 */}
            <div>
              <p className="text-b3 font-medium text-text-primary mb-2">探索进度</p>
              <div className="relative h-3 rounded-full bg-bg-tertiary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(to right, rgb(56,189,248), rgb(124,58,237))',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-c1 text-text-tertiary">
                <span>海面</span>
                <span>海沟</span>
              </div>
            </div>

            {/* 三角闭环状态 */}
            <div className="space-y-3">
              {/* 笔记状态 */}
              <div className="p-3 rounded-kb-md border border-border/30 bg-bg-secondary">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
                  <span className="text-b3 font-medium text-text-primary">笔记</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', noteWordCount > 0 ? 'bg-semantic-success' : 'bg-bg-tertiary')} />
                  <span className="text-c1 text-text-secondary">
                    {noteWordCount > 0 ? `${noteWordCount} 字 · 已记录` : '空笔记'}
                  </span>
                </div>
                {noteWordCount > 100 && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-semantic-success" />
                    <span className="text-c1 text-text-secondary">内容已达标</span>
                  </div>
                )}
              </div>

              {/* 费曼状态 */}
              <div className="p-3 rounded-kb-md border border-border/30 bg-bg-secondary">
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap className="w-4 h-4 text-feynman" strokeWidth={1.5} />
                  <span className="text-b3 font-medium text-text-primary">费曼</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', hasFeynmanSession ? 'bg-semantic-success' : 'bg-bg-tertiary')} />
                  <span className="text-c1 text-text-secondary">
                    {hasFeynmanSession ? '已创建费曼讲解' : '未创建费曼讲解'}
                  </span>
                </div>
                {!hasFeynmanSession && (
                  <button
                    onClick={() => navigate(`/feynman/new?concept=${encodeURIComponent(noteTitle)}`)}
                    className="mt-2 flex items-center gap-1 text-c1 text-feynman hover:text-feynman/80 transition-colors"
                  >
                    <GraduationCap className="w-3 h-3" strokeWidth={1.5} />
                    创建费曼讲解
                    <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {/* 闪卡状态 */}
              <div className="p-3 rounded-kb-md border border-border/30 bg-bg-secondary">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
                  <span className="text-b3 font-medium text-text-primary">闪卡</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', hasFlashcards ? 'bg-semantic-success' : 'bg-bg-tertiary')} />
                  <span className="text-c1 text-text-secondary">
                    {hasFlashcards ? '已生成闪卡' : '未生成闪卡'}
                  </span>
                </div>
                {!hasFlashcards && (
                  <button
                    onClick={() => navigate(`/notes/${noteId}`)}
                    className="mt-2 flex items-center gap-1 text-c1 text-amber-600 hover:text-amber-700 transition-colors"
                  >
                    <Layers className="w-3 h-3" strokeWidth={1.5} />
                    生成闪卡
                    <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>

            {/* 建议 */}
            <div className="p-3 rounded-kb-md bg-brand-50 border border-brand-200/30">
              <p className="text-b3 font-medium text-brand-700 mb-1">下一步建议</p>
              <p className="text-c1 text-brand-600/80">
                {!hasFeynmanSession && !hasFlashcards
                  ? '创建费曼讲解或生成闪卡来巩固学习效果'
                  : !hasFeynmanSession
                    ? '试试费曼学习法，用讲解来检验理解深度'
                    : !hasFlashcards
                      ? '生成闪卡加入间隔重复复习'
                      : '继续保持！定期复习保持记忆'}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LearningFlow;