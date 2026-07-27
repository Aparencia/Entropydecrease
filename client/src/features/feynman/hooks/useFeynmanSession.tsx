import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useToast } from '@/components/ui';
import type { ContextMenuGroup } from '@/components/ui';
import { useContextMenu } from '@/lib/contextMenu';
import { useFeynmanStore } from '../store/useFeynmanStore';
import { useShallow } from 'zustand/react/shallow';
import { useAIEvaluate, useAIFeynmanQuestion, useAIFeynmanEvaluateAnswers } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { useStuckTimer } from '@/hooks/useStuckTimer';
import {
  MessageCircle, Lightbulb, SearchCheck,
} from 'lucide-react';

/**
 * 费曼学习会话核心逻辑 hook。
 * 管理所有本地状态、store 交互、AI 调用、卡壳救援及右键菜单。
 */
export function useFeynmanSession(noteId: string | null) {
  const {
    currentNoteId, isLoading,
    loadNote,
    setExplanation,
    updateNote,
    addWeakPoint,
    removeWeakPoint,
    toggleWeakPointMastered,
    setSimplifiedSummary,
    advanceStep,
    setSelfRating,
    completeNote,
    getCurrentView,
  } = useFeynmanStore(useShallow(s => s));

  // ── Local state ──
  const [localExplanation, setLocalExplanation] = useState('');
  const [localSummary, setLocalSummary] = useState('');
  const [weakPanelOpen, setWeakPanelOpen] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{ text: string; start: number; end: number } | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [showAIEval, setShowAIEval] = useState(false);
  const [localAnswers, setLocalAnswers] = useState<string[]>([]);
  const [showQuestionPanel, setShowQuestionPanel] = useState(false);

  // ── 卡壳救援 ──
  const [rescueOpen, setRescueOpen] = useState(false);
  const stuckTimer = useStuckTimer({
    onThreshold: () => {
      window.dispatchEvent(new Event('rescue:show-incubation'));
    },
  });

  // ── AI hooks ──
  const {
    loading: aiEvalLoading,
    data: aiEvalData,
    error: aiEvalError,
    needsConfig: aiEvalNeedsConfig,
    evaluate: aiEvaluate,
  } = useAIEvaluate();

  const {
    loading: aiQuestionLoading,
    data: aiQuestionData,
    error: aiQuestionError,
    needsConfig: aiQuestionNeedsConfig,
    generateQuestions,
  } = useAIFeynmanQuestion();

  const {
    loading: aiAnswerEvalLoading,
    data: aiAnswerEvalData,
    error: aiAnswerEvalError,
    needsConfig: aiAnswerEvalNeedsConfig,
    evaluateAnswers: aiEvaluateAnswers,
  } = useAIFeynmanEvaluateAnswers();

  const { toast } = useToast();
  const handleQuestionError = useAIErrorHandler('AI 追问生成失败');
  const handleEvalError = useAIErrorHandler('AI 评估失败');

  const explanationRef = useRef<HTMLDivElement>(null);

  // ── Effects ──

  // Load note on mount
  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    }
  }, [noteId, loadNote]);

  // Ctrl+Shift+H 快捷键打开救援面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setRescueOpen(true);
        stuckTimer.start();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stuckTimer]);

  // ── Derived state ──
  const view = noteId && currentNoteId === noteId ? getCurrentView() : null;
  const note = view?.note ?? null;
  const summary = view?.summary ?? null;
  const noteWeakPoints = view?.weakPoints ?? [];

  // Sync local state when note/summary loads
  useEffect(() => {
    if (note) {
      setLocalExplanation(note.explanation);
      setRating(note.selfRating ?? 0);
    }
  }, [note?.id, note?.explanation, note?.selfRating]);

  useEffect(() => {
    if (summary) {
      setLocalSummary(summary.summary);
    } else {
      setLocalSummary('');
    }
  }, [summary?.id, summary?.summary]);

  const currentStep = note?.currentStep ?? 1;
  const completedSteps = Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
  const isCompleted = note?.status === 'completed';

  // ── Handlers ──

  const handleStep2Blur = useCallback(async () => {
    if (!noteId || !note) return;
    if (localExplanation !== note.explanation) {
      await updateNote(noteId, { explanation: localExplanation });
    }
  }, [noteId, note, localExplanation, updateNote]);

  const handleSummaryBlur = useCallback(async () => {
    if (!noteId) return;
    const currentSummary = summary?.summary ?? '';
    if (localSummary !== currentSummary) {
      await setSimplifiedSummary(noteId, localSummary);
    }
  }, [noteId, summary, localSummary, setSimplifiedSummary]);

  const handleNext = useCallback(async () => {
    if (!noteId) return;
    if (currentStep === 1 && localExplanation.trim()) {
      await setExplanation(noteId, localExplanation);
    } else if (currentStep === 2) {
      if (localExplanation !== note?.explanation) {
        await updateNote(noteId, { explanation: localExplanation });
      }
    } else if (currentStep === 4 && localSummary.trim()) {
      await setSimplifiedSummary(noteId, localSummary);
    }
    await advanceStep(noteId);
  }, [noteId, currentStep, localExplanation, localSummary, note, setExplanation, updateNote, setSimplifiedSummary, advanceStep]);

  const handlePrev = useCallback(() => {
    if (!noteId || !note || currentStep <= 1) return;
    updateNote(noteId, { currentStep: (currentStep - 1) as 1 | 2 | 3 | 4 });
  }, [noteId, note, currentStep, updateNote]);

  const handleComplete = useCallback(async () => {
    if (!noteId) return;
    const currentSummary = summary?.summary ?? '';
    if (localSummary.trim() && localSummary !== currentSummary) {
      await setSimplifiedSummary(noteId, localSummary);
    }
    await completeNote(noteId);
  }, [noteId, localSummary, summary, setSimplifiedSummary, completeNote]);

  const handleRating = useCallback(async (r: number) => {
    if (!noteId) return;
    setRating(r);
    await setSelfRating(noteId, r);
  }, [noteId, setSelfRating]);

  // ── Text selection for weak points ──

  const handleTextSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !explanationRef.current) {
      setSelectionPopup(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) { setSelectionPopup(null); return; }

    try {
      const range = sel.getRangeAt(0);
      const container = explanationRef.current;
      const preRange = document.createRange();
      preRange.selectNodeContents(container);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startIdx = preRange.toString().length;
      const endIdx = startIdx + text.length;
      setSelectionPopup({ text, start: startIdx, end: endIdx });
    } catch {
      // 降级到 indexOf（文本不在容器内时兜底）
      const fullText = note?.explanation ?? '';
      const startIdx = fullText.indexOf(text);
      if (startIdx >= 0) {
        setSelectionPopup({ text, start: startIdx, end: startIdx + text.length });
      }
    }
  }, [note]);

  const handleAddWeakPoint = useCallback(async () => {
    if (!noteId || !selectionPopup) return;
    await addWeakPoint(noteId, {
      text: selectionPopup.text,
      position: { start: selectionPopup.start, end: selectionPopup.end },
      mastered: false,
    });
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }, [noteId, selectionPopup, addWeakPoint]);

  // ── Right-click context menu (AI operations) ──
  const {
    isOpen: menuOpen,
    position: menuPosition,
    context: menuContext,
    handleContextMenu,
    close: closeMenu,
  } = useContextMenu<string>();

  const aiMenuGroups = useMemo<ContextMenuGroup[]>(() => [
    {
      label: 'AI 操作',
      items: [
        { key: 'ai-follow-up', label: 'AI 追问', icon: <MessageCircle className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'ai-simplify', label: '通俗化解释', icon: <Lightbulb className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'ai-gap-check', label: '查漏补缺', icon: <SearchCheck className="w-4 h-4" strokeWidth={1.5} /> },
      ],
    },
  ], []);

  const handleMenuSelect = useCallback((itemKey: string, text: string) => {
    if (itemKey === 'ai-follow-up') {
      if (!note?.concept || !note?.explanation) {
        toast({ type: 'warning', message: '请先完成讲解内容' });
        return;
      }
      setShowQuestionPanel(true);
      generateQuestions(note.concept, note.explanation)
        .catch(handleQuestionError);
    } else {
      // 其他 AI 操作待后续实现
    }
  }, [note, generateQuestions, toast, handleQuestionError]);

  /**
   * 从 textarea 或 window selection 中提取选中文本，若无选中则回退到整体内容。
   */
  const getContextMenuText = useCallback(
    (fallback: string): string => {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLTextAreaElement) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== end) {
          return activeEl.value.slice(start, end).trim();
        }
        return activeEl.value.trim() || fallback;
      }
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        const text = sel.toString().trim();
        if (text) return text;
      }
      return fallback;
    },
    [],
  );

  const handleNoteContextMenu = useCallback(
    (e: React.MouseEvent, fallback: string) => {
      const text = getContextMenuText(fallback);
      if (!text) return;
      handleContextMenu(e, text);
    },
    [getContextMenuText, handleContextMenu],
  );

  // ── AI actions ──

  const handleStartAIEval = useCallback(() => {
    if (!note?.concept || !note?.explanation) {
      toast({ type: 'warning', message: '请先完成讲解内容' });
      return;
    }
    setShowAIEval(true);
    aiEvaluate(note.concept, note.explanation).catch(handleEvalError);
  }, [note, aiEvaluate, toast, handleEvalError]);

  const handleStartQuestion = useCallback(() => {
    if (!note?.concept || !note?.explanation) {
      toast({ type: 'warning', message: '请先完成讲解内容' });
      return;
    }
    setShowQuestionPanel(true);
    setLocalAnswers([]);
    generateQuestions(note.concept, note.explanation).catch(handleQuestionError);
  }, [note, generateQuestions, toast, handleQuestionError]);

  const handleSubmitAnswers = useCallback(async () => {
    if (!note?.concept) return;
    const questions = aiQuestionData?.questions.map(q => q.question) ?? [];
    const answers = aiQuestionData?.questions.map((_, i) => localAnswers[i] || '') ?? [];
    if (answers.every(a => !a.trim())) {
      toast({ type: 'warning', message: '请至少回答一个追问' });
      return;
    }
    await aiEvaluateAnswers(note.concept, questions, answers).catch(handleEvalError);
  }, [note, aiQuestionData, localAnswers, aiEvaluateAnswers, toast, handleEvalError]);

  const openRescue = useCallback(() => {
    setRescueOpen(true);
    stuckTimer.start();
  }, [stuckTimer]);

  const closeRescue = useCallback(() => {
    setRescueOpen(false);
    stuckTimer.stop();
  }, [stuckTimer]);

  return {
    // Data
    isLoading,
    note,
    summary,
    noteWeakPoints,
    currentStep,
    completedSteps,
    isCompleted,

    // Local state
    localExplanation, setLocalExplanation,
    localSummary, setLocalSummary,
    weakPanelOpen, setWeakPanelOpen,
    selectionPopup, setSelectionPopup,
    rating, hoverRating, setHoverRating,
    showAIEval, setShowAIEval,
    localAnswers, setLocalAnswers,
    showQuestionPanel, setShowQuestionPanel,

    // Rescue
    rescueOpen, openRescue, closeRescue,

    // Refs
    explanationRef,

    // Handlers
    handleStep2Blur,
    handleSummaryBlur,
    handleNext,
    handlePrev,
    handleComplete,
    handleRating,
    handleTextSelect,
    handleAddWeakPoint,
    handleNoteContextMenu,

    // Store actions (for sub-components)
    toggleWeakPointMastered,
    removeWeakPoint,

    // AI eval
    aiEvalLoading, aiEvalData, aiEvalError, aiEvalNeedsConfig,
    handleStartAIEval,

    // AI question
    aiQuestionLoading, aiQuestionData, aiQuestionError, aiQuestionNeedsConfig,
    handleStartQuestion,

    // AI answer eval
    aiAnswerEvalLoading, aiAnswerEvalData, aiAnswerEvalError, aiAnswerEvalNeedsConfig,
    handleSubmitAnswers,

    // Context menu
    menuOpen, menuPosition, menuContext, aiMenuGroups, handleMenuSelect, closeMenu,
  };
}
