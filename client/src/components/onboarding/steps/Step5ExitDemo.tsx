/**
 * Step5ExitDemo — 退出教学
 *
 * @ai-context: 通用组件：Step5ExitDemo。
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { OnboardingCard } from '../OnboardingCard';
import { useOnboardingStore } from '../useOnboardingStore';
import { STEP_TEXTS } from '../onboardingConstants';
import { useOrbitalStore } from '@/lib/3d/navigation/OrbitalStore';

export function Step5ExitDemo() {
  const { nextStep, autoDemo } = useOnboardingStore();
  // 细粒度 selector：避免 hoveredModule 等高频字段连带重渲染
  const isInModule = useOrbitalStore((s) => s.isInModule);
  const exitModule = useOrbitalStore((s) => s.exitModule);
  const navigate = useNavigate();
  const text = STEP_TEXTS[4];

  const handleExit = () => {
    if (isInModule) {
      exitModule();
      navigate('/');
    }
    nextStep();
  };

  // 监听 Esc 键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleExit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // 自动演示模式下3秒后自动下一步
  useEffect(() => {
    if (autoDemo) {
      const timer = setTimeout(() => {
        if (isInModule) {
          exitModule();
          navigate('/');
        }
        nextStep();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [autoDemo, isInModule, exitModule, navigate, nextStep]);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <OnboardingCard width={360} className="pointer-events-auto">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white mb-2">{text.title}</h3>
          <p className="text-white/70 text-sm leading-relaxed mb-4">{text.description}</p>

          {/* 动画 Esc 键图标 */}
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="inline-flex items-center justify-center mb-4"
          >
            <span className="px-4 py-2 rounded-lg bg-white/15 border border-white/30 text-white font-mono text-lg font-bold">
              Esc
            </span>
          </motion.div>

          {!autoDemo && (
            <button
              onClick={handleExit}
              className="block mx-auto px-6 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition-colors"
            >
              退出并继续 →
            </button>
          )}
        </div>
      </OnboardingCard>
    </div>
  );
}
