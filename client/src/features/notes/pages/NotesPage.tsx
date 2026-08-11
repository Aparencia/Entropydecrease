/**
 * @ai-context: notes 功能模块页面：NotesPage。
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Tag, EmptyState, Modal } from '@/components/ui';
import { Tip } from '@/components/ui/Tip';
import { useToast } from '@/components/ui';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { VirtualList } from '@/components/ui/VirtualList';
import {
  Search, Plus, FolderPlus, FileText, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, Pin,
  MoreVertical, Trash2, Copy, Download, BookOpen, Sparkles, ListTodo, Share2, Upload, ClipboardCheck,
  Layers, CheckSquare, Square, FoldVertical, Aperture,
} from 'lucide-react';
import { TemplateSelector } from '../components/TemplateSelector';
import type { NoteTemplate } from '../components/TemplateSelector';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { MiniQuizDialog } from '../components/MiniQuizDialog';
import SubjectFolder from '../components/SubjectFolder';
import { NoteSearchBar } from '../components/NoteSearchBar';
import { NoteTagFilter } from '../components/NoteTagFilter';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/utils/clipboard';
import { useNavigate } from 'react-router-dom';
import { useNoteStore } from '../store/useNoteStore';
import { noteStore } from '@/lib/storage';
import { useBatchSelection } from '@/hooks/useBatchSelection';
import { useContextMenu } from '@/lib/contextMenu';
import type { Note, NoteFolder } from '@/types/models';
import { useThemeStore } from '@/stores/useThemeStore';
import { AbyssView2D } from '../components/reef/AbyssView2D';
import { GrottoView3D } from '../components/reef/GrottoView3D';
import { ReefDiverConsole } from '../components/reef/ReefDiverConsole';
import type { ReefMorph, ReefNote } from '../components/reef/reefTypes';
import { useAISummarize, useAIFlashcards } from '@/lib/ai/useAI';
import { useAIPodcast } from '@/lib/ai/hooks/useAIPodcast';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { markdownToNoteContent, noteToMarkdown } from '../lib/markdown/noteMarkdown';
import { collectFolderTreeIds } from '../lib/folderTree';
import { extractNoteText } from '../lib/extractNoteText';
import PodcastPlayer from '@/features/assistant/components/PodcastPlayer';
import OrigamiView, { type FoldType } from '@/components/OrigamiView';
import { Input } from '@/components/ui/Input';

const templateLabels: Record<NoteTemplate | 'qa' | 'video' | 'todo', string> = {
  outline: '大纲式', cornell: '康奈尔', mindmap: '思维导图', free: '自由笔记', blank: '空白', qa: '问答', video: '视频笔记', todo: '待办',
};

function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 列表预览用：截断至 120 字符（使用 extractNoteText 提取纯文本）；有搜索词时返回匹配上下文片段 */
function stripHtml(html: string): string {
  return extractNoteText(html).slice(0, 120);
}

/** 知识半衰期标记：返回剩余天数（负数=已过期）及色值 */
function expiryBadge(expiresAt: Date | undefined): { days: number; label: string; color: string } | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const diff = new Date(expiresAt).getTime() - now;
  const days = Math.round(diff / 86400000);
  if (days <= 0) return { days, label: '已过期', color: 'text-semantic-error' };
  if (days <= 7) return { days, label: `${days} 天后过期`, color: 'text-semantic-warning' };
  if (days <= 30) return { days, label: `${days} 天后过期`, color: 'text-text-tertiary' };
  return null; // 超过 30 天不显示
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

/** 折纸视图五种折叠类型（与 OrigamiView 的 FoldType 枚举对齐） */
const ORIGAMI_FOLD_TYPES: FoldType[] = ['fold', 'triangle', 'pinwheel', 'box', 'flower'];

/** 为每篇笔记确定性分配折叠类型（基于 id hash 轮转五种折法） */
function origamiFoldType(id: string): FoldType {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return ORIGAMI_FOLD_TYPES[Math.abs(h) % ORIGAMI_FOLD_TYPES.length];
}

/** 笔记内容 → 折纸面板细节（纯文本按行拆分，截断防面板溢出） */
function origamiDetails(content: string): string[] {
  return extractNoteText(content)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);
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

  // P1-5 细粒度订阅：整 store 订阅会在任何笔记保存/创建时重建数组并重渲染整页
  const notes = useNoteStore((s) => s.notes);
  const folders = useNoteStore((s) => s.folders);
  const selectedFolderId = useNoteStore((s) => s.selectedFolderId);
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  const searchQuery = useNoteStore((s) => s.searchQuery);
  const selectedTags = useNoteStore((s) => s.selectedTags);
  const selectedTemplate = useNoteStore((s) => s.selectedTemplate);
  // 动作（稳定引用）
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const loadFolders = useNoteStore((s) => s.loadFolders);
  const createNote = useNoteStore((s) => s.createNote);
  const createFolder = useNoteStore((s) => s.createFolder);
  const updateFolder = useNoteStore((s) => s.updateFolder);
  const selectNote = useNoteStore((s) => s.selectNote);
  const selectFolder = useNoteStore((s) => s.selectFolder);
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery);
  const getFilteredNotes = useNoteStore((s) => s.getFilteredNotes);
  const createFromTemplate = useNoteStore((s) => s.createFromTemplate);
  const toggleTag = useNoteStore((s) => s.toggleTag);
  const toggleTemplate = useNoteStore((s) => s.toggleTemplate);
  const clearTagFilter = useNoteStore((s) => s.clearTagFilter);
  const getAllTags = useNoteStore((s) => s.getAllTags);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const deleteNotesBatch = useNoteStore((s) => s.deleteNotesBatch);
  const deleteFolder = useNoteStore((s) => s.deleteFolder);
  const deleteFolderWithNotes = useNoteStore((s) => s.deleteFolderWithNotes);
  const togglePin = useNoteStore((s) => s.togglePin);
  const setExpiry = useNoteStore((s) => s.setExpiry);

  const { toast } = useToast();
  const { summarize } = useAISummarize();
  const { generateStream: aiGenerateCardsStream } = useAIFlashcards();
  // P1 AI 播客：笔记转双人播客（useAIPodcast 自带网关直连与本地降级）
  const { podcast: podcastData, loading: podcastLoading, error: podcastError, generatePodcast } = useAIPodcast();
  const [podcastTopic, setPodcastTopic] = useState('');
  const [showPodcast, setShowPodcast] = useState(false);
  const handleSummarizeError = useAIErrorHandler('AI 摘要生成失败');
  const handleFlashcardError = useAIErrorHandler('AI 闪卡生成失败');

  const {
    isOpen: ctxMenuOpen, position: ctxMenuPos, context: ctxMenuNote,
    handleContextMenu: handleNoteContextMenu, close: closeCtxMenu,
  } = useContextMenu<Note>();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<NoteFolder | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadNotes(); loadFolders(); }, []);

  // 缓存过滤/标签/选中结果，避免每次渲染都全量 filter/sort 所有笔记（P1-7 性能修复）
  const filteredNotes = useMemo(
    () => getFilteredNotes(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖 getFilteredNotes 读取的 store 字段
    [getFilteredNotes, notes, searchQuery, selectedTags, selectedTemplate, selectedFolderId, folders],
  );
  const allTags = useMemo(() => getAllTags(), [getAllTags, notes]);
  const selectedNote = useMemo(
    () => filteredNotes.find((n) => n.id === selectedNoteId) || null,
    [filteredNotes, selectedNoteId],
  );

  // 3D 视图节点投影（无 content 全文，与 P1-1 惰性加载兼容）
  const reefNotes = useMemo<ReefNote[]>(() => filteredNotes.map((n) => ({
    id: n.id!,
    title: n.title,
    template: n.template,
    wordCount: n.wordCount ?? 0,
    updatedAt: n.updatedAt,
    folderId: n.folderId,
    tags: n.tags,
    pinned: n.pinned,
  })), [filteredNotes]);

  // 搜索高亮：声呐点亮（标题/标签匹配；空搜索=全亮）
  const highlightIds = useMemo<ReadonlySet<string> | null>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const n of filteredNotes) {
      if (
        n.title.toLowerCase().includes(q)
        || n.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        set.add(n.id!);
      }
    }
    return set;
  }, [filteredNotes, searchQuery]);

  // 批量管理模式（对齐萤火海沟批量整理交互）
  const batch = useBatchSelection<Note>({ items: filteredNotes });

  // 响应式笔记总数（侧边栏"全部笔记"计数）
  const totalNotes = useNoteStore((s) => s.notes.length);

  // 批量删除确认
  const handleConfirmBatchDelete = useCallback(async () => {
    const ids = Array.from(batch.selectedIds);
    if (ids.length === 0) return;
    try {
      await deleteNotesBatch(ids);
      soundPlayer.play('feedback_delete');
      toast({ type: 'success', message: `已删除 ${ids.length} 篇笔记`, silent: true });
    } catch (err) {
      toast({ type: 'error', message: `删除失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setBatchDeleteOpen(false);
      batch.exit();
    }
  }, [batch, deleteNotesBatch, toast]);

  const handleTemplateSelect = async (tpl: NoteTemplate) => {
    const id = await createFromTemplate(tpl, selectedFolderId ?? undefined);
    selectNote(id); navigate(`/notes/${id}`);
  };
  const handleCreateNote = async () => {
    const id = await createNote({ title: '新笔记', template: 'blank', folderId: selectedFolderId ?? undefined });
    selectNote(id); navigate(`/notes/${id}`);
  };

  // 阶段四：导入 .md 文件为新笔记
  const mdInputRef = useRef<HTMLInputElement>(null);
  const handleImportMarkdown = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const md = await file.text();
      const content = markdownToNoteContent(md);
      const title = file.name.replace(/\.md$/i, '') || '导入笔记';
      const id = await createNote({ title, content, template: 'blank', folderId: selectedFolderId ?? undefined });
      toast({ type: 'success', message: 'Markdown 已导入' });
      selectNote(id); navigate(`/notes/${id}`);
    } catch {
      toast({ type: 'error', message: 'Markdown 导入失败' });
    }
  }, [createNote, selectedFolderId, toast, selectNote, navigate]);
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

  // 分组删除：确认后执行（默认笔记移回根目录；可勾选同时删除组内全部笔记）
  const [deleteFolderWithNotesChecked, setDeleteFolderWithNotesChecked] = useState(false);
  // 递归统计分组树（含子孙分组）下的笔记数，供弹窗文案与复选框展示
  // （必须在 handleConfirmDeleteFolder 之前声明——后者依赖它，TDZ 防护）
  const folderTreeNoteCount = useMemo(() => {
    if (!deleteFolderTarget) return 0;
    const treeIds = collectFolderTreeIds(folders, deleteFolderTarget.id);
    return notes.filter((n) => n.folderId && treeIds.includes(n.folderId)).length;
  }, [deleteFolderTarget, folders, notes]);
  const handleConfirmDeleteFolder = useCallback(async () => {
    if (!deleteFolderTarget) return;
    try {
      if (deleteFolderWithNotesChecked) {
        await deleteFolderWithNotes(deleteFolderTarget.id);
        soundPlayer.play('feedback_delete');
        toast({ type: 'success', message: `分组「${deleteFolderTarget.name}」及其 ${folderTreeNoteCount} 篇笔记已删除`, silent: true });
      } else {
        await deleteFolder(deleteFolderTarget.id);
        soundPlayer.play('feedback_delete');
        toast({ type: 'success', message: `分组「${deleteFolderTarget.name}」已删除，组内笔记已移至全部笔记`, silent: true });
      }
    } catch (err) {
      toast({ type: 'error', message: `删除失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setDeleteFolderTarget(null);
      setDeleteFolderWithNotesChecked(false);
    }
  }, [deleteFolderTarget, deleteFolder, deleteFolderWithNotes, deleteFolderWithNotesChecked, folderTreeNoteCount, toast]);
  // P1-1：投影无 content 全文，复制前惰性取回（复制为显式操作，成本可接受）
  const handleDuplicateNote = useCallback(async (note: Note) => {
    const full = (await noteStore.getById(note.id))?.content ?? '';
    await createNote({ title: note.title + ' (副本)', content: full, folderId: note.folderId, tags: note.tags, template: note.template });
    toast({ type: 'success', message: '笔记已复制' });
  }, [createNote, toast]);
  // P1-1：投影无 content 全文，导出前惰性取回
  const handleExportNote = useCallback(async (note: Note) => {
    // 使用 noteToMarkdown 将 TipTap JSON 转为 Markdown（保留标题层级、列表、代码块等格式）
    const full = (await noteStore.getById(note.id))?.content ?? '';
    const md = noteToMarkdown(full);
    const text = `# ${note.title}\n\n${md}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${note.title || 'note'}-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
    toast({ type: 'success', message: '笔记已导出为 Markdown' });
  }, [toast]);

  // ---- 剪藏（网页/PDF 导入笔记） ----
  const [clipUrl, setClipUrl] = useState('');
  const [clipOpen, setClipOpen] = useState(false);
  const [clipLoading, setClipLoading] = useState(false);
  const clipInputRef = useRef<HTMLInputElement>(null);

  const handleClipUrl = useCallback(async () => {
    if (!clipUrl.trim() || !window.electronAPI?.invoke) return;
    setClipLoading(true);
    try {
      const result = await window.electronAPI.invoke('import:fetch-url', { url: clipUrl.trim() }) as { success: boolean; content?: { title: string; text: string }; error?: string };
      if (result.success && result.content) {
        const { title, text } = result.content;
        await createNote({ title: title.slice(0, 100), content: text, template: 'blank', folderId: selectedFolderId ?? undefined });
        toast({ type: 'success', message: `网页已剪藏为笔记：${title.slice(0, 30)}`, silent: true });
        setClipUrl('');
      } else {
        toast({ type: 'warning', message: result.error || '剪藏失败，请手动粘贴内容' });
      }
    } catch {
      toast({ type: 'error', message: '剪藏失败，请检查网络或手动粘贴' });
    } finally {
      setClipLoading(false);
    }
  }, [clipUrl, createNote, selectedFolderId, toast]);

  const handleClipPdf = useCallback(async () => {
    if (!window.electronAPI?.invoke) return;
    setClipLoading(true);
    try {
      const result = await window.electronAPI.invoke('import:parse-pdf') as { success: boolean; content?: { title: string; text: string }; canceled?: boolean; error?: string };
      if (result.canceled) { setClipLoading(false); return; }
      if (result.success && result.content) {
        const { title, text } = result.content;
        await createNote({ title: title.slice(0, 100), content: text, template: 'blank', folderId: selectedFolderId ?? undefined });
        toast({ type: 'success', message: `PDF 已导入为笔记：${title.slice(0, 30)}`, silent: true });
      } else {
        toast({ type: 'warning', message: result.error || 'PDF 导入失败' });
      }
    } catch {
      toast({ type: 'error', message: 'PDF 导入失败' });
    } finally {
      setClipLoading(false);
    }
  }, [createNote, selectedFolderId, toast]);

  const ctxMenuGroups = useMemo<ContextMenuGroup[]>(() => [
    { label: '笔记操作', items: [
      { key: 'open', label: '打开编辑', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'pin', label: '置顶/取消置顶', icon: <Pin className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'duplicate', label: '复制', icon: <Copy className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'export', label: '导出', icon: <Download className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'expiry', label: '设置保质期', icon: <span className="w-4 h-4 flex items-center justify-center text-xs">⏳</span> },
    ]},
    { label: 'AI 操作', items: [
      { key: 'ai-summary', label: '生成摘要', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'ai-flashcard', label: '生成闪卡', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
      // P1 AI 播客：笔记转双人播客脚本 + TTS 播放
      { key: 'ai-podcast', label: '🎧 生成播客', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
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
            case 'expiry': {
              const days = prompt('设置知识保质期（天）：\n输入天数，例如 30 表示 30 天后过期；留空或输入 0 可清除已设保质期。', '30');
              if (days === null) break;
              const n = parseInt(days, 10);
              if (isNaN(n) || n < 0) { toast({ type: 'warning', message: '请输入有效天数' }); break; }
              const expiresAt = n > 0 ? new Date(Date.now() + n * 86400000) : null;
              await setExpiry(noteCtx.id!, expiresAt);
              toast({ type: 'success', message: expiresAt ? `保质期已设为 ${n} 天` : '已清除保质期', silent: true });
              break;
            }
      case 'ai-summary': {
        // P1-1：预览仅 300 字符，AI 摘要需全文（显式操作，惰性取回）
        const full = (await noteStore.getById(noteCtx.id!))?.content ?? '';
        const text = extractNoteText(full);
        if (text.length < 10) { toast({ type: 'warning', message: '笔记内容太少，无法生成摘要' }); break; }
        toast({ type: 'info', message: 'AI 正在生成摘要...' });
        try {
          const result = await summarize(text, { maxLength: 200, style: 'bullet', language: 'zh' });
          if (result?.summary) { await copyText(result.summary); toast({ type: 'success', message: 'AI 摘要已生成并复制到剪贴板', silent: true }); }
          else { toast({ type: 'warning', message: 'AI 未能生成摘要，请检查内容或稍后重试', silent: true }); }
        } catch (error) { handleSummarizeError(error); }
        break;
      }
      case 'ai-flashcard': {
        // P1-1：预览仅 300 字符，AI 闪卡需全文（显式操作，惰性取回）
        const full = (await noteStore.getById(noteCtx.id!))?.content ?? '';
        const text = extractNoteText(full);
        if (text.length < 20) { toast({ type: 'warning', message: '笔记内容太少，无法生成闪卡' }); break; }
        toast({ type: 'info', message: 'AI 闪卡生成中...' });
        try {
          // A 组流式接入：走 /generate-cards/stream SSE（打字机累积），失败自动降级非流式
          const result = await aiGenerateCardsStream(text, { count: 10, difficulty: 'medium' });
          if (result?.cards?.length) { toast({ type: 'success', message: `AI 已生成 ${result.cards.length} 张闪卡，请在笔记编辑页中使用右键菜单逐张添加`, silent: true }); }
          else { toast({ type: 'warning', message: 'AI 未能生成闪卡，请检查内容或稍后重试', silent: true }); }
        } catch (error) { handleFlashcardError(error); }
        break;
      }
      case 'ai-podcast': {
        // P1 AI 播客：以笔记标题为主题生成播客（useAIPodcast 自带网关直连 + 本地降级）
        const topic = noteCtx.title || '知识小酌';
        setPodcastTopic(topic);
        setShowPodcast(true);
        void generatePodcast(topic, 'basic');
        break;
      }
    }
  }, [handleSelectNote, handleTogglePin, handleDuplicateNote, handleExportNote, handleDeleteNote, toast, summarize, aiGenerateCardsStream, generatePodcast, handleSummarizeError, handleFlashcardError]);

  return (
    /* 高度由 AppLayout 路由过渡容器（grid）显式锚定继承，与面板内容区精确一致：
     * 面板为 height:auto + max-h 容器，h-full 链曾退化为内容自然高（页面随笔记数量伸缩），
     * Notes 面板 !p-0 去内边距后，锚定公式收敛到布局层 grid（h-[calc(85vh-2px)] 等两档），页面层回归 h-full。
     * overflow-hidden：左右栏三态互斥后最多两栏（中栏 + 单侧栏），总宽可控，无横向滚动条 */
    <div className="flex h-full overflow-hidden">
      {/* ── 沉浸 3D 视图（双主题双形态：深色=沉降深渊 / 浅色=穹顶石窟） ── */}
      {view3D ? (
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
                  selectedId={selectedNoteId}
                  hoveredId={hoveredId3D}
                  highlightIds={highlightIds}
                  focusFolderId={selectedFolderId}
                  onHover={setHoveredId3D}
                  onSelect={(id) => selectNote(id)}
                  onOpen={(id) => navigate(`/notes/${id}`)}
                  onExit={() => setView3D(false)}
                />
              ) : (
                <GrottoView3D
                  notes={reefNotes}
                  selectedId={selectedNoteId}
                  hoveredId={hoveredId3D}
                  highlightIds={highlightIds}
                  focusFolderId={selectedFolderId}
                  onHover={setHoveredId3D}
                  onSelect={(id) => selectNote(id)}
                  onOpen={(id) => navigate(`/notes/${id}`)}
                  onExit={() => setView3D(false)}
                />
              )}
            </motion.div>
          </AnimatePresence>

          <ReefDiverConsole
            morph={morph}
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={selectFolder}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onNewNote={() => setTemplateOpen(true)}
            onClip={() => setClipOpen(true)}
            onGraph={() => navigate('/notes/graph')}
            onBatch={() => { setView3D(false); batch.setBatchMode(true); }}
            onOrigami={() => { setView3D(false); setOrigamiMode(true); }}
            onExit={() => setView3D(false)}
          />
        </div>
      ) : (
      <>
      {/* ── 左栏：文件夹（三态互斥：sideMode==='left' 显示，预览栏隐藏） ── */}
      {/* mode="wait" 确保旧侧栏完全收起后再展开新内容，避免动画残帧 */}
      <AnimatePresence mode="wait">
        {sideMode === 'left' && (
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
                onClick={() => setShowNewFolder((v) => !v)}
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
                <span className="text-[11px] text-text-tertiary font-mono">{totalNotes}</span>
              </motion.button>
              {folders.map((f) => (
                <SubjectFolder
                  key={f.id}
                  folder={f}
                  isSelected={selectedFolderId === f.id}
                  onSelect={selectFolder}
                  onRename={handleRenameFolder}
                  onDelete={(id) => {
                    const target = folders.find((x) => x.id === id);
                    if (target) {
                      setDeleteFolderTarget(target);
                      setDeleteFolderWithNotesChecked(false);
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
                    onClick={clearTagFilter}
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
                      onClick={() => toggleTag(tag)}
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

      {/* ── 中栏：笔记列表 ── */}
      <main className="relative z-10 flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="sticky top-0 z-20 flex flex-col gap-2 px-4 py-3 border-b border-border/30 flex-shrink-0 backdrop-blur-md bg-bg-primary/80">
          <div className="flex items-center gap-2">
            {/* 左侧边栏控制按钮（文件组）：展开时自动收起右侧预览栏（互斥） */}
            <Tip text={sideMode === 'left' ? '收起文件夹栏' : '展开文件夹栏'}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleLeftSidebar}
              className={cn(
                'hidden md:flex p-1.5 rounded-full transition-all duration-200',
                sideMode === 'left'
                  ? 'text-brand-600 bg-brand-50/60'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/40',
              )}
            >
              {sideMode === 'left' ? <PanelLeftClose className="w-5 h-5" strokeWidth={1.5} /> : <PanelLeft className="w-5 h-5" strokeWidth={1.5} />}
            </motion.button>
            </Tip>
            {/* 结礁仪式标识（compact）：三栏布局下的模块归属 */}
            <ModuleRitualHeader
              title="结礁"
              sealChar="礁"
              sealColor="#6B9BD2"
              compact
              className="mr-1"
            />
            <NoteSearchBar />
            {/* 右侧边栏控制按钮（预览区）：展开时自动收起左侧文件组（互斥） */}
            <Tip text={sideMode === 'right' ? '收起预览栏' : '展开预览栏'}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleRightSidebar}
              className={cn(
                'hidden lg:flex p-1.5 rounded-full transition-all duration-200',
                sideMode === 'right'
                  ? 'text-brand-600 bg-brand-50/60'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/40',
              )}
            >
              {sideMode === 'right' ? <PanelRightClose className="w-5 h-5" strokeWidth={1.5} /> : <PanelRight className="w-5 h-5" strokeWidth={1.5} />}
            </motion.button>
            </Tip>
            {/* 笔记图谱按钮，升级原生 title 为 Tip 组件 */}
            <Tip text="笔记图谱">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/notes/graph')}
              className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200"
            >
              <Share2 className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            </Tip>
            {/* 导入 Markdown 按钮，升级原生 title 为 Tip 组件 */}
            <Tip text="导入 Markdown">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => mdInputRef.current?.click()}
              className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200"
            >
              <Upload className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            </Tip>
            {/* 剪藏按钮：导入网页或 PDF 为笔记 */}
            <Tip text={clipLoading ? '剪藏中…' : '剪藏'}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setClipOpen(true)}
              disabled={clipLoading}
              className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200 disabled:opacity-40 relative"
            >
              <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{clipLoading ? '…' : '+'}</span>
            </motion.button>
            </Tip>
            {/* 迷你测试按钮（N1）：选定多篇笔记生成课程级小测试 */}
            <Tip text="迷你测试">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setQuizOpen(true)}
              className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200"
            >
              <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            </Tip>
            {/* 批量管理按钮（多选删除，对齐萤火海沟批量模式） */}
            <Tip text={batch.batchMode ? '退出批量管理' : '批量管理'}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => batch.setBatchMode(v => !v)}
              className={cn(
                'p-2 rounded-full transition-all duration-200',
                batch.batchMode
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50',
              )}
            >
              <Layers className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            </Tip>
            {/* 折纸视图开关：开启后笔记以 OrigamiView 网格展示（默认关闭，列表视图不受影响） */}
            <Tip text={origamiMode ? '退出折纸视图' : '折纸视图'}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setOrigamiMode(v => !v)}
              aria-pressed={origamiMode}
              className={cn(
                'p-2 rounded-full transition-all duration-200',
                origamiMode
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50',
              )}
            >
              <FoldVertical className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            </Tip>
            {/* 沉浸 3D 视图开关：深色=沉降深渊 / 浅色=穹顶石窟（双形态随主题） */}
            <Tip text={view3D ? '退出沉浸视图' : '沉浸视图（3D）'}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setView3D((v) => !v)}
              aria-pressed={view3D}
              className={cn(
                'p-2 rounded-full transition-all duration-200',
                view3D
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50',
              )}
            >
              <Aperture className="w-4 h-4" strokeWidth={1.5} />
            </motion.button>
            </Tip>
            <input
              ref={mdInputRef}
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={handleImportMarkdown}
            />
            <input
              ref={clipInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleClipPdf}
            />
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button size="sm" icon={<Plus className="w-4 h-4" strokeWidth={2} />} onClick={() => setTemplateOpen(true)}>
                新建笔记
              </Button>
            </motion.div>
          </div>
          {/* 批量操作条（批量模式下显示，对齐萤火海沟交互） */}
          <AnimatePresence>
            {batch.batchMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 flex-wrap"
              >
                <motion.button whileTap={{ scale: 0.95 }} onClick={batch.selectAll}
                  className="px-2.5 py-1 rounded-full text-xs font-medium text-text-secondary bg-bg-secondary border border-border/40 hover:text-text-primary transition-colors">
                  全选
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={batch.clear}
                  className="px-2.5 py-1 rounded-full text-xs font-medium text-text-tertiary bg-bg-secondary border border-border/40 hover:text-text-secondary transition-colors">
                  取消全选
                </motion.button>
                <span className="text-c1 text-text-tertiary">已选中 {batch.count} 篇</span>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setBatchDeleteOpen(true)}
                  disabled={batch.count === 0}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium',
                    'bg-semantic-error/10 text-semantic-error border border-semantic-error/30',
                    'hover:bg-semantic-error/20 transition-colors',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  删除选中
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
          <NoteTagFilter />
        </div>

        {/* 列表 */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 py-3">
          <div className="flex-1 overflow-y-auto min-h-0">
          {origamiMode && filteredNotes.length > 0 ? (
            /* ── 折纸视图：OrigamiView 网格（折叠类型由笔记 id hash 确定性分配） ── */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-2 items-start">
              {filteredNotes.map((note) => {
                const text = extractNoteText(note.content);
                return (
                  <div
                    key={note.id}
                    className="cursor-pointer"
                    onClick={() => batch.batchMode ? batch.toggle(note.id!) : handleSelectNote(note.id!)}
                    onContextMenu={batch.batchMode ? undefined : (e) => handleNoteContextMenu(e, note)}
                  >
                    <OrigamiView
                      title={note.title || '无标题'}
                      summary={text.slice(0, 100)}
                      details={origamiDetails(note.content)}
                      foldType={origamiFoldType(note.id!)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
          <>
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-6 select-none">
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
              estimateSize={140}
              overscan={6}
              className="overflow-y-auto"
              height="100%"
              getKey={(note) => note.id!}
              renderItem={(note) => (
                <Card
                  hoverable
                  padding="md"
                  onClick={() => batch.batchMode ? batch.toggle(note.id!) : handleSelectNote(note.id!)}
                  onContextMenu={batch.batchMode ? undefined : (e) => handleNoteContextMenu(e, note)}
                  className={cn(
                    'group relative transition-all duration-300 mb-2 h-[140px] overflow-hidden',
                    !batch.batchMode && 'hover:-translate-y-[2px] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)]',
                    batch.batchMode
                      ? batch.selectedIds.has(note.id!)
                        ? 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]'
                        : 'hover:border-brand-300/40'
                      : selectedNoteId === note.id && 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]',
                  )}
                >
                  {/* 批量模式勾选指示 */}
                  {batch.batchMode && (
                    <span className="absolute top-2 right-2 z-10">
                      {batch.selectedIds.has(note.id!)
                        ? <CheckSquare className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
                        : <Square className="w-5 h-5 text-text-tertiary/50" strokeWidth={1.5} />}
                    </span>
                  )}
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
                        {note.mood && <span className="text-sm flex-shrink-0">{note.mood}</span>}
                        <h3 className="text-[14px] font-medium text-text-primary truncate">{note.title}</h3>
                      </div>
                      <p className="text-[13px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">{stripHtml(note.content)}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Tag color="note" onClick={(e) => { e.stopPropagation(); toggleTemplate(note.template); }} active={selectedTemplate === note.template}>{templateLabels[note.template as NoteTemplate]}</Tag>
                        {note.tags.map((tag) => (<Tag key={tag} color="default" onClick={(e) => { e.stopPropagation(); toggleTag(tag); }} active={selectedTags.includes(tag)}>{tag}</Tag>))}
                        <span className="text-[11px] text-text-tertiary ml-auto font-mono tabular-nums">{formatDate(note.updatedAt)}</span>
                                                {(() => { const eb = expiryBadge(note.expiresAt); return eb ? <span className={`text-[10px] font-mono ${eb.color}`}>{eb.label}</span> : null; })()}
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
                      'h-[140px] overflow-hidden',
                      'transition-all duration-300',
                      !batch.batchMode && 'hover:shadow-[0_8px_32px_-8px_rgba(91,138,114,0.12),0_0_0_1px_rgba(91,138,114,0.06)] hover:border-brand-300/40',
                      batch.batchMode
                        ? batch.selectedIds.has(note.id!)
                          ? 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]'
                          : 'hover:border-brand-300/40'
                        : selectedNoteId === note.id && 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]',
                    )}
                    onClick={() => batch.batchMode ? batch.toggle(note.id!) : handleSelectNote(note.id!)}
                    onContextMenu={batch.batchMode ? undefined : (e) => handleNoteContextMenu(e, note)}
                    onMouseMove={batch.batchMode ? undefined : (e) => {
                      const el = e.currentTarget;
                      const rect = el.getBoundingClientRect();
                      const x = (e.clientX - rect.left) / rect.width - 0.5;
                      const y = (e.clientY - rect.top) / rect.height - 0.5;
                      el.style.setProperty('--tilt-rx', `${-y * 5}deg`);
                      el.style.setProperty('--tilt-ry', `${x * 5}deg`);
                    }}
                    onMouseLeave={batch.batchMode ? undefined : (e) => {
                      e.currentTarget.style.setProperty('--tilt-rx', '0deg');
                      e.currentTarget.style.setProperty('--tilt-ry', '0deg');
                    }}
                    style={{
                      borderRadius: asymmetricRadius(note.id!),
                      transform: 'perspective(1200px) rotateX(var(--tilt-rx, 0deg)) rotateY(var(--tilt-ry, 0deg)) translateZ(4px)',
                    }}
                  >
                    {/* 批量模式勾选指示 */}
                    {batch.batchMode && (
                      <span className="absolute top-2 right-2 z-10">
                        {batch.selectedIds.has(note.id!)
                          ? <CheckSquare className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
                          : <Square className="w-5 h-5 text-text-tertiary/50" strokeWidth={1.5} />}
                      </span>
                    )}
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
                          <Tag color="note" onClick={(e) => { e.stopPropagation(); toggleTemplate(note.template); }} active={selectedTemplate === note.template}>{templateLabels[note.template as NoteTemplate]}</Tag>
                          {note.tags.map((tag) => (
                            <Tag key={tag} color="default" onClick={(e) => { e.stopPropagation(); toggleTag(tag); }} active={selectedTags.includes(tag)}>{tag}</Tag>
                          ))}
                          <span className="text-[11px] text-text-tertiary ml-auto font-mono tabular-nums">{formatDate(note.updatedAt)}</span>
                                                  {(() => { const eb = expiryBadge(note.expiresAt); return eb ? <span className={`text-[10px] font-mono ${eb.color}`}>{eb.label}</span> : null; })()}
                        </div>
                      </div>
                      {/* 笔记操作菜单触发按钮，带 tooltip（批量模式下隐藏） */}
                      {!batch.batchMode && (
                      <Tip text="笔记操作">
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
                      </Tip>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
          </>
          )}
          </div>
        </div>

        {ctxMenuOpen && ctxMenuNote && (
          <ContextMenu<Note>
            groups={ctxMenuGroups} position={ctxMenuPos}
            context={ctxMenuNote} onSelect={handleCtxMenuSelect} onClose={closeCtxMenu}
          />
        )}

        {/* P1 AI 播客弹层：笔记转双人播客（脚本 + TTS 分段播放） */}
        <Modal
          open={showPodcast}
          onClose={() => setShowPodcast(false)}
          title="🎧 AI 播客"
          description={`围绕「${podcastTopic}」的双人知识播客`}
          size="lg"
        >
          {podcastLoading && !podcastData && (
            <div className="py-8 text-center text-c1 text-text-tertiary animate-pulse">
              正在编排播客脚本…
            </div>
          )}
          {podcastError && !podcastLoading && !podcastData && (
            <p className="py-6 text-center text-c1 text-text-tertiary">{podcastError}</p>
          )}
          {podcastData && <PodcastPlayer podcast={podcastData} onClose={() => setShowPodcast(false)} />}
        </Modal>
      </main>

      {/* ── 右栏：预览（三态互斥：sideMode==='right' 显示，文件夹栏隐藏） ── */}
      <AnimatePresence mode="wait">
        {sideMode === 'right' && (
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
          </motion.aside>
        )}
      </AnimatePresence>

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
            <Modal
              open={clipOpen}
              onClose={() => setClipOpen(false)}
              title="剪藏"
              description="将网页内容或 PDF 文件导入为笔记"
              size="sm"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-c1 text-text-tertiary">网页 URL</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入网页链接…"
                      value={clipUrl}
                      onChange={(e) => setClipUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleClipUrl(); }}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleClipUrl} disabled={clipLoading || !clipUrl.trim()}>
                      {clipLoading ? '剪藏中…' : '剪藏'}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex-1 h-px bg-border/30" />
                  <span className="text-c1 text-text-tertiary">或</span>
                  <span className="flex-1 h-px bg-border/30" />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { handleClipPdf(); setClipOpen(false); }}
                  disabled={clipLoading}
                  className="w-full"
                >
                  选择 PDF 文件导入
                </Button>
              </div>
            </Modal>

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

      {/* 删除分组确认：组内笔记移回根目录，可选同时删除组内全部笔记 */}
      <Modal
        open={!!deleteFolderTarget}
        onClose={() => { setDeleteFolderTarget(null); setDeleteFolderWithNotesChecked(false); }}
        title="删除分组"
        description={deleteFolderTarget
          ? `确定要删除分组「${deleteFolderTarget.name}」吗？${folderTreeNoteCount > 0 ? `组内 ${folderTreeNoteCount} 篇笔记将移至「全部笔记」，` : ''}笔记内容不会被删除。`
          : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDeleteFolderTarget(null); setDeleteFolderWithNotesChecked(false); }}>取消</Button>
            <Button
              variant="danger"
              icon={<Trash2 className="w-4 h-4" strokeWidth={1.5} />}
              onClick={handleConfirmDeleteFolder}
            >
              {deleteFolderWithNotesChecked ? `删除分组与 ${folderTreeNoteCount} 篇笔记` : '删除分组'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {/* 附加选项：同时删除组内全部笔记（含子孙分组，不可撤销） */}
          {folderTreeNoteCount > 0 && (
            <label className="flex items-start gap-2 p-2.5 rounded-kb-md border border-semantic-error/25 bg-semantic-error/5 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteFolderWithNotesChecked}
                onChange={(e) => setDeleteFolderWithNotesChecked(e.target.checked)}
                className="mt-0.5 accent-[var(--kb-brand-500)]"
              />
              <span className="text-b3 text-text-secondary">
                同时删除组内全部笔记（含子分组，共 <b className="text-semantic-error">{folderTreeNoteCount}</b> 篇）
                <span className="block text-c1 text-semantic-error mt-0.5">笔记内容将永久丢失，此操作不可撤销</span>
              </span>
            </label>
          )}
        </div>
      </Modal>

      {/* 批量删除确认：真删除不可撤销 */}
      <Modal
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        title="批量删除笔记"
        description={`确定要删除选中的 ${batch.count} 篇笔记吗？此操作不可撤销。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBatchDeleteOpen(false)}>取消</Button>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" strokeWidth={1.5} />} onClick={handleConfirmBatchDelete}>删除 {batch.count} 篇</Button>
          </>
        }
      >
        <div />
      </Modal>
    </div>
  );
}
