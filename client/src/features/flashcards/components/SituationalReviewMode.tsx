/**
 * 情境复习模式 — 将卡片正面转化为情境化问题
 *
 * @ai-context: 3.5 多感官复习。五种情境模板（解释给老师/生活例子/打比方/
 * 两句话讲清/实际问题），按卡片 ID 哈希稳定选择，可"换一个情境"轮换；
 * 翻转解锁评分（onFlipEnd 门控 RatingBar）。
 */
import { useMemo, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { stringHash } from '@/lib/utils/stringHash';
import { extractPlainText } from '../lib/reviewMode';
import type { Flashcard } from '@/types/models';

interface SituationalReviewModeProps {
  card: Flashcard;
  isFlipped: boolean;
  onFlip: () => void;
  onFlipEnd: () => void;
}

const SITUATION_TEMPLATES: Array<{ label: string; build: (topic: string) => string }> = [
  {
    label: '老师讲解',
    build: (t) => `假设你正在给一位刚接触「${t}」的同学讲明白它。你会如何用最通俗的语言开始讲解？`,
  },
  {
    label: '生活例子',
    build: (t) => `给「${t}」举一个日常生活中真实发生的例子，说明它为什么重要。`,
  },
  {
    label: '打个比方',
    build: (t) => `用一个生动的比喻来描述「${t}」，让一个从没见过它的人也能想象出来。`,
  },
  {
    label: '两句话讲清',
    build: (t) => `用不超过两句话向陌生人解释「${t}」的核心要点，你会怎么说？`,
  },
  {
    label: '实际问题',
    build: (t) => `针对「${t}」设计一个实际问题（选择题/场景题），并给出你的答案。`,
  },
];

/** 简单字符串哈希：同一卡片稳定命中同一模板（D12 收敛至 lib/utils/stringHash） */

export function SituationalReviewMode({ card, isFlipped, onFlip, onFlipEnd }: SituationalReviewModeProps) {
  const topic = useMemo(() => extractPlainText(card.front) || '这个知识点', [card.front]);
  const [templateIndex, setTemplateIndex] = useState(() => Math.abs(stringHash(card.id)) % SITUATION_TEMPLATES.length);

  const currentTemplate = SITUATION_TEMPLATES[templateIndex];

  const handleRotate = () => {
    setTemplateIndex((i) => (i + 1) % SITUATION_TEMPLATES.length);
  };

  const handleReveal = () => {
    onFlip();
    onFlipEnd();
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-5 py-6">
      <div className="flex items-center gap-2 text-text-tertiary text-xs">
        <Sparkles className="w-4 h-4" strokeWidth={1.5} />
        把知识放进情境里，检验真实理解
      </div>

      {/* 情境问题 */}
      <div className="w-full rounded-kb-xl border border-brand-300/40 bg-brand-500/5 p-7 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-kb-full bg-brand-500/10 text-brand-600 text-xs px-3 py-1 mb-4">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.6} />
          {currentTemplate.label}情境
        </div>
        <div className="text-base text-text-primary leading-relaxed">
          {currentTemplate.build(topic)}
        </div>
      </div>

      <Button variant="secondary" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={handleRotate}>
        换一个情境
      </Button>

      {isFlipped ? (
        <div className="w-full rounded-kb-xl border border-border-subtle bg-bg-secondary/60 p-5 text-center">
          <div className="text-xs text-text-tertiary mb-2">参考答案要点</div>
          <div className="text-base text-text-primary leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {extractPlainText(card.back)}
          </div>
        </div>
      ) : (
        <Button onClick={handleReveal} icon={<Sparkles className="w-4 h-4" />}>
          想好了，查看要点
        </Button>
      )}
    </div>
  );
}
