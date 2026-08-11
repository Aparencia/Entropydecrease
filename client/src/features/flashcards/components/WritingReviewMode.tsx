/**
 * 书写复习模式 — 默写答案后自检
 *
 * @ai-context: 3.5 多感官复习。用户看正面默写答案，提交后做模糊匹配
 * （答案文本包含关系）给出"基本一致/有差异"提示；自检后翻转显示标准答案
 * 并解锁评分（onFlipEnd 门控 RatingBar）。
 */
import { useMemo, useState } from 'react';
import { PenLine, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { extractPlainText } from '../lib/reviewMode';
import type { Flashcard } from '@/types/models';

interface WritingReviewModeProps {
  card: Flashcard;
  isFlipped: boolean;
  onFlip: () => void;
  onFlipEnd: () => void;
}

/** 归一化：去空白/标点/大小写，用于模糊匹配 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s，。！？、；：""''（）()《》<>·.,!?;:'"()[\]{}]/g, '');
}

export function WritingReviewMode({ card, isFlipped, onFlip, onFlipEnd }: WritingReviewModeProps) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);

  const backText = useMemo(() => extractPlainText(card.back), [card.back]);
  const normalizedBack = useMemo(() => normalize(backText), [backText]);

  // 模糊匹配：答案归一化后为标准的非空子串，或二者互为子串（近似）
  const normalizedAnswer = normalize(answer);
  const isMatch = useMemo(() => {
    if (!normalizedAnswer || !normalizedBack) return false;
    return (
      normalizedBack.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedBack)
    );
  }, [normalizedAnswer, normalizedBack]);

  const handleCheck = () => {
    setChecked(true);
    onFlip();
    onFlipEnd();
  };

  const handleReset = () => {
    setChecked(false);
    setAnswer('');
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-5 py-6">
      <div className="flex items-center gap-2 text-text-tertiary text-xs">
        <PenLine className="w-4 h-4" strokeWidth={1.5} />
        看正面，默写答案，然后自检
      </div>

      {/* 正面提示 */}
      <div className="w-full rounded-kb-xl border border-border-subtle bg-bg-secondary/60 p-6 text-center">
        <div className="text-xs text-text-tertiary mb-2">题目</div>
        <div className="text-base text-text-primary leading-relaxed max-h-40 overflow-y-auto">
          {extractPlainText(card.front) || '（无文字内容）'}
        </div>
      </div>

      {/* 默写区 */}
      <textarea
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value);
          setChecked(false);
        }}
        placeholder="在此默写答案…"
        rows={4}
        className="w-full resize-none rounded-kb-lg border border-border-subtle bg-bg-secondary/60 px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand-400/60"
      />

      {checked && (
        <div
          className={`w-full flex items-center gap-2 rounded-kb-lg border px-4 py-3 text-sm ${
            isMatch
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-600'
          }`}
        >
          {isMatch ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" strokeWidth={1.6} />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" strokeWidth={1.6} />
          )}
          <span>
            {isMatch ? '基本一致，回忆成功' : '与标准答案有差异，对照下方答案复习'}
          </span>
        </div>
      )}

      {isFlipped ? (
        <div className="w-full rounded-kb-xl border border-brand-300/50 bg-brand-500/5 p-5 text-center">
          <div className="text-xs text-text-tertiary mb-2">标准答案</div>
          <div className="text-base text-text-primary leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {backText}
          </div>
          <Button variant="secondary" size="sm" className="mt-4" onClick={handleReset}>
            重写一遍
          </Button>
        </div>
      ) : (
        <Button onClick={handleCheck} disabled={!answer.trim()} icon={<PenLine className="w-4 h-4" />}>
          提交自检
        </Button>
      )}
    </div>
  );
}
