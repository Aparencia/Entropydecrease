/**
 * @ai-context: flashcards 功能模块页面：FlashcardsPage。拆分后的组合层——
 * 导入冲突流程见 useDeckImport，牌组网格/卡片/描述见 DeckCardGrid/DeckCard/
 * DeckCardDescription，长按删除、右键菜单与新建/重命名弹窗保留在本页。
 * @ai-context: Flashcards feature page (assembly layer). The import conflict
 * flow lives in useDeckImport; the deck grid / card / description live in
 * DeckCardGrid / DeckCard / DeckCardDescription; long-press delete, the
 * context menu and create / rename modals stay on this page.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { Plus, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { flashcardStore } from '@/lib/storage';
import ImportPreviewModal from '../components/ImportPreviewModal';
import { DeckCardGrid } from '../components/DeckCardGrid';
import { DeckManagementModals } from '../components/DeckManagementModals';
import type { DeckLocalStats } from '../components/DeckCard';
import { useDeckImport } from '../hooks/useDeckImport';
import { useDeckContextMenu } from '../hooks/useDeckContextMenu';
import { useContextMenu } from '@/lib/contextMenu/useContextMenu';
import type { Flashcard, FlashcardDeck } from '@/types/models';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

const LONG_PRESS_THRESHOLD_MS = 600;

/* ── 动画 variants ── */
const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};
const headerVariants = {
  hidden: { opacity: 0, y: -16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as const } },
};

export default function FlashcardsPage() {
  const navigate = useNavigate();
  // P1-5 细粒度订阅：整 store 订阅会在任意牌组/卡片变化时重渲染整页
  const decks = useFlashcardStore((s) => s.decks);
  const isLoading = useFlashcardStore((s) => s.isLoading);
  // 动作（稳定引用）
  const loadDecks = useFlashcardStore((s) => s.loadDecks);
  const createDeck = useFlashcardStore((s) => s.createDeck);
  const renameDeck = useFlashcardStore((s) => s.renameDeck);
  const deleteDeck = useFlashcardStore((s) => s.deleteDeck);

  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // 牌组重命名弹窗状态（右键「编辑牌组」）
  const [renameTarget, setRenameTarget] = useState<FlashcardDeck | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const refreshAll = async () => {
    await loadDecks();
    const cards = await flashcardStore.getAll();
    setAllCards(cards);
  };

  const deckImport = useDeckImport({ onRefresh: refreshAll });

  const {
    isOpen: ctxOpen, position: ctxPos, context: ctxDeck,
    handleContextMenu: ctxHandleMenu, close: ctxClose,
  } = useContextMenu<FlashcardDeck>();

  const deckMenu = useDeckContextMenu({
    navigate,
    onEdit: (deck) => { setRenameTarget(deck); setRenameName(deck.name); },
    onDelete: (id) => setDeleteTarget(id),
  });

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

  // 牌组重命名保存
  const handleRename = async () => {
    if (!renameTarget || !renameName.trim() || renameName.trim() === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setRenaming(true);
    try {
      await renameDeck(renameTarget.id, renameName.trim());
      toast({ type: 'success', message: `牌组已重命名为「${renameName.trim()}」`, silent: true });
      setRenameTarget(null);
    } finally { setRenaming(false); }
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

      {/* ── 顶部：仪式页头（反衰减呼吸） ── */}
      <motion.div
        className="flex items-center justify-between px-kb-md py-kb-md flex-shrink-0 relative z-10"
        variants={headerVariants}
      >
        <ModuleRitualHeader
          title="反衰减呼吸"
          note="间隔重复，高效记忆"
          sealChar="呼"
          sealColor="#7BC4B8"
        />
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-b2 font-medium
              text-text-secondary bg-bg-secondary/80 border border-border/40 backdrop-blur-sm
              hover:border-flashcard/40 hover:text-flashcard transition-colors duration-200"
            disabled={deckImport.importing}
            onClick={() => deckImport.fileInputRef.current?.click()}
          >
            {deckImport.importing
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
          ref={deckImport.fileInputRef}
          type="file"
          accept=".kban-deck"
          className="hidden"
          onChange={deckImport.handleImport}
        />
      </motion.div>

      {/* ── 牌组网格 ── */}
      <DeckCardGrid
        decks={decks}
        isLoading={isLoading}
        statsFor={getStats}
        onNavigate={(id) => navigate(`/flashcards/${id}`)}
        onContextMenu={ctxHandleMenu}
        onLongPressStart={handlePointerDown}
        onLongPressEnd={handlePointerUp}
        onCreateClick={() => setModalOpen(true)}
      />

      {/* ── 右键菜单 ── */}
      {ctxOpen && ctxDeck && (
        <ContextMenu
          groups={deckMenu.groups} position={ctxPos} context={ctxDeck}
          onSelect={deckMenu.handleSelect} onClose={ctxClose}
        />
      )}

      {/* ── 新建 / 删除 / 重命名弹窗 ── */}
      <DeckManagementModals
        createOpen={modalOpen}
        createName={newName}
        createDesc={newDesc}
        creating={creating}
        deleteOpen={deleteTarget !== null}
        deleteTargetName={decks.find((d) => d.id === deleteTarget)?.name ?? ''}
        renameOpen={renameTarget !== null}
        renameName={renameName}
        renameCurrentName={renameTarget?.name}
        renaming={renaming}
        onCloseCreate={() => { setModalOpen(false); setNewName(''); setNewDesc(''); }}
        onCreateNameChange={setNewName}
        onCreateDescChange={setNewDesc}
        onCreateSubmit={() => { soundPlayer.play('ui_click'); handleCreate(); }}
        onCloseDelete={() => setDeleteTarget(null)}
        onConfirmDelete={() => deleteTarget !== null && handleDelete(deleteTarget)}
        onCloseRename={() => setRenameTarget(null)}
        onRenameNameChange={setRenameName}
        onRenameSubmit={handleRename}
      />

      {/* ── 导入预览 ── */}
      <ImportPreviewModal
        open={deckImport.previewOpen}
        onClose={deckImport.closePreview}
        deckData={deckImport.previewData}
        hasConflict={deckImport.previewConflict}
        existingDeckId={deckImport.previewExistingId}
        onConfirmNew={deckImport.handleConfirmNew}
        onOverwrite={deckImport.handleOverwrite}
        onSkip={deckImport.handleSkip}
        onMerge={deckImport.handleMerge}
        loading={deckImport.importing}
      />
    </motion.div>
  );
}
