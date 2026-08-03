/**
 * 概念预检卡（E1 错误概念先破后立）
 *
 * @ai-context: 费曼 step1 前的可选预检卡：基于目标概念 + 历史薄弱点/
 * 黄金错误生成 1-2 个探测性问题，先暴露潜在错误认知再开始讲解。
 * 可跳过（觉察原则）；AI 不可用或无问题时静默不渲染；
 * 关闭状态经 localStorage 按 noteId 记忆，避免重复打扰。
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchCheck, Lightbulb, X } from 'lucide-react';
import { useAIConceptPrecheck } from '@/lib/ai/hooks/useAIConceptPrecheck';
import { feynmanWeakPointStore } from '@/lib/storage';
import { getGoldenErrorRecords } from '@/features/flashcards/lib/goldenErrorQueries';

/** 历史薄弱点取最近 N 条参与摘要 */
const WEAK_POINT_LIMIT = 20;
/** 黄金错误取最近 N 条参与摘要 */
const GOLDEN_ERROR_LIMIT = 10;

interface ConceptPrecheckCardProps {
  concept: string;
  noteId: string;
}

/** 组装历史薄弱点摘要（费曼薄弱点 + 黄金错误卡片正面） */
async function buildWeakHistory(): Promise<string> {
  try {
    const [weakPoints, goldenErrors] = await Promise.all([
      feynmanWeakPointStore.getTable().toArray(),
      getGoldenErrorRecords(30),
    ]);
    const wpTexts = weakPoints.slice(-WEAK_POINT_LIMIT).map((wp) => wp.text);
    const goldenTexts = goldenErrors.slice(0, GOLDEN_ERROR_LIMIT).map((g) => g.front);
    return [...wpTexts, ...goldenTexts].filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

export function ConceptPrecheckCard({ concept, noteId }: ConceptPrecheckCardProps) {
  const dismissKey = `feynman_precheck_dismissed_${noteId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');
  const [intentOpen, setIntentOpen] = useState(false);
  const { result, loading, error, precheck } = useAIConceptPrecheck();

  useEffect(() => {
    if (dismissed || !concept.trim()) return;
    let cancelled = false;
    buildWeakHistory().then((history) => {
      if (!cancelled) precheck(concept, history);
    });
    return () => { cancelled = true; };
  }, [concept, dismissed, precheck]);

  const dismiss = () => {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  const questions = result?.questions ?? [];
  // 静默场景：已关闭 / 加载中 / 失败 / 无问题 → 不渲染（可选增强不打扰）
  if (dismissed || loading || !!error || questions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        className="mb-4 rounded-kb-lg border border-amber-300/50 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-kb-md"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <SearchCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            <span className="text-b2 font-medium text-text-primary">概念预检 · 先破后立</span>
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            title="跳过预检"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <p className="text-c1 text-text-tertiary mb-3">
          开始讲解前，先想想这几个问题——直觉答案往往藏着误解。
        </p>

        <ul className="space-y-2 mb-3">
          {questions.map((q, i) => (
            <li key={i} className="text-b2 text-text-secondary rounded-kb-md bg-bg-primary/60 dark:bg-bg-tertiary/40 px-3 py-2">
              {q.question}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setIntentOpen(!intentOpen)}
            className="flex items-center gap-1 text-c1 text-amber-600 dark:text-amber-400 hover:opacity-80 transition-opacity"
          >
            <Lightbulb className="w-3.5 h-3.5" strokeWidth={1.5} />
            {intentOpen ? '收起探测意图' : '这些问题的用意'}
          </button>
          <button
            onClick={dismiss}
            className="px-3 py-1.5 rounded-full text-c1 font-medium text-white bg-gradient-to-r from-[#F59E0B] to-[#D97706] shadow-sm hover:shadow transition-shadow"
          >
            想好了，开始讲解
          </button>
        </div>

        {intentOpen && (
          <ul className="mt-2 space-y-1">
            {questions.map((q, i) => q.intent && (
              <li key={i} className="text-c1 text-text-tertiary">💡 {q.intent}</li>
            ))}
          </ul>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
