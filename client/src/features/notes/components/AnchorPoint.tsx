/**
 * @ai-context: 通用组件：AnchorPoint。
 */
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnchorPointItem {
  id: string;
  concept: string;
  explanation?: string;
  createdAt: string;
}

interface AnchorPointSidebarProps {
  noteId: string;
  anchorPoints: AnchorPointItem[];
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

export function AnchorPointSidebar({ anchorPoints }: AnchorPointSidebarProps) {
  const sorted = useMemo(
    () => [...anchorPoints].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [anchorPoints],
  );

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
      </div>
    </div>
  );
}
