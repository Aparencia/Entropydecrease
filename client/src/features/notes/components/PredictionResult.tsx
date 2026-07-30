/**
 * 预测结果可视化 — 揭示答案后的对比展示与统计
 * FEAT-023
 *
 * @ai-context: 通用组件：PredictionResult。
 */
import { CheckCircle2, AlertCircle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PredictionResultItem {
  question: string;
  userGuess: string;
  aiAnswer: string;
  accuracy?: 'correct' | 'partial' | 'incorrect';
}

interface PredictionResultProps {
  predictions: PredictionResultItem[];
}

const ACCURACY_CONFIG = {
  correct: {
    icon: CheckCircle2,
    label: '正确',
    borderColor: 'border-[var(--kb-moss-green)]/40',
    bgColor: 'bg-[var(--kb-moss-green)]/5',
    textColor: 'text-[var(--kb-moss-green)]',
    iconColor: 'text-[var(--kb-moss-green)]',
  },
  partial: {
    icon: AlertCircle,
    label: '部分正确',
    borderColor: 'border-[var(--kb-amber)]/40',
    bgColor: 'bg-[var(--kb-amber)]/5',
    textColor: 'text-[var(--kb-amber)]',
    iconColor: 'text-[var(--kb-amber)]',
  },
  incorrect: {
    icon: MinusCircle,
    label: '未命中',
    borderColor: 'border-border/30',
    bgColor: 'bg-bg-secondary/40',
    textColor: 'text-text-tertiary',
    iconColor: 'text-text-tertiary',
  },
} as const;

export function PredictionResult({ predictions }: PredictionResultProps) {
  const correctCount = predictions.filter((p) => p.accuracy === 'correct').length;
  const totalCount = predictions.length;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* 统计栏 */}
      <div className={cn(
        'flex items-center justify-between px-4 py-3 rounded-kb-lg',
        'bg-bg-secondary/60 backdrop-blur-sm border border-border/30',
      )}>
        <span className="text-b2 text-text-secondary font-medium">本轮成绩</span>
        <span className={cn(
          'text-h3 font-bold',
          correctCount === totalCount ? 'text-[var(--kb-moss-green)]' : 'text-brand-600',
        )}>
          正确 {correctCount}/{totalCount} 题
        </span>
      </div>

      {/* 结果卡片列表 */}
      {predictions.map((pred, idx) => {
        const config = ACCURACY_CONFIG[pred.accuracy ?? 'incorrect'];
        const Icon = config.icon;

        return (
          <div
            key={idx}
            className={cn(
              'rounded-kb-lg p-4 border transition-all duration-kb-normal',
              config.borderColor,
              config.bgColor,
            )}
          >
            {/* 问题 + 准确度标记 */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-b2 text-text-primary font-medium leading-relaxed flex-1">
                {pred.question}
              </p>
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-kb-full text-c1 font-medium flex-shrink-0',
                config.bgColor,
                config.textColor,
              )}>
                <Icon className="w-3 h-3" strokeWidth={2} />
                {config.label}
              </span>
            </div>

            {/* 用户猜测 vs AI 答案 */}
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-start gap-2">
                <span className="text-b3 text-text-tertiary w-14 flex-shrink-0 pt-px">你的回答</span>
                <p className="text-b2 text-text-secondary flex-1">
                  {pred.userGuess || <span className="italic text-text-tertiary/60">（未作答）</span>}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-b3 text-text-tertiary w-14 flex-shrink-0 pt-px">参考答案</span>
                <p className="text-b2 text-text-primary flex-1">{pred.aiAnswer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
