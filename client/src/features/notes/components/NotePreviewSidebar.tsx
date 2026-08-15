/**
 * @ai-context: 笔记页右栏预览侧栏：选中笔记的模板/标签/时间/内容预览 + 打开编辑按钮；
 * 未选中时展示 EmptyState。自 NotesPage.tsx 原样拆出；选中笔记与打开动作经 props 注入。
 * @ai-context: Right preview sidebar extracted verbatim from NotesPage.tsx. The
 * selected note and the open action are injected via props.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { Tag, EmptyState } from '@/components/ui';
import type { Note } from '@/types/models';
import type { NoteTemplate } from '../components/TemplateSelector';
import { templateLabels, stripHtml } from '../lib/noteCardFx';
import { formatDate } from '@/lib/utils/time';

interface NotePreviewSidebarProps {
  /** 是否展开（sideMode === 'right'） */
  visible: boolean;
  /** 当前选中笔记（无选中则展示空状态） */
  selectedNote: Note | null;
  /** 打开笔记编辑页 */
  onOpen: (id: string) => void;
}

export default function NotePreviewSidebar({ visible, selectedNote, onOpen }: NotePreviewSidebarProps) {
  return (
    /* mode="wait" 确保旧侧栏完全收起后再展开新内容，避免动画残帧 */
    <AnimatePresence mode="wait">
      {visible && (
        <motion.aside
          key="preview-sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative z-[5] hidden lg:flex flex-col w-80 flex-shrink-0 border-l border-border/30 bg-bg-primary/40 backdrop-blur-xl overflow-y-auto"
          style={{ filter: 'saturate(0.9) brightness(0.98)' }}
        >
          <AnimatePresence mode="wait">
            {selectedNote ? (
              <motion.div
                key={selectedNote.id}
                initial={{ opacity: 0, x: 12, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -8, scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }}
                className="p-kb-md flex flex-col gap-4"
              >
                <div>
                  <h2 className="text-[18px] font-semibold text-text-primary">{selectedNote.title}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Tag color="note">{templateLabels[selectedNote.template as NoteTemplate]}</Tag>
                    {selectedNote.tags.map((tag) => (
                      <Tag key={tag} color="default">{tag}</Tag>
                    ))}
                  </div>
                  <span className="text-[11px] text-text-tertiary block mt-2 font-mono">{formatDate(selectedNote.updatedAt)}</span>
                </div>
                <div className="border-t border-border/30 pt-4">
                  <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-[12]">
                    {stripHtml(selectedNote.content)}
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onOpen(selectedNote.id)}
                  className="w-full py-2 rounded-[var(--kb-radius-sm)] text-[13px] font-medium border border-border/40 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/30 transition-all duration-200"
                >
                  打开编辑
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="empty-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex items-center justify-center"
              >
                <EmptyState
                  icon={<FileText className="w-12 h-12" strokeWidth={1.2} />}
                  title="选择一篇笔记查看详情"
                  description="点击左侧列表中的任意笔记，在此处预览其内容"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
