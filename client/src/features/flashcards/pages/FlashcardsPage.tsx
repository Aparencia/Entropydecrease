/**
 * @ai-context: flashcards 功能模块页面：FlashcardsPage。
 */
import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Tag, Modal, Input, EmptyState, Skeleton, useToast } from '@/components/ui';
import { ContextMenu, type ContextMenuGroup } from '@/components/ui/ContextMenu';
import { Plus, Layers, Clock, Trash2, Layers3, Upload, BookOpen, Pencil, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { useShallow } from 'zustand/react/shallow';
import { flashcardStore } from '@/lib/storage';
import { importDeck, importDeckNew, importDeckOverwrite, importDeckSkip, importDeckMerge, exportDeck, downloadDeckFile } from '@/lib/storage/exportImport';
import ImportPreviewModal from '../components/ImportPreviewModal';
import type { KbanDeckFile } from '@/types/models';
import { useContextMenu } from '@/lib/contextMenu/useContextMenu';
import type { Flashcard, FlashcardDeck } from '@/types/models';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

const LONG_PRESS_THRESHOLD_MS = 600;

/**
 * 牌组描述行（v0.30）
 *
 * 无描述时始终预留一行高度，保证卡片尺寸一致；
 * 描述超过一行时截断并展示“⋯”符号按钮，点击展开完整内容。
 */
function DeckCardDescription({ description }: { description?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // 收起状态下测量是否溢出一行（垂直换行或水平不可断行溢出均算）
  useLayoutEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (el) {
      setOverflows(
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      );
    }
  }, [description, expanded]);

  if (!description) {
    // 无描述：占位一行高度（12px × 1.5 行高），确保卡片尺寸一致
    return <div className="mt-0.5 min-h-[1.125rem]" aria-hidden="true" />;
  }

  return (
    <div className="flex items-start gap-1 mt-0.5">
      <p
        ref={textRef}
        className={cn(
          // break-words：无空格长串（如 URL/连续字符）也能正常断行，
          // 收起时配合 line-clamp-1 转为垂直溢出以便检测，展开时不撑出卡片
          'text-b3 text-text-tertiary flex-1 min-w-0 min-h-[1.125rem] break-words',
          !expanded && 'line-clamp-1',
        )}
      >
        {description}
      </p>
      {overflows && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="flex-shrink-0 text-b3 leading-[1.125rem] text-text-tertiary hover:text-text-primary transition-colors"
          title={expanded ? '收起描述' : '查看完整描述'}
          aria-label={expanded ? '收起描述' : '查看完整描述'}
        >
          {expanded ? '▴' : '⋯'}
        </button>
      )}
    </div>
  );
}

interface DeckLocalStats {
  total: number;
  due: number;
  newCards: number;
}

/* ── 动画 variants ── */
const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};
const headerVariants = {
  hidden: { opacity: 0, y: -16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as const } },
};
const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } },
};
const deckCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.92 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] as const },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
};
const emptyVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const { decks, isLoading, loadDecks, createDeck, deleteDeck } = useFlashcardStore(useShallow(s => s));

  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<KbanDeckFile | null>(null);
  const [previewConflict, setPreviewConflict] = useState(false);
  const [previewExistingId, setPreviewExistingId] = useState<string | undefined>();
  const { toast } = useToast();

  const {
    isOpen: ctxOpen, position: ctxPos, context: ctxDeck,
    handleContextMenu: ctxHandleMenu, close: ctxClose,
  } = useContextMenu<FlashcardDeck>();

  const deckMenuGroups: ContextMenuGroup[] = [
    { label: '牌组操作', items: [
      { key: 'study', label: '开始学习', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'edit', label: '编辑牌组', icon: <Pencil className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'share', label: '导出分享', icon: <Share2 className="w-4 h-4" strokeWidth={1.5} /> },
    ]},
    { label: '管理', items: [
      { key: 'delete', label: '删除牌组', icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />, danger: true },
    ]},
  ];

  const handleDeckSelect = useCallback(async (itemKey: string, deck: FlashcardDeck) => {
    switch (itemKey) {
      case 'study': navigate(`/flashcards/${deck.id}`); break;
      case 'edit': navigate(`/flashcards/${deck.id}`); break;
      case 'share': {
        try {
          const data = await exportDeck(deck.id);
          downloadDeckFile(data);
          toast({ type: 'success', message: `牌组「${deck.name}」已导出` });
        } catch { toast({ type: 'error', message: '导出失败，请稍后重试' }); }
        break;
      }
      case 'delete': setDeleteTarget(deck.id); break;
    }
  }, [navigate, toast]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importDeck(file);
      setPreviewData(result.deckData);
      setPreviewConflict(result.hasConflict);
      setPreviewExistingId(result.existingDeckId);
      setPreviewOpen(true);
    } catch { toast({ type: 'error', message: '导入失败，请确认文件格式正确' }); }
    finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const refreshAll = async () => {
    await loadDecks();
    const cards = await flashcardStore.getAll();
    setAllCards(cards);
  };

  const handleConfirmNew = async () => {
    if (!previewData) return;
    setImporting(true);
    try {
      const result = await importDeckNew(previewData);
      toast({ type: 'success', message: `导入成功：${result.cardCount} 张卡片` });
      await refreshAll();
    } catch { toast({ type: 'error', message: '导入失败，请稍后重试' }); }
    finally { setImporting(false); setPreviewOpen(false); setPreviewData(null); }
  };

  const handleOverwrite = async () => {
    if (!previewData || !previewExistingId) return;
    setImporting(true);
    try {
      await importDeckOverwrite(previewData, previewExistingId);
      toast({ type: 'success', message: `已覆盖导入：${previewData.cards.length} 张卡片` });
      await refreshAll();
    } catch { toast({ type: 'error', message: '覆盖导入失败' }); }
    finally { setImporting(false); setPreviewOpen(false); setPreviewData(null); }
  };

  const handleSkip = () => {
    importDeckSkip();
    toast({ type: 'info', message: '已跳过导入' });
    setPreviewOpen(false); setPreviewData(null);
  };

  const handleMerge = async () => {
    if (!previewData || !previewExistingId) return;
    setImporting(true);
    try {
      const count = await importDeckMerge(previewData, previewExistingId);
      toast({ type: 'success', message: `已合并 ${count} 张新卡片到现有牌组` });
      await refreshAll();
    } catch { toast({ type: 'error', message: '合并导入失败' }); }
    finally { setImporting(false); setPreviewOpen(false); setPreviewData(null); }
  };

  useEffect(() => {
    loadDecks();
    flashcardStore.getAll().then(setAllCards);
  }, [loadDecks]);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const getStats = useCallback(
    (deckId: string): DeckLocalStats => {
      const deckCards = allCards.filter((c) => c.deckId === deckId);
      const now = new Date();
      return {
        total: deckCards.length,
        due: deckCards.filter((c) => new Date(c.dueDate) <= now).length,
        newCards: deckCards.filter((c) => c.repetitions === 0).length,
      };
    },
    [allCards],
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createDeck(newName.trim(), newDesc.trim() || undefined);
      const cards = await flashcardStore.getAll();
      setAllCards(cards);
      setModalOpen(false); setNewName(''); setNewDesc('');
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteDeck(id);
    const cards = await flashcardStore.getAll();
    setAllCards(cards);
    setDeleteTarget(null);
  };

  const handlePointerDown = (id: string) => {
    longPressTimer.current = setTimeout(() => setDeleteTarget(id), LONG_PRESS_THRESHOLD_MS);
  };
  const handlePointerUp = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  return (
    <motion.div
      className="flex flex-col h-full relative"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── 背景环境光 ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #7BC4B8 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.07, 0.1, 0.07] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #C4956A 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.08, 0.05] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* ── 顶部 ── */}
      <motion.div
        className="flex items-center justify-between px-kb-md py-kb-md flex-shrink-0 relative z-10"
        variants={headerVariants}
      >
        <div>
          <h1 className="text-h1 font-semibold text-text-primary">闪卡</h1>
          <p className="text-b2 text-text-tertiary mt-0.5">间隔重复，高效记忆</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-b2 font-medium
              text-text-secondary bg-bg-secondary/80 border border-border/40 backdrop-blur-sm
              hover:border-flashcard/40 hover:text-flashcard transition-colors duration-200"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing
              ? <span className="w-icon-sm h-icon-sm border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
              : <Upload className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            导入牌组
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03, filter: 'drop-shadow(0 0 8px rgba(123,196,184,0.35))' }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-b2 font-medium
              text-white bg-gradient-to-r from-flashcard to-flashcard/80 shadow-lg shadow-flashcard/20
              hover:shadow-flashcard/30 transition-shadow duration-200"
            onClick={() => setModalOpen(true)}
          >
            <Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />
            新建牌组
          </motion.button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".kban-deck"
          className="hidden"
          onChange={handleImport}
        />
      </motion.div>

      {/* ── 牌组网格 ── */}
      <div className="flex-1 overflow-y-auto px-kb-md pb-kb-lg relative z-10">
        {isLoading ? (
          <motion.div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-kb-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={160} />
            ))}
          </motion.div>
        ) : decks.length === 0 ? (
          <motion.div variants={emptyVariants}>
            <EmptyState
              icon={<Layers3 className="w-12 h-12" strokeWidth={1.2} />}
              title="记忆的泥土还在沉睡"
              description="创建你的第一个牌组，让知识的种子开始生根发芽"
              action={
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-b2 font-medium
                    text-white bg-gradient-to-r from-flashcard to-flashcard/80 shadow-lg shadow-flashcard/20"
                  onClick={() => setModalOpen(true)}
                >
                  <Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />
                  新建牌组
                </motion.button>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-kb-md"
            data-allow-context-menu
            variants={gridVariants}
          >
            <AnimatePresence mode="popLayout">
              {decks.map((deck) => {
                const stats = getStats(deck.id!);
                const progress = stats.total > 0
                  ? (stats.total - stats.due - stats.newCards) / stats.total : 0;
                const pct = Math.round(progress * 100);
                const hasDue = stats.due > 0;

                return (
                  <motion.div
                    key={deck.id}
                    layout
                    variants={deckCardVariants}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    exit={deckCardVariants.exit}
                  >
                    <div
                      className="group relative flex flex-col gap-3 p-kb-md rounded-[var(--kb-radius-md)]
                        bg-bg-secondary/60 backdrop-blur-xl border border-border/30
                        hover:border-flashcard/30 cursor-pointer overflow-hidden
                        transition-colors duration-300"
                      onClick={() => navigate(`/flashcards/${deck.id}`)}
                      onContextMenu={(e) => ctxHandleMenu(e, deck)}
                      onPointerDown={() => handlePointerDown(deck.id!)}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                    >
                      {/* ── 卡片顶部光泽 ── */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{
                          background: 'linear-gradient(135deg, rgba(123,196,184,0.06) 0%, transparent 50%, rgba(123,196,184,0.03) 100%)',
                        }}
                      />
                      {/* ── shimmer 扫光 ── */}
                      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1.2s] ease-in-out pointer-events-none"
                        style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(123,196,184,0.06) 50%, transparent 100%)',
                        }}
                      />

                      {/* ── 到期脉冲指示 ── */}
                      {hasDue && (
                        <motion.div
                          className="absolute top-3 right-3 w-2 h-2 rounded-full bg-flashcard"
                          animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.4, 0.8] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}

                      {/* ── 标题区 ── */}
                      <div className="flex items-start justify-between gap-2 relative z-10">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {deck.color && (
                              <motion.span
                                className="w-2.5 h-2.5 rounded-kb-full flex-shrink-0 shadow-sm"
                                style={{ backgroundColor: deck.color }}
                                whileHover={{ scale: 1.5 }}
                              />
                            )}
                            <h3 className="text-b1 font-semibold text-text-primary truncate">{deck.name}</h3>
                          </div>
                          <DeckCardDescription description={deck.description} />
                        </div>
                        <Tag color="flashcard">{stats.total} 卡</Tag>
                      </div>

                      {/* ── 进度条 ── */}
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-c1 text-text-tertiary">已掌握</span>
                          <motion.span
                            className="text-c1 font-medium text-flashcard tabular-nums"
                            key={pct}
                            initial={{ opacity: 0.5, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            {pct}%
                          </motion.span>
                        </div>
                        <div className="h-1.5 rounded-kb-full bg-bg-tertiary/80 overflow-hidden">
                          <motion.div
                            className="h-full rounded-kb-full relative overflow-hidden"
                            style={{ background: 'linear-gradient(90deg, #7BC4B8, #5BAFA2)' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] as const, delay: 0.3 }}
                          >
                            {/* 进度条流光 */}
                            <div className="absolute inset-0 animate-[kb-progress-shine_2s_ease-in-out_infinite]"
                              style={{
                                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                              }}
                            />
                          </motion.div>
                        </div>
                      </div>

                      {/* ── 底栏 ── */}
                      <div className="flex items-center justify-between text-c1 text-text-tertiary pt-1 border-t border-border/20 relative z-10">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
                          共 {stats.total} 张
                        </span>
                        {hasDue ? (
                          <span className="flex items-center gap-1 text-flashcard font-medium">
                            <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                            {stats.due} 张到期
                          </span>
                        ) : stats.total > 0 ? (
                          <motion.span
                            className="text-semantic-success font-medium"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                          >
                            ✓ 全部已学完
                          </motion.span>
                        ) : (
                          <span className="text-text-tertiary">暂无卡片</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* ── 新建牌组 Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setNewName(''); setNewDesc(''); }}
        title="新建牌组"
        description="创建一个新的闪卡牌组来组织你的学习内容"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalOpen(false); setNewName(''); setNewDesc(''); }}>取消</Button>
            <Button onClick={() => { soundPlayer.play('ui_click'); handleCreate(); }} loading={creating} disabled={!newName.trim()}>创建</Button>
          </>
        }
      >
        <div className="flex flex-col gap-kb-md">
          <Input label="牌组名称" placeholder="例如：数据结构基础" value={newName}
            onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Input label="描述（可选）" placeholder="简要描述牌组内容" value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)} />
        </div>
      </Modal>

      {/* ── 右键菜单 ── */}
      {ctxOpen && ctxDeck && (
        <ContextMenu
          groups={deckMenuGroups} position={ctxPos} context={ctxDeck}
          onSelect={handleDeckSelect} onClose={ctxClose}
        />
      )}

      {/* ── 删除确认 Modal ── */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="删除牌组"
        description={`确定要删除「${decks.find((d) => d.id === deleteTarget)?.name ?? ''}」吗？该操作将同时删除牌组中的所有卡片，且无法撤销。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger"
              icon={<Trash2 className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              onClick={() => deleteTarget !== null && handleDelete(deleteTarget)}>
              删除
            </Button>
          </>
        }
      >
        <div />
      </Modal>

      {/* ── 导入预览 ── */}
      <ImportPreviewModal
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewData(null); }}
        deckData={previewData}
        hasConflict={previewConflict}
        existingDeckId={previewExistingId}
        onConfirmNew={handleConfirmNew}
        onOverwrite={handleOverwrite}
        onSkip={handleSkip}
        onMerge={handleMerge}
        loading={importing}
      />
    </motion.div>
  );
}
