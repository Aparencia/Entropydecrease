/**
 * 新手引导 Step 0：欢迎页
 *
 * @ai-context: OnboardingPage 审计拆分。纯展示组件：onNext 进入下一步，
 * onSkip 跳过引导（由父级 finish 处理——写入 kb-onboarding-done 并跳转）。
 * @ai-context: Extracted from OnboardingPage. Pure welcome view; onNext
 * advances, onSkip finishes the tour (parent writes kb-onboarding-done).
 */
import { BookOpen, ArrowRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui';

export function StepWelcome({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-kb-xl text-center px-kb-lg">
      {/* Logo */}
      <div className="flex items-center gap-kb-sm">
        <div className="p-3 rounded-kb-xl bg-brand-600/10">
          <BookOpen className="w-icon-xl h-icon-xl text-brand-600" strokeWidth={1.5} />
        </div>
      </div>

      {/* 品牌名 */}
      <h1 className="text-d1 font-bold text-brand-600 tracking-tight">熵减</h1>

      {/* 文案 */}
      <div className="flex flex-col gap-kb-xs max-w-sm">
        <h2 className="text-d2 font-bold text-text-primary">欢迎使用熵减</h2>
        <p className="text-b1 text-text-secondary">你的本地优先智能学习助手</p>
      </div>

      {/* 操作 */}
      <div className="flex flex-col items-center gap-kb-md w-full max-w-xs">
        <Button
          size="lg"
          variant="primary"
          className="w-full"
          iconRight={<ArrowRight className="w-icon-sm h-icon-sm" />}
          onClick={onNext}
        >
          开始了解
        </Button>

        <button
          onClick={onSkip}
          className="flex items-center gap-1 text-b2 text-text-tertiary hover:text-text-secondary transition-colors duration-kb-fast"
        >
          <SkipForward className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
          跳过引导
        </button>
      </div>
    </div>
  );
}
