/**
 * 新手引导页（组合入口）
 *
 * @ai-context: 页面组件：OnboardingPage。审计拆分——5 个 Step 组件移至
 * features/onboarding/steps/，数据与类型移至 features/onboarding/onboardingData.ts。
 * 本文件仅保留步骤状态机（step 索引、finish/next/prev）与布局编排。
 * @ai-context: Page assembly only. Steps moved to features/onboarding/steps/,
 * data/types to features/onboarding/onboardingData.ts. Keeps the step-index
 * state machine (finish/next/prev) and layout orchestration.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { featureSteps } from '@/features/onboarding/onboardingData';
import { StepMode } from '@/features/onboarding/steps/StepMode';
import { StepDots } from '@/features/onboarding/steps/StepDots';
import { StepWelcome } from '@/features/onboarding/steps/StepWelcome';
import { StepFeature } from '@/features/onboarding/steps/StepFeature';
import { StepReady } from '@/features/onboarding/steps/StepReady';

/** Total steps: Welcome(0) + Mode(1) + 4 features(2-5) + Ready(6) */
const TOTAL_STEPS = 3 + featureSteps.length; // 7
const LAST_INDEX = TOTAL_STEPS - 1; // 6

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const finish = useCallback(() => {
    localStorage.setItem('kb-onboarding-done', 'true');
    navigate('/', { replace: true });
  }, [navigate]);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, LAST_INDEX)), []);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const renderStep = () => {
    if (step === 0) {
      return <StepWelcome onNext={next} onSkip={finish} />;
    }

    if (step === 1) {
      return <StepMode onNext={next} onPrev={prev} />;
    }

    if (step >= 2 && step <= featureSteps.length + 1) {
      const featureIndex = step - 2;
      return (
        <StepFeature
          step={featureSteps[featureIndex]}
          index={featureIndex}
          total={featureSteps.length}
          onNext={next}
          onPrev={prev}
        />
      );
    }

    // Final step
    return <StepReady onStart={finish} onPrev={prev} />;
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-between py-kb-2xl overflow-hidden">
      {/* 动画容器 */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div
          key={step}
          className="w-full flex justify-center"
          style={{
            animation: 'kb-slide-in 250ms ease-in-out both',
          }}
        >
          {renderStep()}
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="pb-kb-md">
        <StepDots current={step} total={TOTAL_STEPS} />
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes kb-slide-in {
          from {
            opacity: 0;
            transform: translateX(32px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
