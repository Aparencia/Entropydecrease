/**
 * 费曼学习会话 AI 交互 hook（评估/反问/救援/右键菜单）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出的 AI 逻辑层，与 useFeynmanSession
 * 职责分离。管理 AI 讲解评估、苏格拉底反问（生成+作答评估）、卡壳救援
 * （Ctrl+Shift+H 快捷键 + 停滞计时）及讲解文本右键 AI 操作菜单。
 * @ai-context: 接收 note 作为参数（由 useFeynmanSession 提供）；反问/评估
 * 均要求 concept+explanation 已填写，否则 toast 提示。
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { MessageCircle, Lightbulb, SearchCheck } from 'lucide-react';
import { useToast, type ContextMenuGroup } from '@/components/ui';
import { useContextMenu } from '@/lib/contextMenu';
import { useAIEvaluate, useAIFeynmanQuestion, useAIFeynmanEvaluateAnswers } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { useStuckTimer } from '@/hooks/useStuckTimer';
import type { FeynmanNote } from '@/types/models';

export function useFeynmanAI(note: FeynmanNote | null) {
  const { toast } = useToast();

  // AI 讲解评估
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

  const handleQuestionError = useAIErrorHandler('AI 追问生成失败');
  const handleEvalError = useAIErrorHandler('AI 评估失败');

  // AI 面板状态
  const [showAIEval, setShowAIEval] = useState(false);
  const [showQuestionPanel, setShowQuestionPanel] = useState(false);
  const [localAnswers, setLocalAnswers] = useState<string[]>([]);

  // 卡壳救援
  const [rescueOpen, setRescueOpen] = useState(false);
  const stuckTimer = useStuckTimer({
    onThreshold: () => {
      window.dispatchEvent(new Event('rescue:show-incubation'));
    },
  });

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

  const handleAIEval = useCallback(() => {
    if (!note?.concept || !note?.explanation) {
      toast({ type: 'warning', message: '请先完成讲解内容' });
      return;
    }
    setShowAIEval(true);
    aiEvaluate(note.concept, note.explanation).catch(handleEvalError);
  }, [note, toast, aiEvaluate, handleEvalError]);

  const handleGenerateQuestions = useCallback(() => {
    if (!note?.concept || !note?.explanation) {
      toast({ type: 'warning', message: '请先完成讲解内容' });
      return;
    }
    setShowQuestionPanel(true);
    setLocalAnswers([]);
    generateQuestions(note.concept, note.explanation).catch(handleQuestionError);
  }, [note, toast, generateQuestions, handleQuestionError]);

  const handleSubmitAnswers = useCallback(async () => {
    if (!note?.concept || !aiQuestionData) return;
    const questions = aiQuestionData.questions.map(q => q.question);
    const answers = aiQuestionData.questions.map((_, i) => localAnswers[i] || '');
    if (answers.every(a => !a.trim())) {
      toast({ type: 'warning', message: '请至少回答一个追问' });
      return;
    }
    await aiEvaluateAnswers(note.concept, questions, answers).catch(handleEvalError);
  }, [note, aiQuestionData, localAnswers, toast, aiEvaluateAnswers, handleEvalError]);

  // ── 右键 AI 操作菜单 ──

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

  const handleMenuSelect = useCallback((itemKey: string, _text: string) => {
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

  /** 从 textarea 或 window selection 提取选中文本，无选中则回退整体内容 */
  const getContextMenuText = useCallback((fallback: string): string => {
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
  }, []);

  const handleNoteContextMenu = useCallback(
    (e: React.MouseEvent, fallback: string) => {
      const text = getContextMenuText(fallback);
      if (!text) return;
      handleContextMenu(e, text);
    },
    [getContextMenuText, handleContextMenu],
  );

  return {
    rescueOpen, setRescueOpen, stuckTimer,
    showAIEval, setShowAIEval,
    aiEvalLoading, aiEvalData, aiEvalError, aiEvalNeedsConfig, handleAIEval,
    showQuestionPanel, setShowQuestionPanel,
    localAnswers, setLocalAnswers,
    aiQuestionLoading, aiQuestionData, aiQuestionError, aiQuestionNeedsConfig,
    handleGenerateQuestions,
    aiAnswerEvalLoading, aiAnswerEvalData, aiAnswerEvalError, aiAnswerEvalNeedsConfig,
    handleSubmitAnswers,
    menuOpen, menuPosition, menuContext, closeMenu,
    aiMenuGroups, handleMenuSelect, handleNoteContextMenu,
  };
}
