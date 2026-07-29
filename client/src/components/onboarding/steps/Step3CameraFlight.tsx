/**
 * Step3CameraFlight — 相机飞行演示
 *
 * @ai-context: 通用组件：Step3CameraFlight。
 */
import { useEffect } from 'react';
import { OnboardingCard } from '../OnboardingCard';
import { useOnboardingStore } from '../useOnboardingStore';
import { STEP_TEXTS } from '../onboardingConstants';
import { useOrbitalStore, MODULE_POSITIONS } from '@/lib/3d/navigation/OrbitalStore';

export function Step3CameraFlight() {
  const { nextStep } = useOnboardingStore();
  const isInModule = useOrbitalStore((s) => s.isInModule);
  const exitModule = useOrbitalStore((s) => s.exitModule);
  const text = STEP_TEXTS[2];

  // 如果用户在模块内（来自步骤2的点击），2秒后退出并继续
  // 如果不在模块内（超时跳过），直接展示卡片
  useEffect(() => {
    if (isInModule) {
      const timer = setTimeout(() => {
        exitModule();
        // 退出后再等一会进入下一步
        setTimeout(() => nextStep(), 1500);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      // 没有进入模块（超时跳过），直接下一步
      const timer = setTimeout(() => nextStep(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isInModule, exitModule, nextStep]);

  // 抑制 unused warning — 用于展示飞行目标的引用
  void MODULE_POSITIONS;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <OnboardingCard width={320} rounded="rounded-full" className="pointer-events-auto !p-4">
        <div className="text-center">
          <h3 className="text-base font-semibold text-white mb-1">{text.title}</h3>
          <p className="text-white/60 text-xs leading-relaxed">{text.description}</p>
        </div>
      </OnboardingCard>
    </div>
  );
}
