/**
 * 牌组卡片管理 hook（CRUD + 导出 + AI 生成）
 *
 * @ai-context: 从 DeckDetailPage 拆出。承载新建/编辑弹窗表单态、删除确认、
 * 牌组导出与 AI 批量生成。AI 生成结果暂存在内存中（aiGeneratedCards），
 * 需用户逐张确认才 createCard 落库，避免生成质量不佳时污染牌组。
 */
import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui';
import { exportDeck, downloadDeckFile } from '@/lib/storage/exportImport';
import { useAIFlashcards } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { Flashcard } from '@/types/models';
import type { Flashcard as AIFlashcard } from '@/lib/ai/types';

interface UseDeckCardsOptions {
  deckId: string | undefined;
  deckName: string | undefined;
  createCard: (input: { deckId: string; front: string; back: string; type: 'basic' }) => Promise<unknown>;
  updateCard: (id: string, changes: { front: string; back: string }) => Promise<unknown> | unknown;
  deleteCard: (id: string) => Promise<unknown> | unknown;
}

export function useDeckCards({
  deckId, deckName, createCard, updateCard, deleteCard,
}: UseDeckCardsOptions) {
  const { toast } = useToast();

  // 新建/编辑弹窗
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // AI 生成
  const [aiModalOpen, setAIModalOpen] = useState(false);
  const [aiInputContent, setAIInputContent] = useState('');
  const [aiGeneratedCards, setAIGeneratedCards] = useState<AIFlashcard[]>([]);
  const [aiAddingIndex, setAIAddingIndex] = useState<number | null>(null);
  const { loading: aiLoading, error: aiError, needsConfig: aiNeedsConfig, generate } = useAIFlashcards();
  const handleAIGenerateError = useAIErrorHandler('AI 闪卡生成失败');

  const openAddModal = useCallback(() => {
    setEditingCardId(null);
    setCardFront('');
    setCardBack('');
    setCardModalOpen(true);
  }, []);

  const openEditModal = useCallback((card: Flashcard) => {
    setEditingCardId(card.id ?? null);
    setCardFront(card.front);
    setCardBack(card.back);
    setCardModalOpen(true);
  }, []);

  const closeCardModal = useCallback(() => {
    setCardModalOpen(false);
    setEditingCardId(null);
  }, []);

  const handleSaveCard = useCallback(async () => {
    if (!cardFront.trim() || !cardBack.trim()) return;
    // v0.30: deckId 缺失时明确报错，禁止静默跳过（用户反馈“有时看不见创建的闪卡”）
    if (editingCardId === null && !deckId) {
      toast({ type: 'error', message: '牌组信息异常，无法创建卡片，请返回重试' });
      return;
    }
    setSaving(true);
    try {
      if (editingCardId !== null) {
        await updateCard(editingCardId, { front: cardFront.trim(), back: cardBack.trim() });
      } else {
        await createCard({
          deckId: deckId!,
          front: cardFront.trim(),
          back: cardBack.trim(),
          type: 'basic',
        });
      }
      setCardModalOpen(false);
      setCardFront('');
      setCardBack('');
    } catch {
      toast({ type: 'error', message: '保存卡片失败，请重试' });
    } finally {
      setSaving(false);
    }
  }, [cardFront, cardBack, editingCardId, deckId, createCard, updateCard, toast]);

  const handleDeleteCard = useCallback(async () => {
    if (deleteCardId === null) return;
    await deleteCard(deleteCardId);
    soundPlayer.play('feedback_delete');
    setDeleteCardId(null);
  }, [deleteCardId, deleteCard]);

  const handleExport = useCallback(async () => {
    if (!deckId) return;
    setExporting(true);
    try {
      const data = await exportDeck(deckId);
      downloadDeckFile(data);
      toast({ type: 'success', message: `牌组「${deckName}」已导出` });
    } catch {
      toast({ type: 'error', message: '导出失败，请稍后重试' });
    } finally {
      setExporting(false);
    }
  }, [deckId, deckName, toast]);

  const openAIModal = useCallback(() => {
    setAIInputContent('');
    setAIGeneratedCards([]);
    setAIModalOpen(true);
  }, []);

  const handleAIGenerate = useCallback(() => {
    if (!aiInputContent.trim()) {
      toast({ type: 'warning', message: '请输入一些内容再生成闪卡' });
      return;
    }
    generate(aiInputContent)
      .then((result) => {
        if (result) setAIGeneratedCards(result.cards);
      })
      .catch(handleAIGenerateError);
  }, [aiInputContent, generate, toast, handleAIGenerateError]);

  const handleAddGeneratedCard = useCallback((card: AIFlashcard, index: number) => {
    if (!deckId) return;
    setAIAddingIndex(index);
    createCard({ deckId, front: card.front, back: card.back, type: 'basic' })
      .then(() => toast({ type: 'success', message: '卡片已添加' }))
      .catch(() => toast({ type: 'error', message: '添加失败' }))
      .finally(() => setAIAddingIndex(null));
  }, [deckId, createCard, toast]);

  return {
    cardModalOpen, editingCardId, cardFront, cardBack, saving,
    setCardFront, setCardBack, openAddModal, openEditModal, closeCardModal, handleSaveCard,
    deleteCardId, setDeleteCardId, handleDeleteCard,
    exporting, handleExport,
    aiModalOpen, setAIModalOpen, openAIModal,
    aiInputContent, setAIInputContent, aiGeneratedCards, aiAddingIndex,
    aiLoading, aiError, aiNeedsConfig,
    handleAIGenerate, handleAddGeneratedCard,
  };
}
