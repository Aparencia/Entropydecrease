/**
 * 新手引导 · 步骤进度指示器
 *
 * @ai-context: OnboardingPage 审计拆分。纯展示组件：当前步高亮为宽条，
 * 已过步为实心圆点，未到步为浅色圆点。
 * @ai-context: Extracted from OnboardingPage. Pure progress indicator:
 * current step is a wide bar, passed steps solid dots, upcoming steps faint.
 */
import { cn } from '@/lib/utils';

export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'rounded-kb-full transition-all duration-kb-normal ease-kb-default',
            i === current
              ? 'w-6 h-2 bg-brand-600'
              : i < current
                ? 'w-2 h-2 bg-brand-400'
                : 'w-2 h-2 bg-border-strong',
          )}
        />
      ))}
    </div>
  );
}
