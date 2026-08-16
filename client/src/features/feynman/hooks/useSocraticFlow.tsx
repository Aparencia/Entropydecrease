/**
 * 苏格拉底式学习流程 hook — 状态机 + 阶段转换逻辑
 * 从 SocraticSessionPage 提取，负责全部业务逻辑，页面仅保留 UI 渲染
 *
 * @ai-context: feynman 功能模块 Hook：useSocraticFlow。
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui';
import { useAISocratic } from '@/lib/ai/hooks/useAISocratic';
import { useFeynmanStore } from '../store/useFeynmanStore';
import type { BrainstormIdea } from '../components/BrainstormPanel';
import type { DeepeningAngle } from '../components/DeepeningZone';
import { collectWeakDimensions } from '../lib/collectWeakDimensions';
import type { SocraticRound } from '../types';
import {
  GitCompareArrows, Ban, Wrench, Landmark, Flame,
  Lightbulb, Search, Puzzle, BookOpen, Target,
} from 'lucide-react';

export type Phase = 'brainstorm' | 'dialogue' | 'deepening';

const MAX_ROUNDS = 4;
const PHASE_TRANSITION_MS = 300;

/** 默认深化角度（AI 降级时使用） */
const DEFAULT_DEEPENING_ANGLES: DeepeningAngle[] = [
  { key: 'analogy', label: '类比联想', question: '这个概念像什么？能用生活中什么东西来比喻？', icon: null, color: 'text-blue-500 bg-blue-500/10' },
  { key: 'counter', label: '反例验证', question: '什么情况下这个概念不成立？有例外吗？', icon: null, color: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
  { key: 'apply', label: '实际应用', question: '在实际生活或工作中，这个概念怎么用？', icon: null, color: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
  { key: 'history', label: '历史脉络', question: '这个概念是怎么来的？谁发现的？为什么？', icon: null, color: 'text-cyber bg-cyber/10 dark:text-cyber' },
  { key: 'debate', label: '争议反思', question: '关于这个概念，有什么不同的看法或争论？', icon: null, color: 'text-orange-600 bg-orange-500/10 dark:text-orange-400' },
];

const ANGLE_ICON_MAP: Record<string, React.ReactNode> = {
  analogy: <GitCompareArrows className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  counter: <Ban className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  apply: <Wrench className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  history: <Landmark className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  debate: <Flame className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
};
// 模块级 JSX 元素常量池（非渲染列表，按 index 取用后作为属性传递，无需 key）。
// oxlint react/jsx-key 对非渲染数组误报，逐行抑制。
// oxlint-disable-next-line react/jsx-key
const FALLBACK_ICONS = [
  // oxlint-disable-next-line react/jsx-key
  <Lightbulb className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  // oxlint-disable-next-line react/jsx-key
  <Search className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  // oxlint-disable-next-line react/jsx-key
  <Puzzle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  // oxlint-disable-next-line react/jsx-key
  <BookOpen className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
  // oxlint-disable-next-line react/jsx-key
  <Target className="w-icon-sm h-icon-sm" strokeWidth={1.5} />,
];
const FALLBACK_COLORS = [
  'text-blue-500 bg-blue-500/10',
  'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
  'text-cyber bg-cyber/10 dark:text-cyber',
  'text-orange-600 bg-orange-500/10 dark:text-orange-400',
];

/** 将 AI 返回的角度映射为 DeepeningAngle（带 icon/color） */
function mapToDeepeningAngles(aiAngles: Array<{ key: string; label: string; question: string }>): DeepeningAngle[] {
  return aiAngles.map((a, i) => ({
    key: a.key,
    label: a.label,
    question: a.question,
    icon: ANGLE_ICON_MAP[a.key] ?? FALLBACK_ICONS[i % FALLBACK_ICONS.length],
    color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));
}

export function useSocraticFlow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  // 细粒度订阅 action（恒定引用），避免 useFeynmanStore() 无 selector 订阅整个 store
  // 导致笔记列表/薄弱点等任意变化都重渲染苏格拉底会话页（P1-5 性能修复）
  const createNote = useFeynmanStore((s) => s.createNote);
  const updateNote = useFeynmanStore((s) => s.updateNote);
  const addWeakPoint = useFeynmanStore((s) => s.addWeakPoint);
  const { brainstorm: brainstormAI, question: questionAI, evaluate: evaluateAI, deepening: deepeningAI } = useAISocratic();

  // ── State ──
  const [phase, setPhase] = useState<Phase>('brainstorm');
  const [topic, setTopic] = useState('');
  const [ideas, setIdeas] = useState<BrainstormIdea[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rounds, setRounds] = useState<SocraticRound[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [dialogueCompleted, setDialogueCompleted] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [deepeningAngles, setDeepeningAngles] = useState<DeepeningAngle[]>([]);
  const [deepeningFallbackMsg, setDeepeningFallbackMsg] = useState<string | null>(null);

  const conversationIdRef = useRef(`socratic_${Date.now()}`);
  // 阶段过渡定时器 ref：卸载时清理，避免卸载后 setState/navigate（P1-9 性能修复）
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, []);

  // ── 阶段过渡辅助 ──
  const transitionToPhase = useCallback((nextPhase: Phase, onEnter?: () => void | Promise<void>) => {
    setExiting(true);
    phaseTimerRef.current = setTimeout(async () => {
      setPhase(nextPhase);
      setExiting(false);
      if (onEnter) await onEnter();
    }, PHASE_TRANSITION_MS);
  }, []);

  // ── Phase 1: Brainstorm ──

  const handleStartBrainstorm = useCallback(async () => {
    if (!topic.trim()) {
      toast({ type: 'warning', message: '请先输入一个概念或主题' });
      return;
    }
    const result = await brainstormAI.brainstorm(topic.trim());
    if (result?.ideas && result.ideas.length > 0) {
      setIdeas(result.ideas.map(i => ({
        title: i.title,
        description: i.description,
        category: i.category,
      })));
    } else {
      setIdeas([
        { title: '生活类比', description: `「${topic}」让你联想到生活中的什么？`, category: '类比' },
        { title: '反例挑战', description: '什么情况下「' + topic + '」不成立？', category: '反例' },
        { title: '实际应用', description: `「${topic}」在现实中有哪些具体应用？`, category: '应用' },
        { title: '发展历史', description: `「${topic}」是如何被提出和演变的？`, category: '历史' },
        { title: '争议与反思', description: `围绕「${topic}」有哪些不同看法？`, category: '争议' },
      ]);
    }
  }, [topic, brainstormAI, toast]);

  const handleSelectIdea = useCallback((title: string) => {
    setSelected(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title],
    );
  }, []);

  const handleToDialogue = useCallback(() => {
    if (selected.length === 0) {
      toast({ type: 'warning', message: '请至少选择一个思考方向' });
      return;
    }
    transitionToPhase('dialogue', async () => {
      setCurrentRound(1);
      const history = [{ role: 'user' as const, content: `我想深入理解「${topic}」，关注方向：${selected.join('、')}` }];
      const result = await questionAI.askQuestion(conversationIdRef.current, topic, history);
      if (result) {
        setRounds([{
          roundNumber: 1,
          aiQuestion: result.question,
          userAnswer: '',
          aiFeedback: '',
          hints: result.hints ?? [],
        }]);
      }
    });
  }, [selected, topic, questionAI, toast, transitionToPhase]);

  // ── Phase 2: Socratic Dialogue ──

  const handleSubmitAnswer = useCallback(async (answer: string) => {
    const roundIdx = currentRound - 1;
    const updatedRounds = [...rounds];
    updatedRounds[roundIdx] = { ...updatedRounds[roundIdx], userAnswer: answer };
    setRounds(updatedRounds);

    const currentQuestion = updatedRounds[roundIdx].aiQuestion;
    const history = updatedRounds.flatMap(r => [
      { role: 'assistant' as const, content: r.aiQuestion },
      { role: 'user' as const, content: r.userAnswer || answer },
    ]);

    const [evalResult, nextResult] = await Promise.all([
      evaluateAI.evaluateAnswer(topic, currentQuestion, answer, history),
      currentRound >= MAX_ROUNDS
        ? Promise.resolve(null)
        // A 组流式接入：苏格拉底追问打字机（失败自动降级非流式 askQuestion）
        : questionAI.askQuestionStream(conversationIdRef.current, topic, history),
    ]);

    if (evalResult?.dimensions) {
      updatedRounds[roundIdx] = {
        ...updatedRounds[roundIdx],
        dimensions: evalResult.dimensions,
        aiFeedback: evalResult.feedback || `很好，你提到了"${answer.slice(0, 30)}…"，让我们继续深入。`,
        hints: evalResult.encouragement ? [evalResult.encouragement] : [],
      };
    } else {
      updatedRounds[roundIdx] = {
        ...updatedRounds[roundIdx],
        aiFeedback: `很好，你提到了"${answer.slice(0, 30)}…"，让我们继续深入。`,
        hints: [],
      };
    }

    if (currentRound >= MAX_ROUNDS) {
      setRounds([...updatedRounds]);
      setDialogueCompleted(true);
    } else if (nextResult) {
      const nextRound: SocraticRound = {
        roundNumber: currentRound + 1,
        aiQuestion: nextResult.question,
        userAnswer: '',
        aiFeedback: '',
        hints: nextResult.hints ?? [],
      };
      setRounds([...updatedRounds, nextRound]);
      setCurrentRound(prev => prev + 1);
    } else {
      setRounds([...updatedRounds]);
      setDialogueCompleted(true);
    }
  }, [rounds, currentRound, topic, questionAI, evaluateAI]);

  const handleToDeepening = useCallback(async () => {
    // 构建对话摘要
    const dialogueSummary = rounds.map(r => `Q: ${r.aiQuestion}\nA: ${r.userAnswer}`).join('\n');
    const history = rounds.flatMap(r => [
      { role: 'assistant' as const, content: r.aiQuestion },
      { role: 'user' as const, content: r.userAnswer },
    ]);

    transitionToPhase('deepening', async () => {
      const result = await deepeningAI.generateDeepeningAngles(topic, dialogueSummary, history);
      if (result?.angles && result.angles.length > 0) {
        setDeepeningAngles(mapToDeepeningAngles(result.angles));
        setDeepeningFallbackMsg(
          result.status === 'fallback'
            ? 'AI 服务暂时不可用，已为您生成默认深化角度'
            : null,
        );
      } else {
        // 完全失败时，使用本地默认角度（动态替换主题名）
        setDeepeningAngles(DEFAULT_DEEPENING_ANGLES.map(a => ({
          ...a,
          question: a.question.replace('这个概念', `「${topic}」`),
          icon: ANGLE_ICON_MAP[a.key] ?? null,
        })));
        setDeepeningFallbackMsg('AI 深化服务暂时不可用，已为您生成默认思考角度');
      }
    });
  }, [topic, rounds, deepeningAI, transitionToPhase]);

  // ── Phase 3: Deepening → Save ──

  const handleDeepeningSubmit = useCallback(async (answers: Record<string, string>) => {
    setSavingNote(true);
    const explanation = [
      `## 苏格拉底式学习：${topic}\n`,
      `### 发散思考`,
      ...selected.map(s => `- ${s}`),
      '',
      `### 追问对话摘要`,
      ...rounds.map(r => `**Q${r.roundNumber}**: ${r.aiQuestion}\n**A**: ${r.userAnswer}`),
      '',
      `### 深化理解`,
      ...Object.entries(answers).map(([key, val]) => `**${key}**: ${val}`),
    ].join('\n');

    let noteId: string;
    try {
      noteId = await createNote(topic);
      await updateNote(noteId, { explanation, status: 'completed', currentStep: 4 });
    } catch {
      toast({ type: 'error', message: '保存失败，请稍后重试' });
      setSavingNote(false);
      return;
    }

    // E4 苏格拉底-费曼数据互通：对话评估中得分 <6 的维度写入该笔记薄弱点。
    // 独立静默失败：薄弱点是可选增强，若混入主 try 会在笔记已落库后
    // 误报"保存失败"，用户重试将创建重复笔记
    try {
      for (const text of collectWeakDimensions(rounds)) {
        await addWeakPoint(noteId, { text, position: { start: 0, end: 0 }, mastered: false });
      }
    } catch { /* 可选增强静默降级 */ }

    toast({ type: 'success', message: '已保存为浮出水面概念！' });

    setExiting(true);
    phaseTimerRef.current = setTimeout(() => { navigate(`/feynman/${noteId}`); }, PHASE_TRANSITION_MS);
  }, [topic, selected, rounds, createNote, updateNote, addWeakPoint, toast, navigate]);

  const handleGoBack = useCallback(() => {
    if (phase === 'brainstorm') {
      navigate('/feynman');
    } else {
      const prevPhase: Phase = phase === 'dialogue' ? 'brainstorm' : 'dialogue';
      transitionToPhase(prevPhase);
    }
  }, [phase, navigate, transitionToPhase]);

  return {
    // state
    phase, topic, setTopic, ideas, selected, rounds, currentRound,
    dialogueCompleted, savingNote, exiting,
    deepeningAngles, deepeningFallbackMsg,
    deepeningLoading: deepeningAI.loading,
    // AI loading/error
    brainstormLoading: brainstormAI.loading,
    brainstormError: brainstormAI.error,
    questionLoading: questionAI.loading,
    // A 组流式接入：追问打字机渐进文本与状态（SocraticDialogue 消费）
    streamingQuestion: questionAI.streamingQuestion,
    isQuestionStreaming: questionAI.isQuestionStreaming,
    // handlers
    handleStartBrainstorm, handleSelectIdea, handleToDialogue,
    handleSubmitAnswer, handleToDeepening, handleDeepeningSubmit, handleGoBack,
    // constants
    maxRounds: MAX_ROUNDS,
  };
}
