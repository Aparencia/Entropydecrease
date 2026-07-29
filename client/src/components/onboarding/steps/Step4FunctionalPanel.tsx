/**
 * Step4FunctionalPanel — 功能面板说明
 *
 * @ai-context: 通用组件：Step4FunctionalPanel。
 */
import { useEffect } from 'react';
import { OnboardingCard } from '../OnboardingCard';
import { useOnboardingStore } from '../useOnboardingStore';
import { STEP_TEXTS } from '../onboardingConstants';

export function Step4FunctionalPanel() {
  const { nextStep, autoDemo } = useOnboardingStore();
  const text = STEP_TEXTS[3];

  // 自动演示模式下3秒后自动下一步
  useEffect(() => {
    if (autoDemo) {
      const timer = setTimeout(() => nextStep(), 3000);
      return () => clearTimeout(timer);
    }
  }, [autoDemo, nextStep]);

  return (
    <div className="fixed top-20 right-8 z-50 pointer-events-none">
      <OnboardingCard width={340} pulse className="pointer-events-auto">
        {/* 箭头指向面板区域 */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-white/20" />

        <h3 className="text-lg font-semibold text-white mb-2">{text.title}</h3>
        <p className="text-white/70 text-sm leading-relaxed">{text.description}</p>

        {!autoDemo && (
          <button
            onClick={nextStep}
            className="mt-4 w-full px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition-colors"
          >
            下一步 →
          </button>
        )}
      </OnboardingCard>
    </div>
  );
}
