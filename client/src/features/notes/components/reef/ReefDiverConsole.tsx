/**
 * 沉浸式控制盘（3D 视图悬浮控制层）
 * Immersive diver console (floating control layer for 3D views)
 *
 * @ai-context: Chronos 引力场原则——单一交互点。右下角圆形控制盘收纳全部
 * 现有功能入口（退出/搜索/文件夹/新建/剪藏/图谱/批量/折纸），顶部浮动胶囊
 * 承载形态名与搜索输入（声呐）。文件夹浮层单选扇区，选中态品牌色高亮。
 * @ai-context: Single interaction point per the gravity-field principle.
 * Round console at bottom-right gathers all existing actions; top capsule
 * hosts morph name and sonar search input. Folder layer picks a sector.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, FolderOpen, Plus, Clipboard, Share2, Layers, FoldVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NoteFolder } from '@/types/models';
import type { ReefMorph } from './reefTypes';

interface ReefDiverConsoleProps {
  morph: ReefMorph;
  folders: NoteFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNewNote: () => void;
  onClip: () => void;
  onGraph: () => void;
  onBatch: () => void;
  onOrigami: () => void;
  onExit: () => void;
}

const MORPH_LABEL: Record<ReefMorph, string> = {
  abyss: '沉降深渊',
  grotto: '穹顶石窟',
};

/** 控制盘按钮组（顺序即视觉层级） */
const BTN_CLS = cn(
  'w-9 h-9 rounded-full flex items-center justify-center',
  'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/40',
  'transition-all duration-200',
);

export function ReefDiverConsole({
  morph, folders, selectedFolderId, onSelectFolder,
  searchQuery, onSearchChange,
  onNewNote, onClip, onGraph, onBatch, onOrigami, onExit,
}: ReefDiverConsoleProps) {
  const [folderOpen, setFolderOpen] = useState(false);

  return (
    <>
      {/* 顶部浮动胶囊：形态名 + 搜索（声呐） */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-kb-full bg-bg-elevated/70 backdrop-blur-xl border border-border/40 shadow-kb-sm">
        <span className="text-c1 font-medium text-text-secondary whitespace-nowrap">
          {MORPH_LABEL[morph]}
        </span>
        <span className="w-px h-3.5 bg-border/40" aria-hidden="true" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" strokeWidth={1.5} />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="声呐搜索…"
            aria-label="声呐搜索笔记"
            className="w-36 pl-7 pr-2 py-1 rounded-kb-full text-c1 bg-bg-tertiary/30 border border-transparent focus:border-brand-400/50 focus:bg-bg-elevated outline-none text-text-primary placeholder:text-text-tertiary/60 transition-colors duration-200"
          />
        </div>
      </div>

      {/* 文件夹扇区浮层（控制盘上方弹出） */}
      <AnimatePresence>
        {folderOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-24 right-4 z-30 w-44 max-h-64 overflow-y-auto rounded-kb-lg bg-bg-elevated/90 backdrop-blur-xl border border-border/40 shadow-kb-md p-1.5"
          >
            <button
              onClick={() => { onSelectFolder(null); setFolderOpen(false); }}
              className={cn(
                'w-full text-left px-2.5 py-1.5 rounded-kb-sm text-c1 transition-colors duration-150',
                selectedFolderId === null
                  ? 'bg-brand-500/10 text-brand-600 font-medium'
                  : 'text-text-secondary hover:bg-bg-tertiary/40',
              )}
            >
              全部笔记
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => { onSelectFolder(f.id); setFolderOpen(false); }}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-kb-sm text-c1 truncate transition-colors duration-150',
                  selectedFolderId === f.id
                    ? 'bg-brand-500/10 text-brand-600 font-medium'
                    : 'text-text-secondary hover:bg-bg-tertiary/40',
                )}
              >
                {f.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右下角圆形控制盘 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="absolute bottom-4 right-4 z-20 flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-bg-elevated/70 backdrop-blur-xl border border-border/40 shadow-kb-md"
      >
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onExit}
          title="退出沉浸视图"
          aria-label="退出沉浸视图"
          className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-500/15 text-brand-600 hover:bg-brand-500/25 transition-colors duration-200"
        >
          <X className="w-4 h-4" strokeWidth={1.8} />
        </motion.button>
        <span className="w-6 h-px bg-border/40 my-0.5" aria-hidden="true" />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setFolderOpen((v) => !v)}
          title="文件夹扇区"
          aria-label="文件夹扇区"
          className={cn(BTN_CLS, folderOpen && 'bg-brand-500/10 text-brand-600')}
        >
          <FolderOpen className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onNewNote} title="新建笔记" aria-label="新建笔记" className={BTN_CLS}>
          <Plus className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClip} title="剪藏" aria-label="剪藏" className={BTN_CLS}>
          <Clipboard className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onGraph} title="笔记图谱" aria-label="笔记图谱" className={BTN_CLS}>
          <Share2 className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBatch} title="批量管理" aria-label="批量管理" className={BTN_CLS}>
          <Layers className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onOrigami} title="折纸视图" aria-label="折纸视图" className={BTN_CLS}>
          <FoldVertical className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
      </motion.div>
    </>
  );
}

export default ReefDiverConsole;
