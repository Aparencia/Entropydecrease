/**
 * Step6Panorama — 全景总览：展示 2x3 模块网格
 *
 * @ai-context: 通用组件：Step6Panorama。
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { OnboardingCard } from '../OnboardingCard';
import { useOnboardingStore } from '../useOnboardingStore';
import { STEP_TEXTS, MODULE_INFO } from '../onboardingConstants';

export function Step6Panorama() {
  const { nextStep, autoDemo } = useOnboardingStore();
  const text = STEP_TEXTS[5];

  // 自动演示模式下3秒后自动下一步
  useEffect(() => {
    if (autoDemo) {
      const timer = setTimeout(() => nextStep(), 3000);
      return () => clearTimeout(timer);
    }
  }, [autoDemo, nextStep]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <OnboardingCard width={520} className="pointer-events-auto">
        <h3 className="text-lg font-semibold text-white mb-2">{text.title}</h3>
        <p className="text-white/70 text-sm mb-4">{text.description}</p>

        {/* 2x3 模块网格 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {MODULE_INFO.map((mod, i) => (
            <motion.div
              key={mod.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.2, type: 'spring', stiffness: 200, damping: 20 }}
              className="flex items-start gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10"
            >
              <span
                className="mt-0.5 w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: mod.color }}
              />
              <div>
                <div className="text-white text-xs font-medium">
                  {mod.number} {mod.name}
                </div>
                <div className="text-white/50 text-[10px] leading-tight mt-0.5">
                  {mod.description}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {!autoDemo && (
          <button
            onClick={nextStep}
            className="w-full px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition-colors"
          >
            下一步 →
          </button>
        )}
      </OnboardingCard>
    </div>
  );
}
