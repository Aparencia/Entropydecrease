/**
 * 费曼学习会话 AI 交互 hook（评估/反问/救援/右键菜单）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出的 AI 逻辑层，与 useFeynmanSession
 * 职责分离。管理 AI 讲解评估、苏格拉底反问（生成+作答评估）、卡壳救援
 * （Ctrl+Shift+H 快捷键 + 停滞计时）及讲解文本右键 AI 操作菜单。
 * @ai-context: 接收 note 作为参数（由 useFeynmanSession 提供）；反问/评估
 * 均要求 concept+explanation 已填写，否则 toast 提示。
 * @ai-context: v0.30 — AI 结果持久化：评估/追问/回答评估成功后写入
 * feynmanAIResults 表，重新进入会话时自动恢复；“重置 AI 反馈”删除记录。
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { MessageCircle, Lightbulb, SearchCheck } from 'lucide-react';
import { useToast, type ContextMenuGroup } from '@/components/ui';
import { useContextMenu } from '@/lib/contextMenu';
import { useAIEvaluate, useAIFeynmanQuestion, useAIFeynmanEvaluateAnswers } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { useStuckTimer } from '@/hooks/useStuckTimer';
import { feynmanAIResultStore } from '@/lib/storage';
import { createWithLog, updateWithLog } from '@/lib/storage/writeWithLog';
import type { FeynmanNote, FeynmanAIResult } from '@/types/models';

export function useFeynmanAI(note: FeynmanNote | null) {
  const { toast } = useToast();

  // AI 讲解评估
  const {
    loading: aiEvalLoading,
    data: aiEvalData,
    error: aiEvalError,
    needsConfig: aiEvalNeedsConfig,
    evaluate: aiEvaluate,
    clear: clearEval,
  } = useAIEvaluate();

  // AI 反问
  const {
    loading: aiQuestionLoading,
    data: aiQuestionData,
    error: aiQuestionError,
    needsConfig: aiQuestionNeedsConfig,
    generateQuestions,
    clear: clearQuestion,
  } = useAIFeynmanQuestion();

  // AI 回答评估
  const {
    loading: aiAnswerEvalLoading,
    data: aiAnswerEvalData,
    error: aiAnswerEvalError,
    needsConfig: aiAnswerEvalNeedsConfig,
    evaluateAnswers: aiEvaluateAnswers,
    clear: clearAnswerEval,
  } = useAIFeynmanEvaluateAnswers();

  const handleQuestionError = useAIErrorHandler('AI 追问生成失败');
  const handleEvalError = useAIErrorHandler('AI 评估失败');

  // AI 面板状态
  const [showAIEval, setShowAIEval] = useState(false);
  const [showQuestionPanel, setShowQuestionPanel] = useState(false);
  const [localAnswers, setLocalAnswers] = useState<string[]>([]);

  // ── v0.30: AI 结果持久化 ────────────────────────────────
  const [persisted, setPersisted] = useState<FeynmanAIResult | null>(null);

  /** 会话加载时恢复持久化的 AI 结果 */
  useEffect(() => {
    if (!note?.id) { setPersisted(null); return; }
    let cancelled = false;
    feynmanAIResultStore.where('noteId', note.id).then((records) => {
      if (cancelled) return;
      const record = records[0] ?? null;
      setPersisted(record);
      if (record) {
        if (record.evalResult) setShowAIEval(true);
        if (record.questionData) setShowQuestionPanel(true);
        if (record.answers?.length) setLocalAnswers(record.answers);
      }
    }).catch(() => { /* 恢复失败不阻塞主流程 */ });
    return () => { cancelled = true; };
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 将 AI 结果增量写入持久层（upsert by noteId） */
  const persistAIResult = useCallback(async (patch: Partial<FeynmanAIResult>) => {
    if (!note?.id) return;
    const noteId = note.id;
    try {
      const existing = (await feynmanAIResultStore.where('noteId', noteId))[0];
      if (existing) {
        const updated = { ...existing, ...patch, updatedAt: new Date() };
        await updateWithLog(feynmanAIResultStore, 'feynmanAIResults', existing.id, updated);
        setPersisted(updated);
      } else {
        const now = new Date();
        const data = { noteId, ...patch, createdAt: now, updatedAt: now };
        const id = await createWithLog(feynmanAIResultStore, 'feynmanAIResults', data);
        setPersisted({ id, ...data } as FeynmanAIResult);
      }
    } catch { /* 持久化失败不阻塞主流程 */ }
  }, [note?.id]);

  /** 重置 AI 反馈：删除持久化记录 + 清空内存状态 */
  const resetAIResults = useCallback(async () => {
    if (!note?.id) return;
    try {
      const records = await feynmanAIResultStore.where('noteId', note.id);
      for (const r of records) await feynmanAIResultStore.delete(r.id);
    } catch { /* 忽略 */ }
    setPersisted(null);
    setShowAIEval(false);
    setShowQuestionPanel(false);
    setLocalAnswers([]);
    clearEval();
    clearQuestion();
    clearAnswerEval();
    toast({ type: 'success', message: 'AI 反馈已重置' });
  }, [note?.id, clearEval, clearQuestion, clearAnswerEval, toast]);

  /** 是否存在 AI 结果（内存或持久层）——用于展示重置按钮 */
  const hasAIResults = !!(aiEvalData || aiQuestionData || aiAnswerEvalData
    || persisted?.evalResult || persisted?.questionData || persisted?.answerEvalData);

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
    aiEvaluate(note.concept, note.explanation)
      .then((result) => { persistAIResult({ evalResult: result }); })
      .catch(handleEvalError);
  }, [note, toast, aiEvaluate, handleEvalError, persistAIResult]);

  const handleGenerateQuestions = useCallback(() => {
    if (!note?.concept || !note?.explanation) {
      toast({ type: 'warning', message: '请先完成讲解内容' });
      return;
    }
    setShowQuestionPanel(true);
    setLocalAnswers([]);
    generateQuestions(note.concept, note.explanation)
      .then((result) => { persistAIResult({ questionData: result, answers: undefined, answerEvalData: undefined }); })
      .catch(handleQuestionError);
  }, [note, toast, generateQuestions, handleQuestionError, persistAIResult]);

  const handleSubmitAnswers = useCallback(async () => {
    if (!note?.concept || !aiQuestionData) return;
    const questions = aiQuestionData.questions.map(q => q.question);
    const answers = aiQuestionData.questions.map((_, i) => localAnswers[i] || '');
    if (answers.every(a => !a.trim())) {
      toast({ type: 'warning', message: '请至少回答一个追问' });
      return;
    }
    const evalResult = await aiEvaluateAnswers(note.concept, questions, answers).catch(handleEvalError);
    if (evalResult) {
      persistAIResult({ answers, answerEvalData: evalResult });
    }
  }, [note, aiQuestionData, localAnswers, toast, aiEvaluateAnswers, handleEvalError, persistAIResult]);

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
    aiEvalLoading,
    // v0.30: 内存数据优先，回退持久化记录（返回列表后重新进入可恢复）
    aiEvalData: aiEvalData ?? persisted?.evalResult ?? null,
    aiEvalError, aiEvalNeedsConfig, handleAIEval,
    showQuestionPanel, setShowQuestionPanel,
    localAnswers, setLocalAnswers,
    aiQuestionLoading,
    aiQuestionData: aiQuestionData ?? persisted?.questionData ?? null,
    aiQuestionError, aiQuestionNeedsConfig,
    handleGenerateQuestions,
    aiAnswerEvalLoading,
    aiAnswerEvalData: aiAnswerEvalData ?? persisted?.answerEvalData ?? null,
    aiAnswerEvalError, aiAnswerEvalNeedsConfig,
    handleSubmitAnswers,
    resetAIResults, hasAIResults,
    menuOpen, menuPosition, menuContext, closeMenu,
    aiMenuGroups, handleMenuSelect, handleNoteContextMenu,
  };
}
