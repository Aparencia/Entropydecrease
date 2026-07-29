/**
 * 浮出水面（费曼学习）列表页
 *
 * @ai-context: 2026-07 拆分——会话卡片在 FeynmanNoteCard、薄弱点汇总条+
 * 明细弹窗在 WeakPointsSummary；本文件保留列表状态编排、新建弹窗与
 * 右键菜单。"更多"按钮通过合成坐标复用右键 ContextMenu。
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Modal, Input, EmptyState, Skeleton, ContextMenu } from '@/components/ui';
import type { ContextMenuGroup } from '@/components/ui';
import { Plus, BookOpen, Trash2, MessageCircle, Lightbulb, SearchCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFeynmanStore } from '../store/useFeynmanStore';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '@/lib/contextMenu';
import { useToast } from '@/components/ui';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { FeynmanNote } from '@/types/models';
import { FeynmanNoteCard } from '../components/FeynmanNoteCard';
import { WeakPointsSummary } from '../components/WeakPointsSummary';

/* ── 动画 variants ── */
const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
};
const headerVariants = {
  hidden: { opacity: 0, y: -16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as const } },
};
const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
};

export default function FeynmanPage() {
  const navigate = useNavigate();
  const { notes, weakPoints, isLoading, loadNotes, loadWeakPointsForNotes, createNote, deleteNote, getStats, toggleWeakPointMastered } = useFeynmanStore(useShallow(s => s));
  const { toast } = useToast();

  const {
    isOpen: ctxMenuOpen, position: ctxMenuPos, context: ctxMenuNote,
    handleContextMenu: handleNoteCtx, close: closeCtxMenu,
  } = useContextMenu<FeynmanNote>();

  const [modalOpen, setModalOpen] = useState(false);
  const [weakModalOpen, setWeakModalOpen] = useState(false);
  const [newConcept, setNewConcept] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const unmasteredWeakPoints = useMemo(() => {
    const result: { wp: (typeof weakPoints)[number][number]; concept: string; noteId: string }[] = [];
    for (const [noteId, wps] of Object.entries(weakPoints)) {
      const note = notes.find((n) => n.id === noteId);
      const concept = note?.concept ?? '未知概念';
      for (const wp of wps) {
        if (!wp.mastered) result.push({ wp, concept, noteId });
      }
    }
    return result;
  }, [weakPoints, notes]);

  useEffect(() => {
    loadNotes().then(() => {
      const ids = notes.map((n) => n.id!).filter(Boolean);
      if (ids.length > 0) loadWeakPointsForNotes(ids);
    });
  }, [loadNotes, loadWeakPointsForNotes]);

  useEffect(() => {
    const ids = notes.map((n) => n.id!).filter(Boolean);
    if (ids.length > 0) loadWeakPointsForNotes(ids);
  }, [notes.length, loadWeakPointsForNotes]);

  const handleCreate = useCallback(async () => {
    const trimmed = newConcept.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const id = await createNote(trimmed);
      setModalOpen(false); setNewConcept('');
      navigate(`/feynman/${id}`);
    } finally { setCreating(false); }
  }, [newConcept, createNote, navigate]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNote(id);
    soundPlayer.play('feedback_delete');
    setDeleteId(null);
  }, [deleteNote]);

  const handleConfirmDelete = useCallback(async (note: FeynmanNote) => {
    if (note.id) {
      await deleteNote(note.id);
      soundPlayer.play('feedback_delete');
      toast({ type: 'success', message: '学习会话已删除', silent: true });
    }
    setDeleteId(null);
  }, [deleteNote, toast]);

  const ctxMenuGroups = useMemo<ContextMenuGroup[]>(() => [
    { label: '会话操作', items: [
      { key: 'open', label: '打开学习', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
    ]},
    { label: 'AI 操作', items: [
      { key: 'ai-follow-up', label: 'AI 追问', icon: <MessageCircle className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'ai-simplify', label: '通俗化解释', icon: <Lightbulb className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'ai-gap-check', label: '查漏补缺', icon: <SearchCheck className="w-4 h-4" strokeWidth={1.5} /> },
    ]},
    { items: [
      { key: 'delete', label: '删除', icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />, danger: true },
    ]},
  ], []);

  const handleCtxMenuSelect = useCallback((itemKey: string, noteCtx: FeynmanNote) => {
    switch (itemKey) {
      case 'open': navigate(`/feynman/${noteCtx.id}`); break;
      case 'delete': handleConfirmDelete(noteCtx); break;
      case 'ai-follow-up': navigate(`/feynman/${noteCtx.id}`); break;
      case 'ai-simplify':
      case 'ai-gap-check':
        toast({ type: 'info', message: 'AI 功能即将上线' });
        break;
    }
  }, [navigate, handleConfirmDelete, toast]);

  const stats = getStats();

  return (
    <motion.div
      className="flex flex-col h-full relative"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── 顶部 ── */}
      <motion.div
        className="flex items-center justify-between px-kb-md py-kb-md flex-shrink-0 relative z-10"
        variants={headerVariants}
      >
        <div>
          <h1 className="text-h1 font-semibold text-text-primary">浮出水面</h1>
          <p className="text-b2 text-text-tertiary mt-0.5">用讲解检验理解，以简化证明掌握</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03, filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.3))' }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-b2 font-medium
            text-white bg-gradient-to-r from-[#F59E0B] to-[#D97706] shadow-lg shadow-[#F59E0B]/20"
          onClick={() => setModalOpen(true)}
        >
          <Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />
          新学习
        </motion.button>
      </motion.div>

      {/* ── 会话列表 ── */}
      <div className="flex-1 overflow-y-auto px-kb-md pb-kb-lg space-y-3 relative z-10">
        {isLoading && notes.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-kb-md">
                <Skeleton variant="circular" width={40} height={40} />
                <div className="flex-1"><Skeleton variant="text" lines={2} /></div>
              </div>
            ))}
          </motion.div>
        ) : notes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <EmptyState
              icon={<BookOpen className="w-12 h-12" strokeWidth={1.2} />}
              title="炉火已备好"
              description="讲给火听，直到模糊的轮廓，变得清晰透亮"
              action={
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-b2 font-medium
                    text-white bg-gradient-to-r from-[#F59E0B] to-[#D97706] shadow-lg shadow-[#F59E0B]/20"
                  onClick={() => setModalOpen(true)}
                >
                  <Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />
                  开始学习
                </motion.button>
              }
            />
          </motion.div>
        ) : (
          <motion.div variants={listVariants} className="space-y-3">
            <AnimatePresence mode="popLayout">
              {notes.map((n) => (
                <FeynmanNoteCard
                  key={n.id}
                  note={n}
                  weakPoints={weakPoints[n.id!] ?? []}
                  deleteConfirming={deleteId === n.id}
                  onOpen={() => navigate(`/feynman/${n.id}`)}
                  onContextMenu={(e) => handleNoteCtx(e, n)}
                  onMoreClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    handleNoteCtx(
                      { ...e, clientX: rect.right, clientY: rect.bottom, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
                      n,
                    );
                  }}
                  onRequestDelete={() => setDeleteId(n.id!)}
                  onConfirmDelete={(e) => handleDelete(n.id!, e)}
                  onCancelDelete={() => setDeleteId(null)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* ── 底部薄弱点汇总 + 明细弹窗 ── */}
      <WeakPointsSummary
        totalCount={stats.weakPointsCount}
        items={unmasteredWeakPoints}
        modalOpen={weakModalOpen}
        onOpenModal={() => setWeakModalOpen(true)}
        onCloseModal={() => setWeakModalOpen(false)}
        onToggleMastered={(noteId, wpId) => toggleWeakPointMastered(noteId, wpId)}
        onJumpToNote={(noteId) => { setWeakModalOpen(false); navigate(`/feynman/${noteId}`); }}
      />

      {/* ── 新建会话 Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setNewConcept(''); }}
        title="新建浮出水面"
        description="输入你想要深入理解的概念名称"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setModalOpen(false); setNewConcept(''); }}>取消</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newConcept.trim() || creating}>
              {creating ? '创建中...' : '开始学习'}
            </Button>
          </>
        }
      >
        <Input
          label="概念名称"
          placeholder="例如：红黑树的自平衡机制"
          value={newConcept}
          onChange={(e) => setNewConcept(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          autoFocus
        />
      </Modal>

      {/* ── 右键菜单 ── */}
      {ctxMenuOpen && ctxMenuNote && (
        <ContextMenu<FeynmanNote>
          groups={ctxMenuGroups}
          position={ctxMenuPos}
          context={ctxMenuNote}
          onSelect={handleCtxMenuSelect}
          onClose={closeCtxMenu}
        />
      )}
    </motion.div>
  );
}
