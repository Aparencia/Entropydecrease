/**
 * @ai-context: notes 功能模块 Hook：useNoteAIActions。
 */
import { useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Sparkles, X, Copy, RefreshCw, Download, ChevronDown, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIButton } from '@/components/ui/AIButton';
import { useAISummarize, useAIFlashcards } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

type AIData = ReturnType<typeof useAISummarize>['data'];

function buildSummaryText(data: NonNullable<AIData>) {
  let text = data.summary;
  if (data.keyPoints && data.keyPoints.length > 0) {
    text += '\n\n关键要点：\n' + data.keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n');
  }
  return text;
}

/**
 * AI 操作 Hook — 管理摘要生成、闪卡转换、导出等操作。
 */
export function useNoteAIActions(editor: Editor | null, noteId: string | null) {
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [convertedKeys, setConvertedKeys] = useState<Set<number>>(new Set());

  const { loading: aiLoading, data: aiData, error: aiError, needsConfig: aiNeedsConfig, summarize } = useAISummarize();
  const { loading: flashcardLoading, generate: generateFlashcards } = useAIFlashcards();
  const handleSummarizeError = useAIErrorHandler('AI 摘要生成失败');
  const handleFlashcardError = useAIErrorHandler('AI 闪卡生成失败');
  const { toast } = useToast();
  const navigate = useNavigate();

  const { loadDecks, createDeck, createCard } = useFlashcardStore(useShallow(s => s));

  const ensureDefaultDeck = useCallback(async (): Promise<string> => {
    await loadDecks();
    const currentDecks = useFlashcardStore.getState().decks;
    if (currentDecks.length > 0) return currentDecks[0].id;
    return createDeck('AI 闪卡', '由笔记 AI 自动生成的闪卡');
  }, [loadDecks, createDeck]);

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
    setInsertMenuOpen(false);
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
      const result = await generateFlashcards(keyPoint);
      if (!result) throw new Error('generate failed');
      const targetDeckId = await ensureDefaultDeck();
      await Promise.all(
        result.cards.map((card) =>
          createCard({ deckId: targetDeckId, front: card.front, back: card.back, type: 'basic', sourceNoteId: noteId ?? undefined }),
        ),
      );
      setConvertedKeys(prev => new Set(prev).add(index));
      toast({ type: 'success', message: `已生成 ${result.cards.length} 张闪卡`, silent: true });
    } catch (error) {
      handleFlashcardError(error);
    }
  }, [generateFlashcards, toast, ensureDefaultDeck, createCard, handleFlashcardError]);

  const handleGenerateAllFlashcards = useCallback(async () => {
    if (!aiData?.keyPoints?.length) return;
    try {
      const result = await generateFlashcards(aiData.keyPoints.join('\n'));
      if (!result) throw new Error('generate failed');
      const targetDeckId = await ensureDefaultDeck();
      await Promise.all(
        result.cards.map((card) =>
          createCard({ deckId: targetDeckId, front: card.front, back: card.back, type: 'basic', sourceNoteId: noteId ?? undefined }),
        ),
      );
      setConvertedKeys(new Set(aiData.keyPoints!.map((_, i) => i)));
      toast({ type: 'success', message: `已从全部要点生成 ${result.cards.length} 张闪卡`, silent: true });
    } catch (error) {
      handleFlashcardError(error);
    }
  }, [aiData, generateFlashcards, toast, ensureDefaultDeck, createCard, handleFlashcardError]);

  const handleRegenerate = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) { toast({ type: 'warning', message: '笔记内容为空' }); return; }
    setConvertedKeys(new Set());
    summarize(text).catch(handleSummarizeError);
  }, [editor, summarize, toast, handleSummarizeError]);

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

  /** 触发 AI 摘要生成 */
  const triggerSummarize = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) { toast({ type: 'warning', message: '请先写一些笔记内容再生成摘要' }); return; }
    summarize(text).then(() => setSummaryModalOpen(true)).catch(handleSummarizeError);
  }, [editor, summarize, toast, handleSummarizeError]);

  return {
    summaryModalOpen, setSummaryModalOpen,
    insertMenuOpen, setInsertMenuOpen,
    convertedKeys,
    aiLoading, aiData, aiError, aiNeedsConfig,
    flashcardLoading,
    triggerSummarize,
    handleInsertNote, handleCopySummary,
    handleGenerateFlashcard, handleGenerateAllFlashcards,
    handleRegenerate, handleExport,
    navigate,
  };
}

/* ── AI 摘要结果弹窗组件 ── */
interface AISummaryModalProps {
  aiLoading: boolean;
  aiData: AIData;
  aiError: string | null;
  aiNeedsConfig: boolean;
  flashcardLoading: boolean;
  convertedKeys: Set<number>;
  insertMenuOpen: boolean;
  onClose: () => void;
  onCopy: () => void;
  onInsert: (pos: 'cursor' | 'start' | 'end') => void;
  onGenerateFlashcard: (kp: string, i: number) => void;
  onGenerateAll: () => void;
  onRegenerate: () => void;
  onExport: () => void;
  onToggleInsertMenu: () => void;
  onNavigateSettings: () => void;
}

export function AISummaryModal({
  aiLoading, aiData, aiError, aiNeedsConfig, flashcardLoading, convertedKeys, insertMenuOpen,
  onClose, onCopy, onInsert, onGenerateFlashcard, onGenerateAll, onRegenerate, onExport,
  onToggleInsertMenu, onNavigateSettings,
}: AISummaryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-kb-md">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className={cn('relative w-full max-w-lg bg-bg-elevated rounded-kb-xl shadow-kb-lg', 'border border-border/40 p-kb-lg')}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast">
          <X className="w-icon-md h-icon-md" />
        </button>
        <h2 className="text-h2 font-semibold text-text-primary flex items-center gap-2 pr-8">
          <Sparkles className="w-icon-md h-icon-md text-brand-500" strokeWidth={1.5} /> AI 摘要
        </h2>
        {aiLoading && (
          <div className="mt-kb-md flex items-center gap-2 text-b2 text-text-secondary">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            正在生成摘要…
          </div>
        )}
        {aiError && !aiLoading && (
          <div className="mt-kb-md p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
            {aiError}
            {aiNeedsConfig && (
              <button onClick={onNavigateSettings} className="mt-2 block text-b3 underline hover:no-underline">前往设置页配置 API Key</button>
            )}
          </div>
        )}
        {aiData && !aiLoading && (
          <div className="mt-kb-md flex flex-col gap-kb-md kb-ai-result-enter">
            <div className="group relative">
              <p className="text-b3 font-medium text-text-tertiary uppercase tracking-wide mb-1">摘要</p>
              <p className="text-b2 text-text-secondary leading-relaxed pr-8">{aiData.summary}</p>
              <button onClick={onCopy} title="复制摘要" className="absolute top-0 right-0 p-1.5 rounded-kb-sm text-text-tertiary hover:text-brand-600 hover:bg-brand-50 opacity-0 group-hover:opacity-100 transition-all duration-kb-fast">
                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
            {(aiData.keyPoints?.length ?? 0) > 0 && (
              <div>
                <p className="text-b3 font-medium text-text-tertiary uppercase tracking-wide mb-1">关键要点</p>
                <ul className="flex flex-col gap-1.5">
                  {aiData.keyPoints?.map((kp, i) => (
                    <li key={i} className="group flex items-start gap-2 text-b2 text-text-secondary rounded-kb-sm px-2 py-1 -mx-2 hover:bg-bg-tertiary/50 transition-colors">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-kb-full bg-brand-500 flex-shrink-0" />
                      <span className="flex-1">{kp}</span>
                      <button onClick={() => onGenerateFlashcard(kp, i)} disabled={flashcardLoading}
                        title={convertedKeys.has(i) ? '已生成闪卡' : '生成闪卡'}
                        className={`flex-shrink-0 p-1 rounded-kb-sm transition-all duration-kb-fast ${convertedKeys.has(i) ? 'text-semantic-success opacity-100' : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50 opacity-0 group-hover:opacity-100'} ${flashcardLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {convertedKeys.has(i) ? <Check className="w-3.5 h-3.5" strokeWidth={2} /> : <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(aiData.keyPoints?.length ?? 0) > 2 && (
              <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200/30 rounded-kb-md">
                <span className="text-b2 text-brand-700">💡 检测到 {aiData.keyPoints!.length} 个核心概念，适合制作复习闪卡</span>
                <AIButton size="sm" onClick={onGenerateAll} disabled={flashcardLoading} loading={flashcardLoading} className="flex-shrink-0">一键生成</AIButton>
              </div>
            )}
            <div className="border-t border-border/30 pt-3 mt-1 flex items-center gap-2">
              <div className="relative">
                <button onClick={onToggleInsertMenu} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-95 transition-all duration-kb-fast">
                  插入笔记 <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
                {insertMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-36 bg-bg-elevated rounded-kb-md shadow-kb-md border border-border/40 py-1 z-10">
                    <button onClick={() => onInsert('cursor')} className="w-full text-left px-3 py-2 text-b2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors">光标位置</button>
                    <button onClick={() => onInsert('start')} className="w-full text-left px-3 py-2 text-b2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors">笔记开头</button>
                    <button onClick={() => onInsert('end')} className="w-full text-left px-3 py-2 text-b2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors">笔记末尾</button>
                  </div>
                )}
              </div>
              <button onClick={onRegenerate} disabled={aiLoading} title="重新生成摘要"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-95 transition-all duration-kb-fast ${aiLoading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {aiLoading ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />}
                重新生成
              </button>
              <button onClick={onExport} title="导出摘要" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-95 transition-all duration-kb-fast">
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> 导出
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
