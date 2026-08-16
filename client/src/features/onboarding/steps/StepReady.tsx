/**
 * 新手引导 Step 6：准备就绪
 *
 * @ai-context: OnboardingPage 审计拆分。收尾页：onStart 由父级 finish 处理
 * （写入 kb-onboarding-done 并跳转首页），onPrev 返回功能演示。
 * @ai-context: Extracted from OnboardingPage. Final step; onStart triggers the
 * parent's finish (persists kb-onboarding-done, navigates home), onPrev goes back.
 */
import { Rocket, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';

export function StepReady({ onStart, onPrev }: { onStart: () => void; onPrev: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-kb-xl text-center px-kb-lg">
      {/* 大图标 */}
      <div className="p-kb-md rounded-kb-xl bg-brand-600/10">
        <Rocket className="w-icon-xl h-icon-xl text-brand-600" strokeWidth={1.5} />
      </div>

      <div className="flex flex-col gap-kb-xs max-w-sm">
        <h2 className="text-d2 font-bold text-text-primary">准备就绪！</h2>
        <p className="text-b1 text-text-secondary">默认混合模式，数据本地保存，可随时开启云同步</p>
      </div>

      <div className="flex items-center gap-kb-sm w-full max-w-xs">
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
          onClick={onStart}
        >
          开始使用
        </Button>
      </div>
    </div>
  );
}
