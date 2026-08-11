/**
 * Step1Welcome — 欢迎画面
 *
 * @ai-context: 通用组件：Step1Welcome。
 */
import { OnboardingCard } from '../OnboardingCard';
import { useOnboardingStore } from '../useOnboardingStore';
import { WELCOME_TEXT } from '../onboardingConstants';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';

export function Step1Welcome() {
  const theme = useSceneTheme();
  const { nextStep, skipGuide, toggleAutoDemo, autoDemo } = useOnboardingStore();
  const text = WELCOME_TEXT[theme];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <OnboardingCard width={480} className="pointer-events-auto">
        <h2 className="text-2xl font-bold text-white mb-3">{text.title}</h2>
        <p className="text-white/70 mb-6 leading-relaxed">{text.subtitle}</p>

        <div className="flex gap-3">
          <button
            onClick={nextStep}
            className="flex-1 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-text-inverse font-medium transition-colors"
          >
            开始探索
          </button>
          <button
            onClick={skipGuide}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors"
          >
            跳过引导
          </button>
        </div>

        <button
          onClick={toggleAutoDemo}
          className={`mt-3 w-full px-4 py-2 rounded-lg text-sm transition-colors ${
            autoDemo
              ? 'bg-brand-500/30 text-brand-200'
              : 'bg-white/5 text-white/50 hover:text-white/70'
          }`}
        >
          {autoDemo ? '⏸ 关闭自动演示' : '▶ 自动演示模式（约20秒）'}
        </button>
      </OnboardingCard>
    </div>
  );
}
