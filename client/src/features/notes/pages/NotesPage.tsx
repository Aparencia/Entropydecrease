/**
 * @ai-context: notes 功能模块页面：NotesPage。
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Tag, EmptyState, Modal } from '@/components/ui';
import { useToast } from '@/components/ui';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { VirtualList } from '@/components/ui/VirtualList';
import {
  Search, Plus, FolderPlus, FileText, PanelLeftClose, PanelLeft, Pin,
  MoreVertical, Trash2, Copy, Download, BookOpen, Sparkles, ListTodo, Share2,
} from 'lucide-react';
import { TemplateSelector } from '../components/TemplateSelector';
import type { NoteTemplate } from '../components/TemplateSelector';
import SubjectFolder from '../components/SubjectFolder';
import { NoteSearchBar } from '../components/NoteSearchBar';
import { NoteTagFilter } from '../components/NoteTagFilter';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useNoteStore } from '../store/useNoteStore';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '@/lib/contextMenu';
import type { Note } from '@/types/models';
import { useAISummarize, useAIFlashcards } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

const templateLabels: Record<NoteTemplate | 'qa' | 'video' | 'todo', string> = {
  outline: '大纲式', cornell: '康奈尔', mindmap: '思维导图', free: '自由笔记', blank: '空白', qa: '问答', video: '视频笔记', todo: '待办',
};

function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stripHtml(html: string): string {
  try {
    const json = JSON.parse(html);
    if (json?.content) {
      const extract = (nodes: unknown[]): string => {
        let text = '';
        for (const node of nodes) {
          const n = node as { text?: string; content?: unknown[] };
          if (n.text) text += n.text;
          if (n.content) text += extract(n.content);
        }
        return text;
      };
      return extract(json.content).slice(0, 120);
    }
    return '';
  } catch {
    return html.slice(0, 120);
  }
}

/* ── 动画 variants ── */
const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const noteCardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
};

/** 为每张卡片生成稳定的随机倾斜角度（基于 id hash） */
function cardTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return ((h % 10) - 5) * 0.1; // ±0.5deg
}

/** 不对称圆角样式（基于 id hash） */
function asymmetricRadius(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const base = 12;
  const tl = base + (Math.abs(h % 7));
  const tr = base + (Math.abs((h >> 4) % 6));
  const br = base + (Math.abs((h >> 8) % 8));
  const bl = base + (Math.abs((h >> 12) % 5));
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

/** 3D鼠标追踪倾斜 — 计算 rotateX/Y */
function calc3DTilt(e: React.MouseEvent<HTMLDivElement>, el: HTMLDivElement): { rx: number; ry: number } {
  const rect = el.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  return { rx: -y * 5, ry: x * 5 }; // ±2.5deg max
}

function colorForType(template: string): string {
  switch (template) {
    case 'cornell': return 'rgb(91,138,114)';   // brand-500
    case 'outline': return 'rgb(96,165,250)';   // accent-400
    case 'mindmap': return 'rgb(251,191,36)';   // note
    case 'todo':    return 'rgb(16,185,129)';   // emerald-500
    default:        return 'rgb(156,163,175)';  // border
  }
}

export default function NotesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const navigate = useNavigate();

  const {
    notes, folders, selectedFolderId, selectedNoteId, searchQuery, selectedTags,
    loadNotes, loadFolders, createNote, createFolder, updateFolder, selectNote, selectFolder,
    setSearchQuery, getFilteredNotes, createFromTemplate, toggleTag, getAllTags,
    deleteNote, togglePin,
  } = useNoteStore(useShallow(s => s));

  const { toast } = useToast();
  const { summarize } = useAISummarize();
  const { generate: aiGenerateCards } = useAIFlashcards();
  const handleSummarizeError = useAIErrorHandler('AI 摘要生成失败');
  const handleFlashcardError = useAIErrorHandler('AI 闪卡生成失败');

  const {
    isOpen: ctxMenuOpen, position: ctxMenuPos, context: ctxMenuNote,
    handleContextMenu: handleNoteContextMenu, close: closeCtxMenu,
  } = useContextMenu<Note>();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadNotes(); loadFolders(); }, []);

  // 缓存过滤/标签/选中结果，避免每次渲染都全量 filter/sort 所有笔记（P1-7 性能修复）
  const filteredNotes = useMemo(
    () => getFilteredNotes(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖 getFilteredNotes 读取的 store 字段
    [getFilteredNotes, notes, searchQuery, selectedTags, selectedFolderId, folders],
  );
  const allTags = useMemo(() => getAllTags(), [getAllTags, notes]);
  const selectedNote = useMemo(
    () => filteredNotes.find((n) => n.id === selectedNoteId) || null,
    [filteredNotes, selectedNoteId],
  );

  const handleTemplateSelect = async (tpl: NoteTemplate) => {
    const id = await createFromTemplate(tpl, selectedFolderId ?? undefined);
    selectNote(id); navigate(`/notes/${id}`);
  };
  const handleCreateNote = async () => {
    const id = await createNote({ title: '新笔记', template: 'blank', folderId: selectedFolderId ?? undefined });
    selectNote(id); navigate(`/notes/${id}`);
  };
  const handleCreateFolder = async () => {
    if (newFolderName.trim()) { await createFolder(newFolderName.trim()); setNewFolderName(''); setShowNewFolder(false); }
  };
  const handleSelectNote = (noteId: string) => { selectNote(noteId); navigate(`/notes/${noteId}`); };
  const handleRenameFolder = useCallback(async (id: string, newName: string) => {
    await updateFolder(id, { name: newName });
  }, [updateFolder]);

  const handleTogglePin = useCallback((noteId: string) => { togglePin(noteId); toast({ type: 'success', message: '已更新置顶状态' }); }, [togglePin, toast]);
  const handleDeleteNote = useCallback((id: string) => { setDeleteTargetId(id); }, []);
  const handleConfirmDelete = useCallback(async () => {
    if (deleteTargetId) { await deleteNote(deleteTargetId); soundPlayer.play('feedback_delete'); toast({ type: 'success', message: '笔记已删除', silent: true }); }
    setDeleteTargetId(null);
  }, [deleteTargetId, deleteNote, toast]);
  const handleDuplicateNote = useCallback(async (note: Note) => {
    await createNote({ title: note.title + ' (副本)', content: note.content, folderId: note.folderId, tags: note.tags, template: note.template });
    toast({ type: 'success', message: '笔记已复制' });
  }, [createNote, toast]);
  const handleExportNote = useCallback((note: Note) => {
    let text = note.title + '\n\n';
    try {
      const json = JSON.parse(note.content);
      if (json?.content) {
        const extract = (nodes: unknown[]): string => {
          let t = '';
          for (const node of nodes) {
            const n = node as { text?: string; content?: unknown[]; type?: string };
            if (n.text) t += n.text;
            if (n.content) t += extract(n.content);
            if (n.type === 'paragraph' || n.type === 'heading') t += '\n';
          }
          return t;
        };
        text += extract(json.content);
      }
    } catch { text += note.content; }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${note.title || 'note'}-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast({ type: 'success', message: '笔记已导出' });
  }, [toast]);

  const ctxMenuGroups = useMemo<ContextMenuGroup[]>(() => [
    { label: '笔记操作', items: [
      { key: 'open', label: '打开编辑', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'pin', label: '置顶/取消置顶', icon: <Pin className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'duplicate', label: '复制', icon: <Copy className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'export', label: '导出', icon: <Download className="w-4 h-4" strokeWidth={1.5} /> },
    ]},
    { label: 'AI 操作', items: [
      { key: 'ai-summary', label: '生成摘要', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'ai-flashcard', label: '生成闪卡', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
    ]},
    { items: [
      { key: 'delete', label: '删除', icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />, danger: true },
    ]},
  ], []);

  const handleCtxMenuSelect = useCallback(async (itemKey: string, noteCtx: Note) => {
    switch (itemKey) {
      case 'open': handleSelectNote(noteCtx.id!); break;
      case 'pin': handleTogglePin(noteCtx.id!); break;
      case 'duplicate': handleDuplicateNote(noteCtx); break;
      case 'export': handleExportNote(noteCtx); break;
      case 'delete': handleDeleteNote(noteCtx.id!); break;
      case 'ai-summary': {
        const text = stripHtml(noteCtx.content);
        if (text.length < 10) { toast({ type: 'warning', message: '笔记内容太少，无法生成摘要' }); break; }
        toast({ type: 'info', message: 'AI 正在生成摘要...' });
        try {
          const result = await summarize(text, { maxLength: 200, style: 'bullet', language: 'zh' });
          if (result?.summary) { await navigator.clipboard.writeText(result.summary); toast({ type: 'success', message: 'AI 摘要已生成并复制到剪贴板', silent: true }); }
          else { toast({ type: 'warning', message: 'AI 未能生成摘要，请检查内容或稍后重试', silent: true }); }
        } catch (error) { handleSummarizeError(error); }
        break;
      }
      case 'ai-flashcard': {
        const text = stripHtml(noteCtx.content);
        if (text.length < 20) { toast({ type: 'warning', message: '笔记内容太少，无法生成闪卡' }); break; }
        toast({ type: 'info', message: 'AI 正在生成闪卡...' });
        try {
          const result = await aiGenerateCards(text, { count: 10, difficulty: 'medium' });
          if (result?.cards?.length) { toast({ type: 'success', message: `AI 已生成 ${result.cards.length} 张闪卡，请在笔记编辑页中使用右键菜单逐张添加`, silent: true }); }
          else { toast({ type: 'warning', message: 'AI 未能生成闪卡，请检查内容或稍后重试', silent: true }); }
        } catch (error) { handleFlashcardError(error); }
        break;
      }
    }
  }, [handleSelectNote, handleTogglePin, handleDuplicateNote, handleExportNote, handleDeleteNote, toast, summarize, aiGenerateCards, handleSummarizeError, handleFlashcardError]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── 左栏：文件夹 ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 200, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative z-0 hidden md:flex flex-col flex-shrink-0 border-r border-border/30 bg-bg-primary/60 backdrop-blur-xl overflow-y-auto overflow-x-hidden"
          >
            <div className="opacity-[0.85] hover:opacity-100 transition-opacity duration-300 flex flex-col h-full">
            <div className="flex items-center justify-between p-kb-md pb-2">
              <span className="text-[13px] font-semibold text-text-primary">文件夹</span>
              <motion.button
                whileTap={{ scale: 0.9, rotate: 90 }}
                onClick={() => setShowNewFolder((v) => !v)}
                className="p-1.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-all duration-200"
              >
                <FolderPlus className="w-4 h-4" strokeWidth={1.5} />
              </motion.button>
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
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                  placeholder="文件夹名称"
                  className="flex-1 min-w-0 px-2 py-1 text-[13px] bg-bg-tertiary/50 border border-border/40 rounded-[var(--kb-radius-sm)] outline-none focus:border-brand-400 text-text-primary transition-colors duration-200"
                />
                <button onClick={handleCreateFolder} className="px-2 py-1 text-[11px] text-brand-600 font-medium hover:bg-brand-50 rounded-[var(--kb-radius-sm)] transition-all duration-200">
                  确定
                </button>
              </motion.div>
            )}

            <nav className="flex flex-col gap-0.5 px-2">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => selectFolder(null)}
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
                <span className="text-[11px] text-text-tertiary font-mono">{useNoteStore.getState().notes.length}</span>
              </motion.button>
              {folders.map((f) => (
                <SubjectFolder
                  key={f.id}
                  folder={f}
                  isSelected={selectedFolderId === f.id}
                  onSelect={selectFolder}
                  onRename={handleRenameFolder}
                />
              ))}
            </nav>


          </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── 中栏：笔记列表 ── */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="sticky top-0 z-20 flex flex-col gap-2 px-4 py-3 border-b border-border/30 flex-shrink-0 backdrop-blur-md bg-bg-primary/80">
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setSidebarOpen((v) => !v)}
              className="hidden md:flex p-1.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/40 transition-all duration-200"
            >
              {sidebarOpen ? <PanelLeftClose className="w-5 h-5" strokeWidth={1.5} /> : <PanelLeft className="w-5 h-5" strokeWidth={1.5} />}
            </motion.button>
            <NoteSearchBar />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/notes/graph')}
              title="笔记图谱"
              className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200"
            >
              <Share2 className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button size="sm" icon={<Plus className="w-4 h-4" strokeWidth={2} />} onClick={() => setTemplateOpen(true)}>
                新建笔记
              </Button>
            </motion.div>
          </div>
          <NoteTagFilter />
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 select-none">
              {/* 优雅空状态插图 */}
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 rounded-[var(--kb-radius-xl)] bg-gradient-to-br from-brand-100/60 to-accent-100/40 dark:from-brand-900/20 dark:to-accent-900/10 rotate-6" />
                <div className="absolute inset-2 rounded-[var(--kb-radius-lg)] bg-gradient-to-tl from-brand-50/80 to-white/60 dark:from-brand-950/30 dark:to-bg-elevated/50 -rotate-3 backdrop-blur-sm" />
                <FileText className="relative w-14 h-14 text-brand-400/70" strokeWidth={1} />
              </div>
              <div className="text-center max-w-xs">
                <h3 className="text-h2 font-semibold text-text-primary mb-2">创建第一个知识块</h3>
                <p className="text-b2 text-text-tertiary leading-relaxed">
                  每一个想法都值得被记录。开始构建属于你的知识宇宙，让思维的碎片在这里交织生长。
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setTemplateOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--kb-radius-lg)] bg-brand-500 text-white text-b2 font-medium shadow-[0_4px_20px_-4px_rgba(91,138,114,0.4)] hover:shadow-[0_8px_30px_-4px_rgba(91,138,114,0.5)] transition-shadow duration-300"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                开始创作
              </motion.button>
            </div>
          ) : filteredNotes.length > 50 ? (
            <VirtualList
              items={filteredNotes}
              estimateSize={110}
              overscan={6}
              className="overflow-y-auto"
              height="100%"
              getKey={(note) => note.id!}
              renderItem={(note) => (
                <Card
                  hoverable
                  padding="md"
                  onClick={() => handleSelectNote(note.id!)}
                  onContextMenu={(e) => handleNoteContextMenu(e, note)}
                  className={cn(
                    'group relative transition-all duration-300 mb-2',
                    'hover:-translate-y-[2px] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)]',
                    selectedNoteId === note.id && 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]',
                  )}
                >
                  <div
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: colorForType(note.template),
                      boxShadow: `0 0 8px ${colorForType(note.template)}40`,
                    }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {note.pinned && <Pin className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" strokeWidth={1.5} />}
                        {note.template === 'todo' && <ListTodo className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" strokeWidth={1.5} />}
                        <h3 className="text-[14px] font-medium text-text-primary truncate">{note.title}</h3>
                      </div>
                      <p className="text-[13px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">{stripHtml(note.content)}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Tag color="note">{templateLabels[note.template as NoteTemplate]}</Tag>
                        {note.tags.map((tag) => (<Tag key={tag} color="default">{tag}</Tag>))}
                        <span className="text-[11px] text-text-tertiary ml-auto font-mono tabular-nums">{formatDate(note.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            />
          ) : (
            <motion.div variants={listVariants} initial="hidden" animate="visible" className="space-y-1">
              {filteredNotes.map((note, idx) => (
                <motion.div
                  key={note.id}
                  variants={noteCardVariants}
                  style={{
                    perspective: '1200px',
                    transform: `rotate(${cardTilt(note.id!)}deg)`,
                  }}
                  className="relative"
                >
                  {/* 卡片间交融渐变过渡 */}
                  {idx > 0 && (
                    <div className="absolute -top-3 left-4 right-4 h-6 bg-gradient-to-b from-transparent via-brand-50/5 to-transparent dark:via-brand-900/5 pointer-events-none rounded-full blur-sm" />
                  )}
                  <div
                    className={cn(
                      'group relative p-4 border border-border/30 bg-bg-elevated/80 backdrop-blur-sm cursor-pointer',
                      'transition-all duration-300',
                      'hover:shadow-[0_8px_32px_-8px_rgba(91,138,114,0.12),0_0_0_1px_rgba(91,138,114,0.06)]',
                      'hover:border-brand-300/40',
                      selectedNoteId === note.id && 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]',
                    )}
                    style={{ borderRadius: asymmetricRadius(note.id!) }}
                    onClick={() => handleSelectNote(note.id!)}
                    onContextMenu={(e) => handleNoteContextMenu(e, note)}
                    onMouseMove={(e) => {
                      const el = e.currentTarget;
                      const { rx, ry } = calc3DTilt(e, el);
                      el.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
                    }}
                  >
                    {/* 左侧色条 — 模板色 + 微发光 */}
                    <div
                      className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: colorForType(note.template),
                        boxShadow: `0 0 10px ${colorForType(note.template)}50`,
                      }}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {note.pinned && <Pin className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" strokeWidth={1.5} />}
                          {note.template === 'todo' && <ListTodo className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" strokeWidth={1.5} />}
                          <h3 className="text-[14px] font-medium text-text-primary truncate">{note.title}</h3>
                        </div>
                        <p className="text-[13px] text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">
                          {stripHtml(note.content)}
                        </p>
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <Tag color="note">{templateLabels[note.template as NoteTemplate]}</Tag>
                          {note.tags.map((tag) => (
                            <Tag key={tag} color="default">{tag}</Tag>
                          ))}
                          <span className="text-[11px] text-text-tertiary ml-auto font-mono tabular-nums">{formatDate(note.updatedAt)}</span>
                        </div>
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          handleNoteContextMenu(
                            { ...e, clientX: rect.right, clientY: rect.bottom, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
                            note,
                          );
                        }}
                        className="p-1 rounded hover:bg-bg-tertiary/50 opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0"
                      >
                        <MoreVertical className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {ctxMenuOpen && ctxMenuNote && (
          <ContextMenu<Note>
            groups={ctxMenuGroups} position={ctxMenuPos}
            context={ctxMenuNote} onSelect={handleCtxMenuSelect} onClose={closeCtxMenu}
          />
        )}
      </main>

      {/* ── 右栏：预览 ── */}
      <aside className="relative z-[5] hidden lg:flex flex-col w-80 flex-shrink-0 border-l border-border/30 bg-bg-primary/40 backdrop-blur-xl overflow-y-auto" style={{ filter: 'saturate(0.9) brightness(0.98)' }}>
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
              onClick={() => navigate(`/notes/${selectedNote.id}`)}
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
      </aside>

      {/* 移动端浮动新建 */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleCreateNote}
        className="md:hidden fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-[0_4px_16px_rgba(91,138,114,0.35)] flex items-center justify-center transition-shadow duration-200"
      >
        <Plus className="w-6 h-6" strokeWidth={2} />
      </motion.button>

      <TemplateSelector open={templateOpen} onClose={() => setTemplateOpen(false)} onSelect={handleTemplateSelect} />

      <Modal
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        title="确认删除"
        description="确定要删除这条笔记吗？此操作不可撤销。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTargetId(null)}>取消</Button>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" strokeWidth={1.5} />} onClick={handleConfirmDelete}>删除</Button>
          </>
        }
      >
        <div />
      </Modal>
    </div>
  );
}
