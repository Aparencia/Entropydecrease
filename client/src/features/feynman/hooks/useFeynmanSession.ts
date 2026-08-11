/**
 * 费曼学习会话核心状态 hook（笔记/步骤/薄弱点/闪卡转化）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出的核心逻辑层。管理讲解/总结本地
 * 草稿、步骤推进（含方向感知）、薄弱点选中标记、闪卡转化全流程。
 * 与 useFeynmanAI（AI 评估/反问/救援）职责分离，页面组合两者。
 * @ai-context: 步骤推进前自动保存当前草稿（handleNext 按步骤分支）；
 * 完成时若有未掌握薄弱点会先弹转化确认（handleComplete）。
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '@/components/ui';
import { useFeynmanStore } from '../store/useFeynmanStore';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';

export function useFeynmanSession() {
  const { sessionId } = useParams<{ sessionId: string }>();

  // P1-5 细粒度订阅：整 store 订阅会在任意笔记/薄弱点变化时重渲染会话页
  const currentNoteId = useFeynmanStore((s) => s.currentNoteId);
  const isLoading = useFeynmanStore((s) => s.isLoading);
  // 动作（稳定引用）
  const loadNote = useFeynmanStore((s) => s.loadNote);
  const setExplanation = useFeynmanStore((s) => s.setExplanation);
  const updateNote = useFeynmanStore((s) => s.updateNote);
  const addWeakPoint = useFeynmanStore((s) => s.addWeakPoint);
  const removeWeakPoint = useFeynmanStore((s) => s.removeWeakPoint);
  const toggleWeakPointMastered = useFeynmanStore((s) => s.toggleWeakPointMastered);
  const setSimplifiedSummary = useFeynmanStore((s) => s.setSimplifiedSummary);
  const advanceStep = useFeynmanStore((s) => s.advanceStep);
  const setSelfRating = useFeynmanStore((s) => s.setSelfRating);
  const completeNote = useFeynmanStore((s) => s.completeNote);
  const convertWeakPointsToFlashcards = useFeynmanStore((s) => s.convertWeakPointsToFlashcards);
  const getCurrentView = useFeynmanStore((s) => s.getCurrentView);

  const { toast } = useToast();

  // 本地草稿与 UI 状态
  const [localExplanation, setLocalExplanation] = useState('');
  const [localSummary, setLocalSummary] = useState('');
  const [weakPanelOpen, setWeakPanelOpen] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{ text: string; start: number; end: number } | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  // 闪卡转化状态
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [pendingCompleteAfterConvert, setPendingCompleteAfterConvert] = useState(false);
  const flashcardDecks = useFlashcardStore((s) => s.decks);
  const loadDecks = useFlashcardStore((s) => s.loadDecks);

  const explanationRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef<number>(1);
  const noteId = sessionId && sessionId !== 'new' ? sessionId : null;

  // 挂载时加载笔记
  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    }
  }, [noteId, loadNote]);

  // 派生当前视图
  const view = noteId && currentNoteId === noteId ? getCurrentView() : null;
  const note = view?.note ?? null;
  const summary = view?.summary ?? null;
  const noteWeakPoints = view?.weakPoints ?? [];

  // 笔记/总结加载后同步本地草稿
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

  // 步骤方向（用于方向感知过渡动画）
  const stepDirection = currentStep > prevStepRef.current ? 1 : currentStep < prevStepRef.current ? -1 : 0;
  useEffect(() => {
    prevStepRef.current = currentStep;
  }, [currentStep]);

  // ── 步骤 handlers ──

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
    const unmastered = noteWeakPoints.filter((wp) => !wp.mastered);
    if (unmastered.length > 0) {
      setShowConvertConfirm(true);
      return;
    }
    await completeNote(noteId);
  }, [noteId, localSummary, summary, setSimplifiedSummary, completeNote, noteWeakPoints]);

  const handleRating = useCallback(async (r: number) => {
    if (!noteId) return;
    setRating(r);
    await setSelfRating(noteId, r);
  }, [noteId, setSelfRating]);

  // ── 闪卡转化 handlers ──

  const handleConvertAndComplete = useCallback(async (convert: boolean) => {
    if (!noteId) return;
    setShowConvertConfirm(false);
    if (convert) {
      setPendingCompleteAfterConvert(true);
      await loadDecks();
      setSelectedDeckId(null);
      setShowDeckModal(true);
    } else {
      await completeNote(noteId);
    }
  }, [noteId, loadDecks, completeNote]);

  const handleOpenDeckModal = useCallback(async () => {
    setPendingCompleteAfterConvert(false);
    await loadDecks();
    setSelectedDeckId(null);
    setShowDeckModal(true);
  }, [loadDecks]);

  const handleConvertToFlashcards = useCallback(async () => {
    if (!noteId || !selectedDeckId) return;
    setIsConverting(true);
    try {
      const unmasteredIds = noteWeakPoints.filter((wp) => !wp.mastered).map((wp) => wp.id!);
      const idsToConvert = unmasteredIds.length > 0 ? unmasteredIds : noteWeakPoints.map((wp) => wp.id!);
      await convertWeakPointsToFlashcards(noteId, idsToConvert, selectedDeckId);
      toast({ type: 'success', message: `已将 ${idsToConvert.length} 个薄弱点转为闪卡` });
      setShowDeckModal(false);
      if (pendingCompleteAfterConvert) {
        setPendingCompleteAfterConvert(false);
        await completeNote(noteId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ type: 'error', message: `转化失败: ${msg}` });
    } finally {
      setIsConverting(false);
    }
  }, [noteId, selectedDeckId, noteWeakPoints, convertWeakPointsToFlashcards, toast, completeNote, pendingCompleteAfterConvert]);

  // ── 薄弱点选中标记 handlers ──

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

  return {
    noteId, isLoading, note, summary, noteWeakPoints,
    currentStep, completedSteps, stepDirection, isCompleted,
    localExplanation, setLocalExplanation,
    localSummary, setLocalSummary,
    weakPanelOpen, setWeakPanelOpen,
    selectionPopup, setSelectionPopup,
    rating, setRating, hoverRating, setHoverRating,
    showDeckModal, setShowDeckModal, selectedDeckId, setSelectedDeckId,
    isConverting, showConvertConfirm, setShowConvertConfirm,
    flashcardDecks, explanationRef,
    handleStep2Blur, handleSummaryBlur, handleNext, handlePrev, handleComplete,
    handleRating, handleConvertAndComplete, handleOpenDeckModal,
    handleConvertToFlashcards, handleTextSelect, handleAddWeakPoint,
    removeWeakPoint, toggleWeakPointMastered,
  };
}
