import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Highlighter, X,
  Star, Trash2, CheckCircle2, Circle, Sparkles,
  MessageCircle, Lightbulb, SearchCheck, HelpCircle,
  Layers,
} from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { Button, Skeleton, EmptyState, useToast, ContextMenu, Modal } from '@/components/ui';
import { AIButton } from '@/components/ui/AIButton';
import type { ContextMenuGroup } from '@/components/ui';
import { useContextMenu } from '@/lib/contextMenu';
import { StepIndicator } from '../components/StepIndicator';
import { useFeynmanStore } from '../store/useFeynmanStore';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { useShallow } from 'zustand/react/shallow';
import type { FeynmanWeakPoint } from '@/types/models';
import { cn } from '@/lib/utils';
import { useAIEvaluate, useAIFeynmanQuestion, useAIFeynmanEvaluateAnswers } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { RescuePanel } from '@/components/RescuePanel';
import { useStuckTimer } from '@/hooks/useStuckTimer';

export default function FeynmanSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const {
    notes: _notes, summaries: _summaries, weakPoints: _weakPoints, currentNoteId, isLoading,
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
    convertWeakPointsToFlashcards,
    getCurrentView,
  } = useFeynmanStore(useShallow(s => s));

  // Local state
  const [localExplanation, setLocalExplanation] = useState('');
  const [localSummary, setLocalSummary] = useState('');
  const [weakPanelOpen, setWeakPanelOpen] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{ text: string; start: number; end: number } | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [showAIEval, setShowAIEval] = useState(false);
  const [localAnswers, setLocalAnswers] = useState<string[]>([]);
  const [showQuestionPanel, setShowQuestionPanel] = useState(false);

  // 闪卡转化状态
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const flashcardDecks = useFlashcardStore((s) => s.decks);
  const loadDecks = useFlashcardStore((s) => s.loadDecks);

  // 完成笔记前确认弹窗
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  // 是否在完成流程中（转化后自动完成笔记）
  const [pendingCompleteAfterConvert, setPendingCompleteAfterConvert] = useState(false);

  // === 卡壳救援 ===
  const [rescueOpen, setRescueOpen] = useState(false);
  const stuckTimer = useStuckTimer({
    onThreshold: () => {
      window.dispatchEvent(new Event('rescue:show-incubation'));
    },
  });

  // AI Evaluate
  const {
    loading: aiEvalLoading,
    data: aiEvalData,
    error: aiEvalError,
    needsConfig: aiEvalNeedsConfig,
    evaluate: aiEvaluate,
  } = useAIEvaluate();

  // AI 反问
  const {
    loading: aiQuestionLoading,
    data: aiQuestionData,
    error: aiQuestionError,
    needsConfig: aiQuestionNeedsConfig,
    generateQuestions,
  } = useAIFeynmanQuestion();

  // AI 回答评估
  const {
    loading: aiAnswerEvalLoading,
    data: aiAnswerEvalData,
    error: aiAnswerEvalError,
    needsConfig: aiAnswerEvalNeedsConfig,
    evaluateAnswers: aiEvaluateAnswers,
  } = useAIFeynmanEvaluateAnswers();

  const prefersReduced = useReducedMotion();

  const { toast } = useToast();
  const handleQuestionError = useAIErrorHandler('AI 追问生成失败');
  const handleEvalError = useAIErrorHandler('AI 评估失败');

  const explanationRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef<number>(1);
  const noteId = sessionId && sessionId !== 'new' ? sessionId : null;

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

  // Derive current view from store
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

  // Track direction for directional transitions
  const stepDirection = currentStep > prevStepRef.current ? 1 : currentStep < prevStepRef.current ? -1 : 0;
  useEffect(() => {
    prevStepRef.current = currentStep;
  }, [currentStep]);

  // Step transition variants (direction-aware)
  const stepVariants = {
    enter: (dir: number) => prefersReduced
      ? { opacity: 0 }
      : { opacity: 0, x: dir > 0 ? 40 : -40, scale: 0.97 },
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir: number) => prefersReduced
      ? { opacity: 0 }
      : { opacity: 0, x: dir > 0 ? -40 : 40, scale: 0.97 },
  };

  // Stagger container for step children
  const staggerContainer = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };
  const staggerItem = {
    hidden: prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
  };

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
    // Save current content before advancing
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
    // 检查是否有未掌握的薄弱点
    const unmastered = noteWeakPoints.filter((wp) => !wp.mastered);
    if (unmastered.length > 0) {
      setShowConvertConfirm(true);
      return;
    }
    await completeNote(noteId);
  }, [noteId, localSummary, summary, setSimplifiedSummary, completeNote, noteWeakPoints]);

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
      // 如果是从完成确认弹窗跳转过来的，自动完成学习
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

  const handleRating = useCallback(async (r: number) => {
    if (!noteId) return;
    setRating(r);
    await setSelfRating(noteId, r);
  }, [noteId, setSelfRating]);

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
      // 尝试从 textarea 获取
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLTextAreaElement) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== end) {
          return activeEl.value.slice(start, end).trim();
        }
        return activeEl.value.trim() || fallback;
      }
      // 尝试从 window selection 获取（step 3 div）
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

  // ── Step 3: Text selection for weak points ──

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

  // ── Loading / Empty states ──

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50">
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="text" width={200} />
        </div>
        <div className="px-kb-md py-kb-md">
          <Skeleton variant="rectangular" height={60} />
        </div>
        <div className="flex-1 px-kb-md">
          <Skeleton variant="text" lines={6} />
        </div>
      </div>
    );
  }

  if (!note && noteId) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <EmptyState
          title="会话未找到"
          description="该学习会话可能已被删除"
          action={
            <Button size="sm" onClick={() => navigate('/feynman')}>
              返回列表
            </Button>
          }
        />
      </div>
    );
  }

  const isCompleted = note?.status === 'completed';

  // ── Render highlighted explanation text with weak points ──
  const renderExplanationWithHighlights = () => {
    const text = note?.explanation ?? '';
    if (!text) return <span className="text-text-tertiary italic">（请先在步骤 2 中写下你的讲解内容）</span>;

    if (noteWeakPoints.length === 0) return <>{text}</>;

    // Build segments
    const sortedWp = [...noteWeakPoints].sort((a, b) => a.position.start - b.position.start);
    const segments: { text: string; wp?: FeynmanWeakPoint }[] = [];
    let cursor = 0;

    for (const wp of sortedWp) {
      if (wp.position.start > cursor) {
        segments.push({ text: text.slice(cursor, wp.position.start) });
      }
      const end = Math.min(wp.position.end, text.length);
      segments.push({ text: text.slice(wp.position.start, end), wp });
      cursor = end;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor) });
    }

    return (
      <>
        {segments.map((seg, i) =>
          seg.wp ? (
            <mark
              key={i}
              className={cn(
                'rounded-kb-sm px-0.5 cursor-pointer',
                seg.wp.mastered
                  ? 'bg-semantic-success/20 text-semantic-success'
                  : 'bg-[#F59E0B]/20 text-[#B45309] dark:text-[#F59E0B]',
              )}
              title={seg.wp.mastered ? '已掌握' : '薄弱点'}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </>
    );
  };

  return (
    <motion.div
      className="flex flex-col h-full relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* ── 环境光 ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* 环境光 - 暖色 */}
        <motion.div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #F59E0B 0%, transparent 70%)' }}
          animate={prefersReduced ? {} : { scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* 环境光 - 冷色互补 */}
        {!prefersReduced && (
          <motion.div
            className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #5B8A72 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.08, 0.15, 0.08] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
        )}
      </div>
      {/* 顶栏 */}
      <motion.div
        className="flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50 flex-shrink-0 relative z-10"
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <button
          onClick={() => navigate('/feynman')}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
        </button>
        <h1 className="text-b1 font-semibold text-text-primary flex-1 truncate">
          {note?.concept || '浮出水面'}
        </h1>
        {note?.explanation && (
          <button
            onClick={() => {
              setRescueOpen(true);
              stuckTimer.start();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium',
              'bg-bg-secondary text-text-secondary border border-border/50',
              'hover:bg-bg-tertiary hover:text-text-primary',
              'active:scale-95 transition-all duration-kb-fast',
            )}
            title="卡壳了 (Ctrl+Shift+H)"
          >
            <HelpCircle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
            卡壳了
          </button>
        )}
        {note?.explanation && (
          <AIButton
            size="sm"
            loading={aiEvalLoading}
            disabled={aiEvalLoading}
            tooltip="请先完成讲解内容"
            onClick={() => {
              if (!note?.concept || !note?.explanation) {
                toast({ type: 'warning', message: '请先完成讲解内容' });
                return;
              }
              setShowAIEval(true);
              aiEvaluate(note.concept, note.explanation)
                .catch(handleEvalError);
            }}
            title={aiEvalLoading ? 'AI 评估中…' : 'AI 评估讲解质量'}
          >
            AI 评估
          </AIButton>
        )}
        {isCompleted && (
          <span className="text-c1 font-medium text-semantic-success flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
            已完成
          </span>
        )}
      </motion.div>

      {/* StepIndicator */}
      <motion.div
        className="px-kb-md py-kb-md flex-shrink-0 relative z-10"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />
      </motion.div>

      {/* 主体区域 */}
      <div className="flex-1 overflow-hidden flex relative z-10">
        {/* 专注遮罩 - 聚焦中心内容区 */}
        <motion.div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, transparent 50%, rgba(0,0,0,0.15) 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: prefersReduced ? 0 : 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        {/* 主内容 */}
        <div className="flex-1 overflow-y-auto px-kb-md pb-kb-md">
          <AnimatePresence mode="wait" custom={stepDirection}>
          <motion.div
            key={currentStep}
            custom={stepDirection}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
            className="max-w-2xl mx-auto"
          >

            {/* 步骤 1: 选择概念 */}
            {currentStep === 1 && (
              <motion.div
                className="flex flex-col gap-kb-md py-kb-md"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                <motion.div variants={staggerItem}>
                  <h2 className="text-h2 font-semibold text-text-primary">选择要学习的概念</h2>
                  <p className="text-b2 text-text-tertiary mt-1">
                    输入一个你想要深入理解的概念名称，这将成为本次浮出水面学习的主题。
                  </p>
                </motion.div>
                <motion.div variants={staggerItem}>
                  <label className="text-b2 font-medium text-text-primary mb-kb-xs block">概念名称</label>
                  <div className={cn(
                    'px-3 py-2.5 rounded-kb-md',
                    'bg-bg-secondary border border-border/70',
                    'text-b1 text-text-primary',
                  )}>
                    {note?.concept || '—'}
                  </div>
                </motion.div>
                <motion.div variants={staggerItem}>
                  <label className="text-b2 font-medium text-text-primary mb-kb-xs block">初始讲解</label>
                  <div className={cn(
                    'relative min-h-[200px] flex flex-col',
                    'border border-border/50 rounded-kb-lg overflow-hidden',
                    'bg-bg-elevated',
                  )}>
                    <textarea
                      value={localExplanation}
                      onChange={(e) => setLocalExplanation(e.target.value)}
                      placeholder="在这里写下你对这个概念的初步理解..."
                      className={cn(
                        'flex-1 p-kb-md bg-transparent outline-none resize-none',
                        'text-b1 text-text-primary placeholder:text-text-tertiary/60',
                        'min-h-[180px]',
                      )}
                    />
                  </div>
                </motion.div>
                <motion.div variants={staggerItem} className={cn(
                  'p-kb-md rounded-kb-lg',
                  'bg-feynman/5 border border-feynman/20',
                  'text-b2 text-text-secondary leading-relaxed',
                )}>
                  <p className="font-medium text-feynman mb-1">浮出水面小贴士</p>
                  <p className="text-text-tertiary">
                    选择一个你正在学习但尚未完全掌握的概念。用简单的语言向"一个完全不懂的人"解释它，
                    是检验真正理解的最佳方式。
                  </p>
                </motion.div>
              </motion.div>
            )}

            {/* 步骤 2: 讲解概念 */}
            {currentStep === 2 && (
              <motion.div
                className="flex flex-col gap-kb-md py-kb-md"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                <motion.div variants={staggerItem}>
                  <h2 className="text-h2 font-semibold text-text-primary">讲解「{note?.concept || '...'}」</h2>
                  <p className="text-b2 text-text-tertiary mt-1">
                    用最简洁的语言，像教给一个完全不懂的人那样，解释这个概念的核心内容。
                  </p>
                </motion.div>
                <motion.div variants={staggerItem} className={cn(
                  'relative min-h-[300px] flex flex-col',
                  'border border-border/50 rounded-kb-lg overflow-hidden',
                  'bg-bg-elevated',
                )}>
                  <textarea
                    value={localExplanation}
                    onChange={(e) => setLocalExplanation(e.target.value)}
                    onBlur={handleStep2Blur}
                    onContextMenu={(e) => handleNoteContextMenu(e, localExplanation)}
                    placeholder="在这里写下你的讲解... 尽量用通俗易懂的语言，避免直接引用教科书定义。"
                    className={cn(
                      'flex-1 p-kb-md bg-transparent outline-none resize-none',
                      'text-b1 text-text-primary placeholder:text-text-tertiary/60',
                      'min-h-[280px]',
                    )}
                  />
                  <div className={cn(
                    'px-kb-md py-2 border-t border-border/40',
                    'flex items-center justify-between text-c1 text-text-tertiary',
                  )}>
                    <span>失焦自动保存</span>
                    <span>{localExplanation.length} 字</span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* 步骤 3: 标注薄弱 */}
            {currentStep === 3 && (
              <motion.div
                className="flex flex-col gap-kb-md py-kb-md"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                <motion.div variants={staggerItem} className="flex items-center justify-between">
                  <div>
                    <h2 className="text-h2 font-semibold text-text-primary">标注薄弱环节</h2>
                    <p className="text-b2 text-text-tertiary mt-1">
                      回顾你的讲解，选中说不清楚的文本来标记为薄弱点。
                    </p>
                  </div>
                  <button
                    onClick={() => setWeakPanelOpen(!weakPanelOpen)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2',
                      'border transition-all duration-kb-fast',
                      weakPanelOpen
                        ? 'border-[#F59E0B]/40 bg-[#F59E0B]/5 text-[#F59E0B]'
                        : 'border-border/50 text-text-secondary hover:bg-bg-tertiary',
                    )}
                  >
                    <Highlighter className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
                    薄弱点 ({noteWeakPoints.length})
                  </button>
                </motion.div>

                {/* 讲解文本展示（可选中） */}
                <motion.div variants={staggerItem}
                  ref={explanationRef}
                  onMouseUp={handleTextSelect}
                  onKeyUp={handleTextSelect}
                  onContextMenu={(e) => handleNoteContextMenu(e, note?.explanation ?? '')}
                  className={cn(
                    'min-h-[200px] p-kb-md select-text',
                    'border border-border/50 rounded-kb-lg',
                    'bg-bg-elevated',
                    'text-b2 text-text-secondary leading-relaxed',
                    'whitespace-pre-wrap',
                  )}
                >
                  {renderExplanationWithHighlights()}
                </motion.div>

                {/* 选中文本弹窗 */}
                {selectionPopup && (
                  <div className={cn(
                    'flex items-center gap-2 p-kb-sm rounded-kb-md',
                    'bg-[#F59E0B]/10 border border-[#F59E0B]/30',
                  )}>
                    <span className="text-b2 text-text-secondary flex-1 truncate">
                      选中: "{selectionPopup.text.slice(0, 40)}{selectionPopup.text.length > 40 ? '...' : ''}"
                    </span>
                    <Button size="sm" onClick={handleAddWeakPoint}>
                      <Highlighter className="w-icon-sm h-icon-sm mr-1" strokeWidth={1.5} />
                      标记为薄弱点
                    </Button>
                    <button
                      onClick={() => setSelectionPopup(null)}
                      className="p-1 text-text-tertiary hover:text-text-primary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* 步骤 4: 简化重述 */}
            {currentStep === 4 && (
              <motion.div
                className="flex flex-col gap-kb-md py-kb-md"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                <motion.div variants={staggerItem}>
                  <h2 className="text-h2 font-semibold text-text-primary">简化重述</h2>
                  <p className="text-b2 text-text-tertiary mt-1">
                    用更简洁、更通俗的语言，重新讲解这个概念——这次要确保任何人都能听懂。
                  </p>
                </motion.div>
                <motion.div variants={staggerItem} className={cn(
                  'relative min-h-[200px] flex flex-col',
                  'border border-border/50 rounded-kb-lg overflow-hidden',
                  'bg-bg-elevated',
                )}>
                  <textarea
                    value={localSummary}
                    onChange={(e) => setLocalSummary(e.target.value)}
                    onBlur={handleSummaryBlur}
                    onContextMenu={(e) => handleNoteContextMenu(e, localSummary)}
                    placeholder="用最简单的话重新解释这个概念，就像在和一个朋友聊天..."
                    className={cn(
                      'flex-1 p-kb-md bg-transparent outline-none resize-none',
                      'text-b1 text-text-primary placeholder:text-text-tertiary/60',
                      'min-h-[180px]',
                    )}
                  />
                  <div className={cn(
                    'px-kb-md py-2 border-t border-border/40',
                    'flex items-center justify-between text-c1 text-text-tertiary',
                  )}>
                    <span>失焦自动保存</span>
                    <span>{localSummary.length} 字</span>
                  </div>
                </motion.div>

                {/* 完成后的自评 */}
                {isCompleted && (
                  <div className={cn(
                    'p-kb-md rounded-kb-lg',
                    'bg-bg-secondary border border-border/40',
                    'flex flex-col items-center gap-2',
                  )}>
                    <p className="text-b2 font-medium text-text-primary">理解深度自评</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => handleRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="p-0.5 transition-all duration-kb-fast"
                        >
                          <Star
                            className={cn(
                              'w-6 h-6 transition-all duration-kb-fast',
                              (hoverRating || rating) >= star
                                ? 'text-[#F59E0B] fill-[#F59E0B]'
                                : 'text-text-tertiary/40',
                            )}
                            strokeWidth={1.5}
                          />
                        </button>
                      ))}
                    </div>
                    {rating > 0 && (
                      <p className="text-c1 text-text-tertiary">
                        {rating <= 2 ? '还需继续学习' : rating <= 4 ? '掌握得不错' : '完全理解了！'}
                      </p>
                    )}
                  </div>
                )}

                {/* AI 评估结果 */}
                {showAIEval && (
                  <div className={cn(
                    'p-kb-md rounded-kb-lg',
                    'bg-brand-600/5 border border-brand-500/20',
                  )}>
                    <div className="flex items-center justify-between mb-kb-md">
                      <h3 className="text-b1 font-semibold text-text-primary flex items-center gap-2">
                        <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
                        AI 评估结果
                      </h3>
                      <button
                        onClick={() => setShowAIEval(false)}
                        className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
                      >
                        <X className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </div>

                    {aiEvalLoading && (
                      <div className="flex items-center gap-2 text-b2 text-text-secondary py-4">
                        <AIThinkingIndicator size={4} gap={3} />
                        正在评估你的讲解…
                      </div>
                    )}

                    {aiEvalError && !aiEvalLoading && (
                      <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                        {aiEvalError}
                        {aiEvalNeedsConfig && (
                          <button
                            onClick={() => navigate('/settings')}
                            className="mt-2 block text-b3 underline hover:no-underline"
                          >
                            前往设置页配置 API Key
                          </button>
                        )}
                      </div>
                    )}

                    {aiEvalData && !aiEvalLoading && (
                      <div className="flex flex-col gap-kb-md kb-ai-result-enter">
                        {/* Overall score */}
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-16 h-16 rounded-kb-full flex items-center justify-center flex-shrink-0',
                            'bg-brand-600/10 text-brand-600 text-h2 font-bold',
                          )}>
                            {aiEvalData.overallScore}
                          </div>
                          <div>
                            <p className="text-b1 font-semibold text-text-primary">综合评分</p>
                            <p className="text-b2 text-text-tertiary">
                              {aiEvalData.overallScore >= 80 ? '讲得非常出色！' : aiEvalData.overallScore >= 60 ? '掌握较好，还有提升空间' : '建议继续深化理解'}
                            </p>
                          </div>
                        </div>

                        {/* Dimensions */}
                        {aiEvalData.dimensions.length > 0 && (
                          <div>
                            <p className="text-b3 font-medium text-text-tertiary uppercase tracking-wide mb-2">维度评分</p>
                            <div className="flex flex-col gap-2">
                              {aiEvalData.dimensions.map((dim, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-b2 text-text-secondary w-20 flex-shrink-0">{dim.name}</span>
                                  <div className="flex-1 h-2 bg-bg-tertiary rounded-kb-full overflow-hidden">
                                    <div
                                      className="h-full bg-brand-500 rounded-kb-full transition-all duration-500"
                                      style={{ width: `${dim.score}%` }}
                                    />
                                  </div>
                                  <span className="text-b3 text-text-tertiary w-8 text-right">{dim.score}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Strengths */}
                        {aiEvalData.strengths.length > 0 && (
                          <div>
                            <p className="text-b3 font-medium text-semantic-success uppercase tracking-wide mb-1">优势</p>
                            <ul className="flex flex-col gap-1">
                              {aiEvalData.strengths.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-semantic-success flex-shrink-0" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Weaknesses */}
                        {aiEvalData.weaknesses.length > 0 && (
                          <div>
                            <p className="text-b3 font-medium text-semantic-error uppercase tracking-wide mb-1">待改进</p>
                            <ul className="flex flex-col gap-1">
                              {aiEvalData.weaknesses.map((w, i) => (
                                <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                                  <Circle className="w-3.5 h-3.5 mt-0.5 text-rose-400 flex-shrink-0" />
                                  {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Suggestions */}
                        {aiEvalData.suggestions.length > 0 && (
                          <div>
                            <p className="text-b3 font-medium text-text-tertiary uppercase tracking-wide mb-1">建议</p>
                            <ul className="flex flex-col gap-1">
                              {aiEvalData.suggestions.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                                  <span className="mt-1 w-1.5 h-1.5 rounded-kb-full bg-brand-500 flex-shrink-0" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* AI 反问区域 */}
                {isCompleted && (
                  <div className={cn(
                    'p-kb-md rounded-kb-lg',
                    'bg-feynman/5 border border-feynman/20',
                  )}>
                    <div className="flex items-center justify-between mb-kb-md">
                      <h3 className="text-b1 font-semibold text-text-primary flex items-center gap-2">
                        <MessageCircle className="w-icon-sm h-icon-sm text-feynman" strokeWidth={1.5} />
                        AI 反问
                      </h3>
                      {showQuestionPanel && (
                        <button
                          onClick={() => setShowQuestionPanel(false)}
                          className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
                        >
                          <X className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>

                    {!showQuestionPanel && (
                      <button
                        onClick={() => {
                          if (!note?.concept || !note?.explanation) {
                            toast({ type: 'warning', message: '请先完成讲解内容' });
                            return;
                          }
                          setShowQuestionPanel(true);
                          setLocalAnswers([]);
                          generateQuestions(note.concept, note.explanation)
                            .catch(handleQuestionError);
                        }}
                        disabled={aiQuestionLoading}
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-kb-md text-b2 font-medium',
                          'bg-feynman text-text-inverse',
                          'hover:bg-feynman/90 active:scale-[0.98] transition-all duration-kb-fast',
                          aiQuestionLoading && 'opacity-60 cursor-not-allowed',
                        )}
                      >
                        {aiQuestionLoading ? (
                          <AIThinkingIndicator size={4} gap={3} />
                        ) : (
                          <MessageCircle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
                        )}
                        让 AI 反问
                      </button>
                    )}

                    {showQuestionPanel && (
                      <div className="flex flex-col gap-kb-md">
                        {/* 加载中 */}
                        {aiQuestionLoading && (
                          <div className="flex items-center gap-2 text-b2 text-text-secondary py-4">
                            <AIThinkingIndicator size={4} gap={3} />
                            AI 正在思考追问...
                          </div>
                        )}

                        {/* 错误 */}
                        {aiQuestionError && !aiQuestionLoading && (
                          <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                            {aiQuestionError}
                            {aiQuestionNeedsConfig && (
                              <button
                                onClick={() => navigate('/settings')}
                                className="mt-2 block text-b3 underline hover:no-underline"
                              >
                                前往设置页配置 API Key
                              </button>
                            )}
                          </div>
                        )}

                        {/* 追问卡片 */}
                        {aiQuestionData && !aiQuestionLoading && (
                          <div className="kb-ai-result-enter flex flex-col gap-kb-sm">
                            <p className="text-b2 text-text-tertiary">
                              以下是 AI 小白的追问，请试着回答：
                            </p>
                            {aiQuestionData.questions.map((q, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'p-kb-md rounded-kb-md',
                                  'bg-bg-elevated border border-border/40',
                                )}
                              >
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-kb-full bg-feynman/10 text-feynman text-c1 font-semibold flex items-center justify-center">
                                    {i + 1}
                                  </span>
                                  <div className="flex-1">
                                    <p className="text-b2 text-text-primary font-medium">{q.question}</p>
                                    {q.focus && (
                                      <p className="text-c1 text-text-tertiary mt-0.5">聚焦：{q.focus}</p>
                                    )}
                                  </div>
                                </div>
                                <textarea
                                  value={localAnswers[i] || ''}
                                  onChange={(e) => {
                                    const newAnswers = [...localAnswers];
                                    newAnswers[i] = e.target.value;
                                    setLocalAnswers(newAnswers);
                                  }}
                                  placeholder="在这里写下你的回答..."
                                  className={cn(
                                    'w-full mt-2 p-2.5 rounded-kb-md',
                                    'bg-bg-secondary border border-border/40',
                                    'text-b2 text-text-primary placeholder:text-text-tertiary/60',
                                    'outline-none resize-none min-h-[80px]',
                                    'focus:border-feynman/50 focus:ring-1 focus:ring-feynman/20 transition-all duration-kb-fast',
                                  )}
                                />
                              </div>
                            ))}

                            {/* 提交回答按钮 */}
                            {aiQuestionData.questions.length > 0 && (
                              <Button
                                variant="ai"
                                size="md"
                                className="w-full"
                                onClick={async () => {
                                  if (!note?.concept) return;
                                  const questions = aiQuestionData.questions.map(q => q.question);
                                  const answers = aiQuestionData.questions.map((_, i) => localAnswers[i] || '');
                                  if (answers.every(a => !a.trim())) {
                                    toast({ type: 'warning', message: '请至少回答一个追问' });
                                    return;
                                  }
                                  await aiEvaluateAnswers(note.concept, questions, answers)
                                    .catch(handleEvalError);
                                }}
                                disabled={aiAnswerEvalLoading || localAnswers.every(a => !a?.trim())}
                                loading={aiAnswerEvalLoading}
                                icon={!aiAnswerEvalLoading ? <Check className="w-4 h-4" strokeWidth={2} /> : undefined}
                              >
                                提交回答，查看理解度评估
                              </Button>
                            )}

                            {/* 评估结果 */}
                            {aiAnswerEvalLoading && (
                              <div className="flex items-center gap-2 text-b2 text-text-secondary py-4">
                                <AIThinkingIndicator size={4} gap={3} />
                                正在评估你的回答...
                              </div>
                            )}

                            {aiAnswerEvalError && !aiAnswerEvalLoading && (
                              <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                                {aiAnswerEvalError}
                                {aiAnswerEvalNeedsConfig && (
                                  <button
                                    onClick={() => navigate('/settings')}
                                    className="mt-2 block text-b3 underline hover:no-underline"
                                  >
                                    前往设置页配置 API Key
                                  </button>
                                )}
                              </div>
                            )}

                            {aiAnswerEvalData && !aiAnswerEvalLoading && (
                              <div className={cn(
                                'p-kb-md rounded-kb-md kb-ai-result-enter',
                                'bg-brand-600/5 border border-brand-500/20',
                              )}>
                                <h4 className="text-b1 font-semibold text-text-primary mb-kb-md flex items-center gap-2">
                                  <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
                                  理解度评估
                                </h4>

                                {/* 分数 */}
                                <div className="flex items-center gap-3 mb-kb-md">
                                  <div className={cn(
                                    'w-14 h-14 rounded-kb-full flex items-center justify-center flex-shrink-0',
                                    'bg-feynman/10 text-feynman text-h2 font-bold',
                                  )}>
                                    {aiAnswerEvalData.understandingScore}
                                  </div>
                                  <div>
                                    <p className="text-b1 font-semibold text-text-primary">理解度评分</p>
                                    <p className="text-b2 text-text-tertiary">
                                      {aiAnswerEvalData.understandingScore >= 8
                                        ? '深入理解，能举一反三！'
                                        : aiAnswerEvalData.understandingScore >= 6
                                          ? '理解较好，还有深化空间'
                                          : '建议继续学习，加深理解'}
                                    </p>
                                  </div>
                                </div>

                                {/* 反馈 */}
                                {aiAnswerEvalData.feedback && (
                                  <p className="text-b2 text-text-secondary mb-kb-md leading-relaxed">
                                    {aiAnswerEvalData.feedback}
                                  </p>
                                )}

                                {/* 强项 */}
                                {aiAnswerEvalData.strongPoints.length > 0 && (
                                  <div className="mb-2">
                                    <p className="text-b3 font-medium text-semantic-success uppercase tracking-wide mb-1">强项</p>
                                    <ul className="flex flex-col gap-1">
                                      {aiAnswerEvalData.strongPoints.map((s, i) => (
                                        <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-semantic-success flex-shrink-0" />
                                          {s}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* 薄弱点 */}
                                {aiAnswerEvalData.weakPoints.length > 0 && (
                                  <div>
                                    <p className="text-b3 font-medium text-semantic-error uppercase tracking-wide mb-1">待加强</p>
                                    <ul className="flex flex-col gap-1">
                                      {aiAnswerEvalData.weakPoints.map((w, i) => (
                                        <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                                          <Circle className="w-3.5 h-3.5 mt-0.5 text-rose-400 flex-shrink-0" />
                                          {w}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
          </AnimatePresence>
        </div>

        {/* 右侧薄弱点面板（步骤 3 抽屉） */}
        {currentStep === 3 && weakPanelOpen && (
          <motion.aside
            className={cn(
              'w-72 flex-shrink-0 border-l border-border/50 bg-bg-secondary/80 backdrop-blur-xl',
              'shadow-[-8px_0_24px_rgba(0,0,0,0.12)]',
              'overflow-y-auto hidden md:block',
            )}
            initial={{ opacity: 0, x: 24, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const }}
          >
            <div className="p-kb-md">
              <div className="flex items-center justify-between mb-kb-md">
                <h3 className="text-b1 font-semibold text-text-primary">薄弱点列表</h3>
                <div className="flex items-center gap-1">
                  {noteWeakPoints.some((wp) => !wp.mastered) && (
                    <button
                      onClick={handleOpenDeckModal}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-kb-md text-c1 font-medium',
                        'bg-[#F59E0B]/10 text-[#B45309] dark:text-[#F59E0B]',
                        'hover:bg-[#F59E0B]/20 transition-all duration-kb-fast',
                      )}
                      title="将未掌握的薄弱点转为闪卡"
                    >
                      <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
                      生成闪卡
                    </button>
                  )}
                  <button
                    onClick={() => setWeakPanelOpen(false)}
                    className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
                  >
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              {noteWeakPoints.length === 0 ? (
                <p className="text-b2 text-text-tertiary text-center py-4">
                  选中讲解文本即可标记薄弱点
                </p>
              ) : (
                <div className="space-y-2.5">
                  {noteWeakPoints.map((wp, i) => (
                    <motion.div
                      key={wp.id}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.25, delay: i * 0.05 }}
                      className={cn(
                        'flex gap-2.5 p-3 rounded-kb-md',
                        'bg-bg-elevated border border-border/40',
                        'group',
                      )}
                    >
                      <button
                        onClick={() => noteId && wp.id && toggleWeakPointMastered(noteId, wp.id)}
                        className="flex-shrink-0 mt-0.5"
                        title={wp.mastered ? '标记为未掌握' : '标记为已掌握'}
                      >
                        {wp.mastered ? (
                          <CheckCircle2 className="w-5 h-5 text-semantic-success" strokeWidth={1.5} />
                        ) : (
                          <Circle className="w-5 h-5 text-text-tertiary" strokeWidth={1.5} />
                        )}
                      </button>
                      <p className={cn(
                        'text-b3 leading-relaxed flex-1',
                        wp.mastered ? 'text-text-tertiary line-through' : 'text-text-secondary',
                      )}>
                        {wp.text}
                      </p>
                      <button
                        onClick={() => noteId && wp.id && removeWeakPoint(noteId, wp.id)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-semantic-error transition-all duration-kb-fast"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </div>

      {/* 底部导航 */}
      <motion.div
        className={cn(
          'flex items-center justify-between gap-kb-sm px-kb-md py-3',
          'border-t border-border/50 bg-bg-elevated/90 backdrop-blur-sm flex-shrink-0 relative z-10',
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeft className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          onClick={handlePrev}
          disabled={currentStep === 1}
        >
          上一步
        </Button>

        {currentStep < 4 ? (
          <Button
            size="sm"
            icon={<ArrowRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            iconRight={<span />}
            onClick={handleNext}
          >
            下一步
          </Button>
        ) : !isCompleted ? (
          <Button
            size="sm"
            icon={<Check className="w-icon-sm h-icon-sm" strokeWidth={2} />}
            onClick={handleComplete}
          >
            完成学习
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/feynman')}
          >
            返回列表
          </Button>
        )}
      </motion.div>

      {/* 右键菜单 */}
      {menuOpen && menuContext && (
        <ContextMenu<string>
          groups={aiMenuGroups}
          position={menuPosition}
          context={menuContext}
          onSelect={handleMenuSelect}
          onClose={closeMenu}
        />
      )}

      {/* 卡壳救援面板 */}
      <RescuePanel
        isOpen={rescueOpen}
        onClose={() => {
          setRescueOpen(false);
          stuckTimer.stop();
        }}
        context={{
          topic: note?.concept || '浮出水面',
          relatedContent: note?.explanation?.slice(0, 500),
          mode: 'feynman',
        }}
        onSuggestion={(action) => {
          if (action === 'pomodoro') navigate('/pomodoro');
          else if (action === 'flashcard') navigate('/flashcards');
        }}
      />

      {/* 牌组选择弹窗 */}
      <Modal
        open={showDeckModal}
        onClose={() => setShowDeckModal(false)}
        title="选择目标牌组"
        description="将薄弱点转为闪卡，放入以下牌组中进行间隔复习"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowDeckModal(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={!selectedDeckId || isConverting}
              loading={isConverting}
              onClick={handleConvertToFlashcards}
            >
              确认生成
            </Button>
          </div>
        }
      >
        {flashcardDecks.length === 0 ? (
          <p className="text-b2 text-text-tertiary text-center py-4">
            还没有牌组，请先在闪卡模块创建牌组
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {flashcardDecks.map((deck) => (
              <button
                key={deck.id}
                onClick={() => setSelectedDeckId(deck.id)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-kb-md text-left',
                  'border transition-all duration-kb-fast',
                  selectedDeckId === deck.id
                    ? 'border-[#F59E0B] bg-[#F59E0B]/5'
                    : 'border-border/50 hover:bg-bg-tertiary',
                )}
              >
                <div
                  className="w-3 h-3 rounded-kb-full flex-shrink-0"
                  style={{ backgroundColor: deck.color || '#6B7280' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-b2 font-medium text-text-primary truncate">{deck.name}</p>
                  {deck.description && (
                    <p className="text-c1 text-text-tertiary truncate">{deck.description}</p>
                  )}
                </div>
                {selectedDeckId === deck.id && (
                  <CheckCircle2 className="w-4 h-4 text-[#F59E0B] flex-shrink-0" strokeWidth={2} />
                )}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* 完成笔记前：询问是否转化薄弱点 */}
      <Modal
        open={showConvertConfirm}
        onClose={() => setShowConvertConfirm(false)}
        title="完成学习"
        description={`你还有 ${noteWeakPoints.filter((wp) => !wp.mastered).length} 个薄弱点未掌握，是否要将它们转为闪卡进行间隔复习？`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleConvertAndComplete(false)}
            >
              直接完成
            </Button>
            <Button
              size="sm"
              onClick={() => handleConvertAndComplete(true)}
            >
              转为闪卡后完成
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          {noteWeakPoints
            .filter((wp) => !wp.mastered)
            .map((wp) => (
              <div key={wp.id} className="flex items-start gap-2 p-2 rounded-kb-sm bg-bg-secondary">
                <Circle className="w-3.5 h-3.5 mt-0.5 text-[#F59E0B] flex-shrink-0" strokeWidth={1.5} />
                <p className="text-b3 text-text-secondary leading-relaxed">{wp.text}</p>
              </div>
            ))}
        </div>
      </Modal>

      {/* 动画样式 */}
      <style>{`
        /* CSS animations kept for non-motion elements */
      `}</style>
    </motion.div>
  );
}
