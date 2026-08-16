/**
 * @ai-context: 笔记页左栏文件夹侧栏：新建文件夹输入、全部笔记/分组列表（SubjectFolder）、
 * 标签筛选区。自 NotesPage.tsx 原样拆出；状态/动作全部经 props 注入，动画结构原样保留。
 * @ai-context: Left folder sidebar extracted verbatim from NotesPage.tsx. All
 * state/actions are injected via props; the AnimatePresence structure is preserved.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { FolderPlus } from 'lucide-react';
import { Tag } from '@/components/ui';
import { Tip } from '@/components/ui/Tip';
import { cn } from '@/lib/utils';
import type { NoteFolder } from '@/types/models';
import SubjectFolder from '../components/SubjectFolder';

interface NotesFolderSidebarProps {
  /** 是否展开（sideMode === 'left'） */
  visible: boolean;
  /** 新建文件夹输入框是否显示 */
  showNewFolder: boolean;
  /** 新建文件夹名称 */
  newFolderName: string;
  /** 新建文件夹名称变化 */
  onNewFolderNameChange: (v: string) => void;
  /** 切换新建文件夹输入框显隐 */
  onToggleNewFolder: () => void;
  /** 确认新建文件夹（Enter 或确定按钮） */
  onCreateFolder: () => void;
  /** 关闭新建文件夹输入框（Escape） */
  onCloseNewFolder: () => void;
  /** 当前选中文件夹 id（null=全部笔记） */
  selectedFolderId: string | null;
  /** 选中「全部笔记」 */
  onSelectAllNotes: () => void;
  /** 响应式笔记总数（侧边栏"全部笔记"计数） */
  totalNotes: number;
  /** 分组列表 */
  folders: NoteFolder[];
  /** 选中分组 */
  onSelectFolder: (id: string | null) => void;
  /** 重命名分组 */
  onRenameFolder: (id: string, newName: string) => Promise<void>;
  /** 请求删除分组（父层弹确认框） */
  onDeleteFolder: (folder: NoteFolder) => void;
  /** 当前标签筛选项 */
  selectedTags: string[];
  /** 清除标签筛选 */
  onClearTagFilter: () => void;
  /** 全量标签列表 */
  allTags: string[];
  /** 点击标签切换筛选 */
  onToggleTag: (tag: string) => void;
}

export default function NotesFolderSidebar({
  visible,
  showNewFolder,
  newFolderName,
  onNewFolderNameChange,
  onToggleNewFolder,
  onCreateFolder,
  onCloseNewFolder,
  selectedFolderId,
  onSelectAllNotes,
  totalNotes,
  folders,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
  selectedTags,
  onClearTagFilter,
  allTags,
  onToggleTag,
}: NotesFolderSidebarProps) {
  return (
    /* mode="wait" 确保旧侧栏完全收起后再展开新内容，避免动画残帧 */
    <AnimatePresence mode="wait">
      {visible && (
        <motion.aside
          key="folder-sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 200, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative z-0 hidden md:flex flex-col flex-shrink-0 border-r border-border/30 bg-bg-primary/60 backdrop-blur-xl overflow-y-auto overflow-x-hidden"
        >
          <div className="opacity-[0.85] hover:opacity-100 transition-opacity duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between p-kb-md pb-2">
            <span className="text-[13px] font-semibold text-text-primary">文件夹</span>
            {/* 新建文件夹按钮，带 tooltip */}
            <Tip text="新建文件夹">
            <motion.button
              whileTap={{ scale: 0.9, rotate: 90 }}
              onClick={onToggleNewFolder}
              className="p-1.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-all duration-200"
            >
              <FolderPlus className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            </Tip>
          </div>

          {showNewFolder && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="flex items-center gap-1.5 px-4 pb-2"
            >
              <input
                autoFocus value={newFolderName}
                onChange={(e) => onNewFolderNameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onCreateFolder(); if (e.key === 'Escape') onCloseNewFolder(); }}
                placeholder="文件夹名称"
                className="flex-1 min-w-0 px-2 py-1 text-[13px] bg-bg-tertiary/50 border border-border/40 rounded-[var(--kb-radius-sm)] outline-none focus:border-brand-400 text-text-primary transition-colors duration-200"
              />
              <button onClick={onCreateFolder} className="px-2 py-1 text-[11px] text-brand-600 font-medium hover:bg-brand-50 rounded-[var(--kb-radius-sm)] transition-all duration-200">
                确定
              </button>
            </motion.div>
          )}

          <nav className="flex flex-col gap-0.5 px-2">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onSelectAllNotes}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-[var(--kb-radius-sm)] text-[13px] relative transition-all duration-200',
                selectedFolderId === null
                  ? 'bg-brand-50/80 text-brand-700 font-medium shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]'
                  : 'text-text-secondary hover:bg-bg-tertiary/40',
              )}
            >
              {selectedFolderId === null && (
                <motion.span layoutId="folder-active" className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-brand-500 rounded-[1px]" transition={{ type: 'spring', stiffness: 350, damping: 30 }} />
              )}
              <span>全部笔记</span>
              <span className="text-[11px] text-text-tertiary font-mono">{totalNotes}</span>
            </motion.button>
            {folders.map((f) => (
              <SubjectFolder
                key={f.id}
                folder={f}
                isSelected={selectedFolderId === f.id}
                onSelect={onSelectFolder}
                onRename={onRenameFolder}
                onDelete={(id) => {
                  const target = folders.find((x) => x.id === id);
                  if (target) {
                    onDeleteFolder(target);
                  }
                }}
              />
            ))}
          </nav>

          {/* 标签筛选区：点击标签筛选笔记（再点取消，可逆）；选中高亮 */}
          <div className="mt-3 border-t border-border/20 pt-2">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[12px] font-semibold text-text-tertiary">标签</span>
              {selectedTags.length > 0 && (
                <button
                  onClick={onClearTagFilter}
                  className="text-[11px] text-brand-600 hover:text-brand-700 transition-colors"
                >
                  清除筛选
                </button>
              )}
            </div>
            {allTags.length === 0 ? (
              <p className="px-3 py-1 text-[11px] text-text-tertiary/60">暂无标签</p>
            ) : (
              <div className="flex flex-wrap gap-1 px-3 py-1">
                {allTags.map((tag) => (
                  <Tag
                    key={tag}
                    color="default"
                    active={selectedTags.includes(tag)}
                    onClick={() => onToggleTag(tag)}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
            )}
          </div>

        </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
