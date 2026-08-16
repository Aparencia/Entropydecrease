/**
 * @ai-context: notes 功能模块页面：NotesPage。拆分说明（2026-08 R2 审计）：
 * 模块级工具/variants → lib/noteCardFx；卡片/侧栏/工具栏/3D 视图/列表区/弹窗 → components/；
 * store 订阅/动作/剪藏/分组删除/批量删除/文件操作 → hooks/。本文件仅保留状态、数据、handler 与布局编排。
 * @ai-context: Notes feature page split per 2026-08 R2 audit: utilities →
 * lib/noteCardFx; cards/sidebars/toolbar/3D-view/list-area/dialogs → components/;
 * store/context/clip/folder-delete/batch-delete/file-ops → hooks/.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tip } from '@/components/ui/Tip';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAIPodcast } from '@/lib/ai/hooks/useAIPodcast';
import { useContextMenu } from '@/lib/contextMenu';
import type { Note } from '@/types/models';
import type { ReefMorph } from '../components/reef/reefTypes';
import { TemplateSelector } from '../components/TemplateSelector';
import { MiniQuizDialog } from '../components/MiniQuizDialog';
import Immersive3DView from '../components/Immersive3DView';
import NotesToolbar from '../components/NotesToolbar';
import NotesFolderSidebar from '../components/NotesFolderSidebar';
import NotePreviewSidebar from '../components/NotePreviewSidebar';
import NotesListArea from '../components/NotesListArea';
import PodcastModal from '../components/PodcastModal';
import ClipImportDialog from '../components/ClipImportDialog';
import DeleteNoteDialog from '../components/DeleteNoteDialog';
import DeleteFolderDialog from '../components/DeleteFolderDialog';
import BatchDeleteDialog from '../components/BatchDeleteDialog';
import { useNoteStoreData } from '../hooks/useNoteStoreData';
import { useNoteActions } from '../hooks/useNoteActions';
import { useNoteFileActions } from '../hooks/useNoteFileActions';
import { useClipImport } from '../hooks/useClipImport';
import { useDeleteFolder } from '../hooks/useDeleteFolder';
import { useBatchDelete } from '../hooks/useBatchDelete';

export default function NotesPage() {
  // 侧栏三态（左右互斥二选一，可全隐藏）：'left'=文件夹栏 / 'right'=预览栏 / 'none'=中栏全宽
  const [sideMode, setSideMode] = useState<'left' | 'right' | 'none'>('left');
  // 左侧栏独立控制：展开左栏时自动收起右栏（互斥）；已展开则收起为 none
  const toggleLeftSidebar = useCallback(() => {
    setSideMode((m) => (m === 'left' ? 'none' : 'left'));
  }, []);
  // 右侧栏独立控制：展开右栏时自动收起左栏（互斥）；已展开则收起为 none
  const toggleRightSidebar = useCallback(() => {
    setSideMode((m) => (m === 'right' ? 'none' : 'right'));
  }, []);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  // 折纸视图开关：默认关闭，开启后笔记卡片以 OrigamiView 网格展示
  const [origamiMode, setOrigamiMode] = useState(false);
  // 沉浸 3D 视图开关（双主题双形态：深色=沉降深渊 / 浅色=海底石窟）——默认开启
  const [view3D, setView3D] = useState(true);
  const [hoveredId3D, setHoveredId3D] = useState<string | null>(null);
  const navigate = useNavigate();

  // 主题 → 3D 形态：深色=abyss（沉降深渊），浅色=grotto（穹顶石窟）
  const theme = useThemeStore((s) => s.theme);
  const morph: ReefMorph = theme === 'dark' ? 'abyss' : 'grotto';

  // 形态切换时清空 3D hover 状态（避免旧视图残留 hover 卡片带入新视图）
  useEffect(() => { setHoveredId3D(null); }, [morph]);

  // P1-5 细粒度订阅（集中声明于 useNoteStoreData，避免整 store 重渲染）
  const {
    notes, folders, selectedFolderId, selectedNoteId, searchQuery, selectedTags, selectedTemplate,
    loadNotes, loadFolders, selectNote, selectFolder, setSearchQuery, getFilteredNotes, toggleTag, toggleTemplate, clearTagFilter, getAllTags, totalNotes,
  } = useNoteStoreData();

  // P1 AI 播客：笔记转双人播客（useAIPodcast 自带网关直连与本地降级）
  const { podcast: podcastData, loading: podcastLoading, error: podcastError, generatePodcast } = useAIPodcast();
  const [podcastTopic, setPodcastTopic] = useState('');
  const [showPodcast, setShowPodcast] = useState(false);

  const {
    isOpen: ctxMenuOpen, position: ctxMenuPos, context: ctxMenuNote,
    handleContextMenu: handleNoteContextMenu, close: closeCtxMenu,
  } = useContextMenu<Note>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadNotes(); loadFolders(); }, []);

  // 缓存过滤/标签/选中结果，避免每次渲染都全量 filter/sort 所有笔记（P1-7 性能修复）
  const filteredNotes = useMemo(
    () => getFilteredNotes(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖 getFilteredNotes 读取的 store 字段
    [getFilteredNotes, notes, searchQuery, selectedTags, selectedTemplate, selectedFolderId, folders],
  );
  // Why: notes 依赖是刻意的——getAllTags 内部经 get() 隐式读取 store 的 notes，
  // linter 看不到该隐式依赖；若按提示移除 notes，标签列表在笔记增删后不再刷新。
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const allTags = useMemo(() => getAllTags(), [getAllTags, notes]);
  const selectedNote = useMemo(
    () => filteredNotes.find((n) => n.id === selectedNoteId) || null,
    [filteredNotes, selectedNoteId],
  );

  // 批量管理模式 + 批量删除确认（对齐萤火海沟批量整理交互）
  const { batch, deleteOpen: batchDeleteOpen, setDeleteOpen: setBatchDeleteOpen, confirm: handleConfirmBatchDelete } = useBatchDelete(filteredNotes);

  // 文件操作：Markdown 导入 / 复制 / 导出（P1-1 惰性取回全文）
  const { handleImportMarkdown, handleDuplicateNote, handleExportNote } = useNoteFileActions();

  // 核心动作：新建/模板新建/新建分组/选中/重命名/删除 + 右键菜单（含 AI 摘要/闪卡/播客）
  const {
    deleteTargetId, setDeleteTargetId, handleTemplateSelect, handleCreateNote, handleCreateFolder,
    handleSelectNote, handleRenameFolder, handleConfirmDelete, ctxMenuGroups, handleCtxMenuSelect,
  } = useNoteActions({
    newFolderName,
    onNewFolderCreated: () => { setNewFolderName(''); setShowNewFolder(false); },
    onDuplicate: handleDuplicateNote,
    onExport: handleExportNote,
    onPodcast: (topic) => { setPodcastTopic(topic); setShowPodcast(true); void generatePodcast(topic, 'basic'); },
  });

  // 分组删除：确认后执行（默认笔记移回根目录；可勾选同时删除组内全部笔记）
  const {
    deleteFolderTarget, setDeleteFolderTarget, withNotesChecked: deleteFolderWithNotesChecked,
    setWithNotesChecked: setDeleteFolderWithNotesChecked, noteCount: folderTreeNoteCount, confirm: handleConfirmDeleteFolder,
  } = useDeleteFolder();

  // 剪藏（网页/PDF 导入笔记）
  const { clipUrl, setClipUrl, clipOpen, setClipOpen, clipLoading, handleClipUrl, handleClipPdf } = useClipImport();

  return (
    /* 高度由 AppLayout 路由过渡容器（grid）显式锚定继承，与面板内容区精确一致：
     * 面板为 height:auto + max-h 容器，h-full 链曾退化为内容自然高（页面随笔记数量伸缩），
     * Notes 面板 !p-0 去内边距后，锚定公式收敛到布局层 grid（h-[calc(85vh-2px)] 等两档），页面层回归 h-full。
     * overflow-hidden：左右栏三态互斥后最多两栏（中栏 + 单侧栏），总宽可控，无横向滚动条 */
    <div className="flex h-full overflow-hidden">
      {/* ── 沉浸 3D 视图（双主题双形态：深色=沉降深渊 / 浅色=穹顶石窟） ── */}
      {view3D ? (
        <Immersive3DView
          notes={filteredNotes}
          selectedId={selectedNoteId}
          hoveredId={hoveredId3D}
          focusFolderId={selectedFolderId}
          morph={morph}
          folders={folders}
          searchQuery={searchQuery}
          onHover={setHoveredId3D}
          onSelect={(id) => selectNote(id)}
          onOpen={(id) => navigate(`/notes/${id}`)}
          onExit={() => setView3D(false)}
          onSelectFolder={selectFolder}
          onSearchChange={setSearchQuery}
          onNewNote={() => setTemplateOpen(true)}
          onClip={() => setClipOpen(true)}
          onGraph={() => navigate('/notes/graph')}
          onBatch={() => { setView3D(false); batch.setBatchMode(true); }}
          onOrigami={() => { setView3D(false); setOrigamiMode(true); }}
        />
      ) : (
      <>
      {/* ── 左栏：文件夹（三态互斥：sideMode==='left' 显示，预览栏隐藏） ── */}
      <NotesFolderSidebar
        visible={sideMode === 'left'}
        showNewFolder={showNewFolder}
        newFolderName={newFolderName}
        onNewFolderNameChange={setNewFolderName}
        onToggleNewFolder={() => setShowNewFolder((v) => !v)}
        onCreateFolder={handleCreateFolder}
        onCloseNewFolder={() => setShowNewFolder(false)}
        selectedFolderId={selectedFolderId}
        onSelectAllNotes={() => selectFolder(null)}
        totalNotes={totalNotes}
        folders={folders}
        onSelectFolder={selectFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={(folder) => { setDeleteFolderTarget(folder); setDeleteFolderWithNotesChecked(false); }}
        selectedTags={selectedTags}
        onClearTagFilter={clearTagFilter}
        allTags={allTags}
        onToggleTag={toggleTag}
      />
      {/* ── 中栏：笔记列表 ── */}
      <main className="relative z-10 flex-1 min-w-0 flex flex-col overflow-hidden">
        <NotesToolbar
          sideMode={sideMode}
          clipLoading={clipLoading}
          batchMode={batch.batchMode}
          batchCount={batch.count}
          origamiMode={origamiMode}
          view3D={view3D}
          onToggleLeftSidebar={toggleLeftSidebar}
          onToggleRightSidebar={toggleRightSidebar}
          onOpenGraph={() => navigate('/notes/graph')}
          onImportMarkdown={handleImportMarkdown}
          onClipPdf={handleClipPdf}
          onOpenClip={() => setClipOpen(true)}
          onOpenQuiz={() => setQuizOpen(true)}
          onToggleBatch={() => batch.setBatchMode(v => !v)}
          onSelectAll={batch.selectAll}
          onClearBatch={batch.clear}
          onOpenBatchDelete={() => setBatchDeleteOpen(true)}
          onToggleOrigami={() => setOrigamiMode(v => !v)}
          onToggleView3D={() => setView3D((v) => !v)}
          onNewNote={() => setTemplateOpen(true)}
        />

        {/* 列表 */}
        <NotesListArea
          notes={filteredNotes}
          origamiMode={origamiMode}
          batchMode={batch.batchMode}
          batchSelectedIds={batch.selectedIds}
          selectedNoteId={selectedNoteId}
          selectedTemplate={selectedTemplate}
          selectedTags={selectedTags}
          onSelect={(id) => batch.batchMode ? batch.toggle(id) : handleSelectNote(id)}
          onContextMenu={handleNoteContextMenu}
          onToggleTemplate={toggleTemplate}
          onToggleTag={toggleTag}
          onCreate={() => setTemplateOpen(true)}
        />

        {ctxMenuOpen && ctxMenuNote && (
          <ContextMenu<Note> groups={ctxMenuGroups} position={ctxMenuPos} context={ctxMenuNote} onSelect={handleCtxMenuSelect} onClose={closeCtxMenu} />
        )}
      </main>

      {/* ── 右栏：预览（三态互斥：sideMode==='right' 显示，文件夹栏隐藏） ── */}
      <NotePreviewSidebar
        visible={sideMode === 'right'}
        selectedNote={selectedNote}
        onOpen={(id) => navigate(`/notes/${id}`)}
      />

      </>
      )}

      {/* 移动端浮动新建笔记按钮，带 tooltip */}
      {!view3D && (
      <Tip text="新建笔记" side="left">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleCreateNote}
        className="md:hidden fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-[0_4px_16px_rgba(91,138,114,0.35)] flex items-center justify-center transition-shadow duration-200"
      >
        <Plus className="w-6 h-6" strokeWidth={2} />
      </motion.button>
      </Tip>
      )}

      <TemplateSelector open={templateOpen} onClose={() => setTemplateOpen(false)} onSelect={handleTemplateSelect} />

      <MiniQuizDialog open={quizOpen} onClose={() => setQuizOpen(false)} notes={filteredNotes} />

      {/* 剪藏弹窗：URL 网页剪藏 + PDF 导入 */}
      <ClipImportDialog
        open={clipOpen} clipUrl={clipUrl} clipLoading={clipLoading}
        onUrlChange={setClipUrl} onClipUrl={handleClipUrl} onClipPdf={handleClipPdf}
        onClose={() => setClipOpen(false)}
      />

      <DeleteNoteDialog
        open={!!deleteTargetId}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* 删除分组确认：组内笔记移回根目录，可选同时删除组内全部笔记 */}
      <DeleteFolderDialog
        open={!!deleteFolderTarget} folderName={deleteFolderTarget?.name ?? ''} noteCount={folderTreeNoteCount}
        withNotesChecked={deleteFolderWithNotesChecked} onWithNotesChange={setDeleteFolderWithNotesChecked}
        onCancel={() => { setDeleteFolderTarget(null); setDeleteFolderWithNotesChecked(false); }} onConfirm={handleConfirmDeleteFolder}
      />

      {/* 批量删除确认：真删除不可撤销 */}
      <BatchDeleteDialog
        open={batchDeleteOpen}
        count={batch.count}
        onCancel={() => setBatchDeleteOpen(false)}
        onConfirm={handleConfirmBatchDelete}
      />

      {/* P1 AI 播客弹层：笔记转双人播客（脚本 + TTS 分段播放） */}
      <PodcastModal
        open={showPodcast}
        topic={podcastTopic}
        loading={podcastLoading}
        error={podcastError}
        data={podcastData}
        onClose={() => setShowPodcast(false)}
      />
    </div>
  );
}
