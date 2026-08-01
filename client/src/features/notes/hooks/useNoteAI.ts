/**
 * 笔记 AI 摘要与闪卡衍生 hook
 *
 * @ai-context: 从 NoteEditPage 拆出。承载摘要生成后的全部后续操作：
 * 插入笔记（光标/开头/末尾三种位置）、复制、导出 Markdown、要点转闪卡
 * （单条/全部，convertedKeys 记录已转化项）。闪卡落库前用 ensureDefaultDeck
 * 保证目标牌组存在（无牌组时自动建"AI 闪卡"）。
 */
import { useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { useShallow } from 'zustand/react/shallow';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { useAISummarize, useAIFlashcards } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { useToast } from '@/components/ui';

type SummaryData = NonNullable<ReturnType<typeof useAISummarize>['data']>;

/** 摘要 + 关键要点拼为纯文本 */
function buildSummaryText(data: SummaryData): string {
  let text = data.summary;
  if (data.keyPoints && data.keyPoints.length > 0) {
    text += '\n\n关键要点：\n' + data.keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n');
  }
  return text;
}

export function useNoteAI(editor: Editor | null, noteId: string | null) {
  const { toast } = useToast();
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [convertedKeys, setConvertedKeys] = useState<Set<number>>(new Set());

  const {
    loading: aiLoading, data: aiData, error: aiError, needsConfig: aiNeedsConfig,
    streamingText, isStreaming, summarizeStream, cancelStream,
  } = useAISummarize();
  const { loading: flashcardLoading, generate: generateFlashcards } = useAIFlashcards();
  const handleSummarizeError = useAIErrorHandler('AI 摘要生成失败');
  const handleFlashcardError = useAIErrorHandler('AI 闪卡生成失败');

  const { loadDecks, createDeck, createCard } = useFlashcardStore(useShallow(s => s));

  /** 获取目标牌组：优先使用已有牌组，否则自动创建默认牌组 */
  const ensureDefaultDeck = useCallback(async (): Promise<string> => {
    await loadDecks();
    const currentDecks = useFlashcardStore.getState().decks;
    if (currentDecks.length > 0) return currentDecks[0].id;
    return createDeck('AI 闪卡', '由笔记 AI 自动生成的闪卡');
  }, [loadDecks, createDeck]);

  /** 将 AI 生成的卡片批量落库到目标牌组，返回卡片数 */
  const persistCards = useCallback(async (source: string): Promise<number> => {
    const result = await generateFlashcards(source);
    if (!result) throw new Error('generate failed');
    const targetDeckId = await ensureDefaultDeck();
    await Promise.all(
      result.cards.map((card) =>
        createCard({
          deckId: targetDeckId,
          front: card.front,
          back: card.back,
          type: 'basic',
          sourceNoteId: noteId ?? undefined,
        }),
      ),
    );
    return result.cards.length;
  }, [generateFlashcards, ensureDefaultDeck, createCard, noteId]);

  /** 顶栏入口：校验非空后立即弹出浮层并流式生成摘要（P2-12） */
  const startSummarize = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) {
      toast({ type: 'warning', message: '请先写一些笔记内容再生成摘要' });
      return;
    }
    setConvertedKeys(new Set());
    setSummaryModalOpen(true);
    summarizeStream(text).catch(handleSummarizeError);
  }, [editor, summarizeStream, toast, handleSummarizeError]);

  const handleInsertNote = useCallback((position: 'cursor' | 'start' | 'end') => {
    if (!editor || !aiData) return;
    const text = buildSummaryText(aiData);
    const htmlContent = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    if (position === 'cursor') {
      editor.chain().focus().insertContent(htmlContent).run();
    } else if (position === 'start') {
      const currentHTML = editor.getHTML();
      editor.chain().focus().setContent(htmlContent + currentHTML).run();
    } else {
      const docSize = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(docSize, htmlContent).run();
    }
    setSummaryModalOpen(false);
    toast({ type: 'success', message: '摘要已插入笔记' });
  }, [editor, aiData, toast]);

  const handleCopySummary = useCallback(() => {
    if (!aiData) return;
    navigator.clipboard.writeText(buildSummaryText(aiData)).then(
      () => toast({ type: 'success', message: '摘要已复制到剪贴板' }),
      () => toast({ type: 'error', message: '复制失败' }),
    );
  }, [aiData, toast]);

  const handleGenerateFlashcard = useCallback(async (keyPoint: string, index: number) => {
    try {
      const count = await persistCards(keyPoint);
      setConvertedKeys(prev => new Set(prev).add(index));
      toast({ type: 'success', message: `已生成 ${count} 张闪卡`, silent: true });
    } catch (error) {
      handleFlashcardError(error);
    }
  }, [persistCards, toast, handleFlashcardError]);

  const handleGenerateAllFlashcards = useCallback(async () => {
    if (!aiData?.keyPoints?.length) return;
    try {
      const count = await persistCards(aiData.keyPoints.join('\n'));
      setConvertedKeys(new Set(aiData.keyPoints.map((_, i) => i)));
      toast({ type: 'success', message: `已从全部要点生成 ${count} 张闪卡`, silent: true });
    } catch (error) {
      handleFlashcardError(error);
    }
  }, [aiData, persistCards, toast, handleFlashcardError]);

  const handleRegenerate = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) { toast({ type: 'warning', message: '笔记内容为空' }); return; }
    setConvertedKeys(new Set());
    summarizeStream(text).catch(handleSummarizeError);
  }, [editor, summarizeStream, toast, handleSummarizeError]);

  const handleExport = useCallback(() => {
    if (!aiData) return;
    let md = `## 摘要\n\n${aiData.summary}\n`;
    if (aiData.keyPoints?.length) {
      md += '\n## 关键要点\n\n';
      aiData.keyPoints.forEach((kp, i) => { md += `${i + 1}. ${kp}\n`; });
    }
    md += `\n---\n*由熵减 AI 生成于 ${new Date(aiData.generatedAt).toLocaleString()}*\n`;
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ai-summary-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
    toast({ type: 'success', message: '摘要已导出' });
  }, [aiData, toast]);

  return {
    summaryModalOpen, setSummaryModalOpen,
    aiLoading, aiData, aiError, aiNeedsConfig,
    streamingText, isStreaming, cancelStream,
    flashcardLoading, convertedKeys,
    ensureDefaultDeck, persistCards,
    startSummarize, handleInsertNote, handleCopySummary,
    handleGenerateFlashcard, handleGenerateAllFlashcards,
    handleRegenerate, handleExport, handleFlashcardError,
  };
}
