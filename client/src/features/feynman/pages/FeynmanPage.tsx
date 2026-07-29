import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Tag, Modal, Input, EmptyState, Skeleton, ContextMenu } from '@/components/ui';
import type { ContextMenuGroup } from '@/components/ui';
import { Plus, BookOpen, AlertTriangle, Trash2, CheckCircle, ArrowRight, MessageCircle, Lightbulb, SearchCheck, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useFeynmanStore } from '../store/useFeynmanStore';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '@/lib/contextMenu';
import { useToast } from '@/components/ui';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { FeynmanNote } from '@/types/models';

const stepLabels: Record<number, string> = { 1: '选择概念', 2: '讲解中', 3: '标注薄弱', 4: '简化重述' };

const statusConfig: Record<string, { label: string; color: 'default' | 'feynman' | 'brand' }> = {
  not_started: { label: '未开始', color: 'default' },
  in_progress: { label: '进行中', color: 'feynman' },
  completed:   { label: '已完成', color: 'brand' },
};

function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

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
const noteCardVariants = {
  hidden: { opacity: 0, x: -20, scale: 0.97 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
  exit: { opacity: 0, x: 20, scale: 0.95, transition: { duration: 0.2 } },
};
const weakBarVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 25, delay: 0.2 } },
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
      {/* 背景环境光 — 由3D场景提供，已移除 */}

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
              {notes.map((n) => {
                const { label, color } = statusConfig[n.status] ?? statusConfig.not_started;
                const noteWps = weakPoints[n.id!] ?? [];
                const weakCount = noteWps.filter((wp) => !wp.mastered).length;
                const isCompleted = n.status === 'completed';
                const isInProgress = n.status === 'in_progress';

                return (
                  <motion.div
                    key={n.id}
                    layout
                    variants={noteCardVariants}
                    whileHover={{ x: 4, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
                    whileTap={{ scale: 0.98, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
                    exit={noteCardVariants.exit}
                  >
                    <div
                      className="group relative flex items-center gap-4 p-kb-md rounded-[var(--kb-radius-md)]
                        bg-bg-secondary/60 backdrop-blur-xl border border-border/30
                        hover:border-[#F59E0B]/30 cursor-pointer overflow-hidden
                        transition-colors duration-300"
                      onClick={() => navigate(`/feynman/${n.id}`)}
                      onContextMenu={(e) => handleNoteCtx(e, n)}
                    >
                      {/* ── hover 光泽 ── */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{
                          background: 'linear-gradient(135deg, rgba(245,158,11,0.04) 0%, transparent 50%, rgba(245,158,11,0.02) 100%)',
                        }}
                      />

                      {/* ── 左侧状态指示条 ── */}
                      <motion.div
                        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full"
                        style={{
                          background: isCompleted
                            ? 'linear-gradient(180deg, #5B8A72, #4A7A62)'
                            : isInProgress
                              ? 'linear-gradient(180deg, #F59E0B, #D97706)'
                              : 'linear-gradient(180deg, #9CA3AF, #6B7280)',
                        }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
                      />

                      {/* ── 图标 ── */}
                      <motion.div
                        className={cn(
                          'w-10 h-10 rounded-kb-lg flex items-center justify-center flex-shrink-0 relative z-10',
                          isCompleted ? 'bg-brand-50 text-brand-600'
                            : isInProgress ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
                            : 'bg-bg-tertiary text-text-tertiary',
                        )}
                        whileHover={{ scale: 1.1, rotate: -5 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <BookOpen className="w-5 h-5" strokeWidth={1.5} />
                        {isInProgress && (
                          <motion.div
                            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#F59E0B]"
                            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        )}
                      </motion.div>

                      {/* ── 内容 ── */}
                      <div className="flex-1 min-w-0 relative z-10">
                        <h3 className="text-b1 font-medium text-text-primary truncate">{n.concept}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Tag color={color}>{label}</Tag>
                          <Tag color="feynman">步骤 {n.currentStep}: {stepLabels[n.currentStep]}</Tag>
                          {weakCount > 0 && (
                            <motion.span
                              className="inline-flex items-center gap-0.5 text-c1 text-[#F59E0B]"
                              animate={{ opacity: [0.7, 1, 0.7] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                              {weakCount}
                            </motion.span>
                          )}
                          <span className="text-c1 text-text-tertiary ml-auto">
                            {formatRelativeDate(n.updatedAt)}
                          </span>
                        </div>
                      </div>

                      {/* ── 操作按钮 ── */}
                      <div className="flex items-center gap-1 relative z-10">
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            handleNoteCtx(
                              { ...e, clientX: rect.right, clientY: rect.bottom, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
                              n,
                            );
                          }}
                          className="p-1.5 rounded-kb-full text-text-tertiary/0 group-hover:text-text-tertiary
                            hover:!text-text-primary hover:bg-bg-tertiary transition-all duration-200"
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          title="更多操作"
                        >
                          <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                        </motion.button>

                        <AnimatePresence mode="popLayout">
                          {deleteId === n.id ? (
                            <motion.div
                              key="confirm"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => handleDelete(n.id!, e)}
                                className="px-2.5 py-1 rounded-kb-md bg-semantic-error/10 text-semantic-error text-c1 font-medium hover:bg-semantic-error/20 transition-all"
                              >
                                确认删除
                              </motion.button>
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => { e.stopPropagation(); setDeleteId(null); }}
                                className="px-2.5 py-1 rounded-kb-md text-c1 text-text-tertiary hover:bg-bg-tertiary transition-all"
                              >
                                取消
                              </motion.button>
                            </motion.div>
                          ) : (
                            <motion.button
                              key="delete"
                              onClick={(e) => { e.stopPropagation(); setDeleteId(n.id!); }}
                              className="p-1.5 rounded-kb-full text-text-tertiary/0 group-hover:text-text-tertiary
                                hover:!text-semantic-error hover:bg-semantic-error/10 transition-all duration-200"
                              whileHover={{ scale: 1.15 }}
                              whileTap={{ scale: 0.9 }}
                              title="删除会话"
                            >
                              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* ── 底部薄弱点汇总 ── */}
      <AnimatePresence>
        {stats.weakPointsCount > 0 && (
          <motion.div
            className="flex-shrink-0 px-kb-md py-3 border-t border-border/30 relative z-10"
            variants={weakBarVariants}
          >
            <motion.button
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setWeakModalOpen(true)}
              className="w-full flex items-center gap-3 px-kb-md py-3 rounded-[var(--kb-radius-md)]
                bg-bg-secondary/70 backdrop-blur-xl border border-border/40
                hover:border-[#F59E0B]/30 transition-colors duration-300 text-left relative overflow-hidden"
            >
              {/* shimmer */}
              <div className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-[1s] ease-in-out pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.05), transparent)' }}
              />
              <div className="w-8 h-8 rounded-kb-md flex items-center justify-center flex-shrink-0
                bg-[#F59E0B]/10 text-[#F59E0B] relative z-10">
                <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div className="flex-1 relative z-10">
                <p className="text-b2 font-medium text-text-primary">查看待补强知识点</p>
                <p className="text-c1 text-text-tertiary">共 {stats.weakPointsCount} 个薄弱点等待复习巩固</p>
              </div>
              <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:translate-x-1 transition-transform relative z-10" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── 待补强知识点 Modal ── */}
      <Modal
        open={weakModalOpen}
        onClose={() => setWeakModalOpen(false)}
        title="待补强知识点"
        description={`共 ${unmasteredWeakPoints.length} 个薄弱点等待复习巩固`}
      >
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {unmasteredWeakPoints.length === 0 ? (
            <p className="text-b2 text-text-tertiary py-4 text-center">暂无待补强知识点</p>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.03 } },
              }}
            >
              {unmasteredWeakPoints.map(({ wp, concept, noteId }) => (
                <motion.div
                  key={wp.id}
                  variants={{
                    hidden: { opacity: 0, y: 8, scale: 0.97 },
                    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25 } },
                  }}
                  className="flex items-start gap-3 p-3 rounded-kb-lg bg-bg-secondary/80 backdrop-blur-sm border border-border/40
                    hover:border-[#F59E0B]/30 transition-colors duration-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-b2 text-text-primary leading-relaxed">{wp.text}</p>
                    <span className="text-c1 text-text-tertiary mt-1 inline-block">来源：{concept}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => toggleWeakPointMastered(noteId, wp.id!)}
                      className="p-1.5 rounded-kb-md text-text-tertiary hover:text-semantic-success hover:bg-semantic-success/10 transition-all"
                      title="标记已掌握"
                    >
                      <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.15, x: 2 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => { setWeakModalOpen(false); navigate(`/feynman/${noteId}`); }}
                      className="p-1.5 rounded-kb-md text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all"
                      title="跳转到对应会话"
                    >
                      <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </Modal>
    </motion.div>
  );
}
