/**
 * OnboardingOverlay — 主引导覆盖层，管理7个步骤的流转
 *
 * @ai-context: 通用组件：OnboardingOverlay。
 */
import { useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useOnboardingStore, isGuideDone } from './useOnboardingStore';
import { loadFirstDiveState } from '@/features/onboarding/firstDive/firstDiveStorage';
import { Step1Welcome } from './steps/Step1Welcome';
import { Step2Navigate } from './steps/Step2Navigate';
import { Step3CameraFlight } from './steps/Step3CameraFlight';
import { Step4FunctionalPanel } from './steps/Step4FunctionalPanel';
import { Step5ExitDemo } from './steps/Step5ExitDemo';
import { Step6Panorama } from './steps/Step6Panorama';
import { Step7Shortcuts } from './steps/Step7Shortcuts';

export function OnboardingOverlay() {
  const { isActive, currentStep, startGuide, nextStep, prevStep, skipGuide, autoDemo } =
    useOnboardingStore();

  // 初始化：检查 localStorage，若未完成则 1.5s 后自动启动
  // 首潜（L0/L1）未结束时不自动启动，避免双引导叠加轰炸新用户
  useEffect(() => {
    const diveStage = loadFirstDiveState().stage;
    if (diveStage === 'landing' || diveStage === 'diving') return;
    if (!isGuideDone()) {
      const timer = setTimeout(() => startGuide(), 1500);
      return () => clearTimeout(timer);
    }
  }, [startGuide]);

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;

      // 不拦截输入框中的按键（Step5 的 Esc 由该步骤自己处理）
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          nextStep();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevStep();
          break;
        case 'Enter':
          e.preventDefault();
          nextStep();
          break;
        case 'Escape':
          // Step5 自己处理 Esc，其他步骤跳过引导
          if (currentStep !== 4) {
            e.preventDefault();
            skipGuide();
          }
          break;
      }
    },
    [isActive, currentStep, nextStep, prevStep, skipGuide],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isActive) return null;

  const STEP_COMPONENTS = [
    <Step1Welcome key="s1" />,
    <Step2Navigate key="s2" />,
    <Step3CameraFlight key="s3" />,
    <Step4FunctionalPanel key="s4" />,
    <Step5ExitDemo key="s5" />,
    <Step6Panorama key="s6" />,
    <Step7Shortcuts key="s7" />,
  ];

  return (
    <>
      {/* 半透明遮罩 — 步骤0(欢迎)和步骤5(全景)和步骤6(快捷键)显示遮罩 */}
      {(currentStep === 0 || currentStep === 5 || currentStep === 6) && (
        <div className="fixed inset-0 z-40 bg-black/40 pointer-events-none" />
      )}

      {/* 当前步骤组件 */}
      <AnimatePresence mode="wait">
        {STEP_COMPONENTS[currentStep]}
      </AnimatePresence>

      {/* 步骤指示器 */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5">
        {STEP_COMPONENTS.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i === currentStep
                ? 'bg-indigo-400 w-4'
                : i < currentStep
                  ? 'bg-indigo-400/50'
                  : 'bg-white/20'
            }`}
          />
        ))}
      </div>

      {/* 自动演示模式提示 */}
      {autoDemo && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-indigo-500/30 backdrop-blur-sm border border-indigo-400/30 text-indigo-200 text-xs">
          自动演示中...
        </div>
      )}
    </>
  );
}
