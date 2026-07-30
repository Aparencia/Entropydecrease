/**
 * ModuleTourToast — 模块首次进入时的提示 toast
 *
 * @ai-context: 通用组件：ModuleTourToast。
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODULE_INFO } from './onboardingConstants';
import type { ModuleId } from '@/lib/3d/navigation/OrbitalStore';

const TOUR_KEY_PREFIX = 'kb-module-tour-';

interface ModuleTourToastProps {
  moduleId: ModuleId | null;
}

export function ModuleTourToast({ moduleId }: ModuleTourToastProps) {
  const [visible, setVisible] = useState(false);
  const [currentModule, setCurrentModule] = useState<ModuleId | null>(null);

  useEffect(() => {
    if (!moduleId) {
      setVisible(false);
      return;
    }

    const key = `${TOUR_KEY_PREFIX}${moduleId}`;
    if (localStorage.getItem(key) === 'true') {
      setVisible(false);
      return;
    }

    // 首次进入：显示 toast
    localStorage.setItem(key, 'true');
    setCurrentModule(moduleId);
    setVisible(true);

    // 6秒后自动淡出
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [moduleId]);

  const info = MODULE_INFO.find((m) => m.id === currentModule);

  return (
    <AnimatePresence>
      {visible && info && (
        <motion.div
          initial={{ opacity: 0, x: 40, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          className="fixed top-20 right-6 z-50 w-[280px] backdrop-blur-2xl bg-white/10 dark:bg-black/30 border border-white/20 rounded-2xl p-4 shadow-xl"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: info.color }}
            />
            <span className="text-white font-medium text-sm">
              {info.number} {info.name}
            </span>
          </div>
          <p className="text-white/60 text-xs leading-relaxed">{info.description}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
