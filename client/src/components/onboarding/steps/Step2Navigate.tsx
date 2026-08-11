/**
 * Step2Navigate — 导航教学：高亮所有模块实体，等待用户点击
 *
 * @ai-context: 通用组件：Step2Navigate。
 */
import { useEffect, useState } from 'react';
import { OnboardingCard } from '../OnboardingCard';
import { useOnboardingStore } from '../useOnboardingStore';
import { STEP_TEXTS } from '../onboardingConstants';
import { useOrbitalStore } from '@/lib/3d/navigation/OrbitalStore';

export function Step2Navigate() {
  const { nextStep, setHighlightAll } = useOnboardingStore();
  const [showNext, setShowNext] = useState(false);
  const isInModule = useOrbitalStore((s) => s.isInModule);
  const setOrbitalHighlight = useOrbitalStore((s) => s.setHighlightAll);
  const text = STEP_TEXTS[1];

  // 高亮所有模块 — 同步到 OrbitalStore
  useEffect(() => {
    setHighlightAll(true);
    setOrbitalHighlight(true);
    return () => {
      setHighlightAll(false);
      setOrbitalHighlight(false);
    };
  }, [setHighlightAll, setOrbitalHighlight]);

  // 8秒后显示"下一步"按钮
  useEffect(() => {
    const timer = setTimeout(() => setShowNext(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  // 用户点击模块后自动进入下一步
  useEffect(() => {
    if (isInModule) {
      nextStep();
    }
  }, [isInModule, nextStep]);

  return (
    <div className="fixed bottom-24 left-8 z-50 pointer-events-none">
      <OnboardingCard width={360} className="pointer-events-auto">
        <h3 className="text-lg font-semibold text-white mb-2">{text.title}</h3>
        <p className="text-white/70 text-sm leading-relaxed">{text.description}</p>

        {showNext && (
          <button
            onClick={nextStep}
            className="mt-4 w-full px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-text-inverse text-sm font-medium transition-colors"
          >
            下一步 →
          </button>
        )}
        {!showNext && (
          <p className="mt-3 text-white/40 text-xs animate-pulse">点击任意发光模块...</p>
        )}
      </OnboardingCard>
    </div>
  );
}
