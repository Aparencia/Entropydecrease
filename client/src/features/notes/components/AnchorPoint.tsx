/**
 * @ai-context: AI 锚点侧边栏——展示锚点概念；N4 对 importance 最高的锚点
 * 显示“适合费曼讲解”标记，一键创建费曼会话并跳转（奖赏回来：把难点变机会）。
 * N6 在锚点下方展示概念冲突卡（新旧理解矛盾），引导“先破后立”。
 */
import { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Clock, GraduationCap, GitCompare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFeynmanStore } from '@/features/feynman/store/useFeynmanStore';
import type { ConceptConflict } from '@/lib/ai/types';
import { FeynmanRecommendSidebar } from './FeynmanRecommendSidebar';

interface AnchorPointItem {
  id: string;
  concept: string;
  explanation?: string;
  createdAt: string;
  /** N4 AI 评估的重要度 0-1，最高者推荐费曼讲解 */
  importance?: number;
}

interface AnchorPointSidebarProps {
  noteId: string;
  anchorPoints: AnchorPointItem[];
  /** N6: 概念冲突列表（可为空） */
  conflicts?: ConceptConflict[];
  /** N6: 关闭冲突提示 */
  onDismissConflicts?: () => void;
  /** N4: 笔记正文（编辑器实时文本）——供费曼推荐概念提取 */
  noteContent?: string;
  /** N4: 笔记标题——费曼推荐概念优先取标题 */
  noteTitle?: string;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

const itemVariants = {
  hidden: { opacity: 0, x: 12, scale: 0.97 },
  visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.2 } },
};

export function AnchorPointSidebar({ noteId, anchorPoints, conflicts = [], onDismissConflicts, noteContent, noteTitle }: AnchorPointSidebarProps) {
  const navigate = useNavigate();
  const createFeynmanNote = useFeynmanStore((s) => s.createNote);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...anchorPoints].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [anchorPoints],
  );

  // N4：importance 最高且 ≥0.6 的锚点推荐费曼讲解
  const topAnchorId = useMemo(() => {
    const candidates = sorted.filter((a) => (a.importance ?? 0) >= 0.6);
    if (candidates.length === 0) return null;
    return candidates.reduce((m, a) => ((a.importance ?? 0) > (m.importance ?? 0) ? a : m)).id;
  }, [sorted]);

  const handleFeynman = useCallback(async (anchor: AnchorPointItem) => {
    if (navigatingId) return;
    setNavigatingId(anchor.id);
    try {
      const id = await createFeynmanNote(anchor.concept);
      navigate(`/feynman/${id}`);
    } catch {
      setNavigatingId(null); // 失败时恢复可点击，静默不打扰
    }
  }, [navigatingId, createFeynmanNote, navigate]);

  return (
    <div className="w-56 flex-shrink-0 border-l border-border/40 bg-bg-primary/80 overflow-y-auto">
      {/* 标题 */}
      <div className="sticky top-0 z-10 px-3 py-2.5 bg-bg-primary/90 backdrop-blur-sm border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Anchor className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
          <span className="text-b3 font-medium text-text-primary">AI 锚点</span>
          {sorted.length > 0 && (
            <span className="ml-auto text-c1 text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded-kb-full">
              {sorted.length}
            </span>
          )}
        </div>
      </div>

      {/* 内容 */}
      <div className="p-2 flex flex-col gap-2">
        {sorted.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <Anchor className="w-5 h-5 text-text-tertiary/40 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-c1 text-text-tertiary leading-relaxed">
              AI 锚点将在编辑 10–15 分钟后自动生成
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {sorted.map((anchor) => (
              <motion.div
                key={anchor.id}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout
                className={cn(
                  'rounded-kb-md p-2.5',
                  'bg-bg-elevated border border-border/30',
                  'shadow-kb-sm',
                )}
              >
                {/* 概念名 */}
                <div className="flex items-start gap-1.5 mb-1">
                  <span className="mt-1 w-1.5 h-1.5 rounded-kb-full bg-brand-500 flex-shrink-0" />
                  <p className="text-b3 font-semibold text-text-primary leading-snug">
                    {anchor.concept}
                  </p>
                </div>

                {/* 解释 */}
                {anchor.explanation && (
                  <p className="text-c1 text-text-secondary leading-relaxed pl-3 mb-1.5">
                    {anchor.explanation}
                  </p>
                )}

                {/* N4 费曼讲解引导：最高重要度锚点专属 */}
                {anchor.id === topAnchorId && (
                  <button
                    onClick={() => handleFeynman(anchor)}
                    disabled={navigatingId !== null}
                    className={cn(
                      'mt-1.5 ml-3 flex items-center gap-1 px-2 py-1 rounded-kb-full',
                      'text-c1 font-medium bg-accent-50 text-accent-600',
                      'hover:bg-accent-100 transition-colors duration-kb-fast',
                      'disabled:opacity-60',
                    )}
                  >
                    <GraduationCap className="w-3 h-3" strokeWidth={1.5} />
                    {navigatingId === anchor.id ? '正在准备…' : '适合费曼讲解，试试？'}
                  </button>
                )}

                {/* 时间 */}
                <div className="flex items-center gap-1 pl-3">
                  <Clock className="w-2.5 h-2.5 text-text-tertiary/60" strokeWidth={1.5} />
                  <span className="text-c2 text-text-tertiary/60">
                    {formatTimeAgo(anchor.createdAt)}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* N6 概念冲突卡：新旧理解矛盾提示（先破后立） */}
        {conflicts.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 px-2">
              <GitCompare className="w-3.5 h-3.5 text-semantic-warning" strokeWidth={1.5} />
              <span className="text-b3 font-medium text-text-primary">概念冲突</span>
              {onDismissConflicts && (
                <button
                  onClick={onDismissConflicts}
                  className="ml-auto p-0.5 rounded-full text-text-tertiary hover:text-text-primary transition-colors"
                  aria-label="关闭冲突提示"
                >
                  <X className="w-3 h-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
            {conflicts.map((c, i) => (
              <div key={i} className="rounded-kb-md p-2.5 bg-bg-elevated border border-semantic-warning/30 shadow-kb-sm">
                {c.topic && <p className="text-c1 font-semibold text-text-primary mb-1">{c.topic}</p>}
                <p className="text-c1 text-text-secondary leading-relaxed">
                  <span className="text-semantic-error/80">旧理解：</span>{c.oldClaim}
                </p>
                <p className="text-c1 text-text-secondary leading-relaxed mt-0.5">
                  <span className="text-semantic-success/80">新内容：</span>{c.newClaim}
                </p>
                {c.suggestion && (
                  <p className="text-c1 text-text-tertiary leading-relaxed mt-1 pt-1 border-t border-border/20">{c.suggestion}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* N4 笔记→费曼自动引导：内容达阈值且可提取概念时展示推荐卡 */}
        {noteContent !== undefined && (
          <FeynmanRecommendSidebar noteId={noteId} noteContent={noteContent} noteTitle={noteTitle ?? ''} />
        )}
      </div>
    </div>
  );
}
