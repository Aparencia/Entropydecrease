/**
 * @ai-context: 沉浸 3D 视图（双主题双形态：深色=沉降深渊 / 浅色=穹顶石窟）：
 * AnimatePresence 形态切换 + AbyssView2D/GrottoView3D + ReefDiverConsole 控制盘。
 * 自 NotesPage.tsx 原样拆出；节点投影（reefNotes）与搜索高亮（highlightIds）的
 * useMemo 一并内聚于此（仅本视图使用），其余状态/动作全部经 props 注入。
 * @ai-context: Immersive 3D view (dark=abyss / light=grotto) with morph transition
 * and diver console, extracted verbatim from NotesPage.tsx. The reef projection
 * and search-highlight memos live here (used only by this view); other state/actions
 * are injected via props.
 */
import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Note, NoteFolder } from '@/types/models';
import { AbyssView2D } from '../components/reef/AbyssView2D';
import { GrottoView3D } from '../components/reef/GrottoView3D';
import { ReefDiverConsole } from '../components/reef/ReefDiverConsole';
import type { ReefMorph, ReefNote } from '../components/reef/reefTypes';

interface Immersive3DViewProps {
  /** 过滤后的笔记列表（本视图内部投影为无 content 的 ReefNote） */
  notes: Note[];
  /** 当前选中笔记 id */
  selectedId: string | null;
  /** 当前 hover 笔记 id */
  hoveredId: string | null;
  /** 当前文件夹筛选（dim 未命中笔记） */
  focusFolderId: string | null;
  /** 主题 → 3D 形态：深色=abyss / 浅色=grotto */
  morph: ReefMorph;
  /** 文件夹列表（控制盘筛选） */
  folders: NoteFolder[];
  /** 搜索词（控制盘声呐 + 声呐点亮高亮） */
  searchQuery: string;
  /** hover 变化回调 */
  onHover: (id: string | null) => void;
  /** 选中笔记回调 */
  onSelect: (id: string) => void;
  /** 打开笔记回调 */
  onOpen: (id: string) => void;
  /** 退出沉浸视图回调 */
  onExit: () => void;
  /** 选择文件夹回调 */
  onSelectFolder: (id: string | null) => void;
  /** 搜索词变化回调 */
  onSearchChange: (q: string) => void;
  /** 新建笔记回调（打开模板选择器） */
  onNewNote: () => void;
  /** 剪藏回调（打开剪藏弹窗） */
  onClip: () => void;
  /** 打开笔记图谱回调 */
  onGraph: () => void;
  /** 进入批量模式回调（先退出 3D 视图） */
  onBatch: () => void;
  /** 进入折纸视图回调（先退出 3D 视图） */
  onOrigami: () => void;
}

export default function Immersive3DView({
  notes,
  selectedId,
  hoveredId,
  focusFolderId,
  morph,
  folders,
  searchQuery,
  onHover,
  onSelect,
  onOpen,
  onExit,
  onSelectFolder,
  onSearchChange,
  onNewNote,
  onClip,
  onGraph,
  onBatch,
  onOrigami,
}: Immersive3DViewProps) {
  // 3D 视图节点投影（无 content 全文，与 P1-1 惰性加载兼容）
  const reefNotes = useMemo<ReefNote[]>(() => notes.map((n) => ({
    id: n.id,
    title: n.title,
    template: n.template,
    wordCount: n.wordCount ?? 0,
    updatedAt: n.updatedAt,
    folderId: n.folderId,
    tags: n.tags,
    pinned: n.pinned,
  })), [notes]);

  // 搜索高亮：声呐点亮（标题/标签匹配；空搜索=全亮）
  const highlightIds = useMemo<ReadonlySet<string> | null>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const n of notes) {
      if (
        n.title.toLowerCase().includes(q)
        || n.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        set.add(n.id);
      }
    }
    return set;
  }, [notes, searchQuery]);

  return (
    <div className="relative flex-1 min-w-0 h-full">
      {/* 主题切换时形态淡入淡出（mode="wait"：旧 Canvas 卸载后再挂载新形态，避免双 Canvas 共存） */}
      <AnimatePresence mode="wait">
        <motion.div
          key={morph}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {morph === 'abyss' ? (
            <AbyssView2D
              notes={reefNotes}
              selectedId={selectedId}
              hoveredId={hoveredId}
              highlightIds={highlightIds}
              focusFolderId={focusFolderId}
              onHover={onHover}
              onSelect={onSelect}
              onOpen={onOpen}
              onExit={onExit}
            />
          ) : (
            <GrottoView3D
              notes={reefNotes}
              selectedId={selectedId}
              hoveredId={hoveredId}
              highlightIds={highlightIds}
              focusFolderId={focusFolderId}
              onHover={onHover}
              onSelect={onSelect}
              onOpen={onOpen}
              onExit={onExit}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <ReefDiverConsole
        morph={morph}
        folders={folders}
        selectedFolderId={focusFolderId}
        onSelectFolder={onSelectFolder}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onNewNote={onNewNote}
        onClip={onClip}
        onGraph={onGraph}
        onBatch={onBatch}
        onOrigami={onOrigami}
        onExit={onExit}
      />
    </div>
  );
}
