/**
 * 新手引导 Step 2-5：功能演示
 *
 * @ai-context: OnboardingPage 审计拆分。按 featureSteps 数据渲染单模块演示
 * （图标/标题/流程链/导航按钮）；index 仅用于步骤编号展示。
 * @ai-context: Extracted from OnboardingPage. Renders one feature-module demo
 * from featureSteps (icon/title/flow chain/nav buttons); index is display-only.
 */
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { OnboardingStep } from '../onboardingData';

export function StepFeature({
  step,
  index,
  total,
  onNext,
  onPrev,
}: {
  step: OnboardingStep;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
}) {
  const Icon = step.icon;
  // index is used for step numbering display
  const isLast = index === total - 1;

  return (
    <div className="flex flex-col items-center gap-kb-lg px-kb-lg w-full max-w-lg">
      {/* 步骤编号 */}
      <span className={cn('text-c1 font-medium tracking-wide', step.accent)}>
        {index + 1} / {total}
      </span>

      {/* 图标 */}
      <div
        className={cn(
          'p-kb-md rounded-kb-xl ring-2 transition-all duration-kb-normal',
          step.bg,
          step.ringColor,
        )}
      >
        <Icon className={cn('w-icon-xl h-icon-xl', step.accent)} strokeWidth={1.5} />
      </div>

      {/* 标题 */}
      <div className="flex flex-col gap-kb-xs text-center">
        <h2 className="text-h1 font-bold text-text-primary">{step.title}</h2>
        <p className={cn('text-b2 font-medium', step.accent)}>{step.subtitle}</p>
      </div>

      {/* 描述 */}
      <p className="text-b1 text-text-secondary text-center max-w-sm leading-relaxed">
        {step.description}
      </p>

      {/* 流程演示 */}
      <div className="flex items-center gap-1 sm:gap-2 w-full justify-center flex-wrap">
        {step.flowItems.map((item, i) => {
          const ItemIcon = item.icon;
          return (
            <div key={i} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex flex-col items-center gap-1 px-kb-sm py-kb-xs rounded-kb-lg',
                  step.bg,
                  'transition-all duration-kb-normal',
                )}
              >
                <ItemIcon className={cn('w-icon-sm h-icon-sm', step.accent)} strokeWidth={1.5} />
                <span className="text-c2 text-text-secondary whitespace-nowrap">{item.label}</span>
              </div>
              {i < step.flowItems.length - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" strokeWidth={1.5} />
              )}
            </div>
          );
        })}
      </div>

      {/* 导航按钮 */}
      <div className="flex items-center gap-kb-sm w-full max-w-xs mt-kb-sm">
        <Button size="lg" variant="secondary" className="flex-1" onClick={onPrev}>
          <span className="flex items-center gap-1">
            <ArrowLeft className="w-icon-sm h-icon-sm" />
            上一步
          </span>
        </Button>
        <Button
          size="lg"
          variant="primary"
          className="flex-1"
          iconRight={<ArrowRight className="w-icon-sm h-icon-sm" />}
          onClick={onNext}
        >
          {isLast ? '下一步' : '下一步'}
        </Button>
      </div>
    </div>
  );
}
