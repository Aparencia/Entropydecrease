/**
 * HelpCenter — 帮助中心主面板：4个Tab页签 + 毛玻璃样式
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Rocket, Keyboard, BookOpen, HelpCircle } from 'lucide-react';
import { useOnboardingStore } from './useOnboardingStore';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { QuickStartTab } from './help/QuickStartTab';
import { ShortcutsTab } from './help/ShortcutsTab';
import { ModuleGuideTab } from './help/ModuleGuideTab';
import { FAQTab } from './help/FAQTab';

const TABS = [
  { id: 'quickstart', label: '快速上手', icon: Rocket },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'modules', label: '模块详解', icon: BookOpen },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
] as const;

type TabId = (typeof TABS)[number]['id'];

const TAB_CONTENT: Record<TabId, React.FC> = {
  quickstart: QuickStartTab,
  shortcuts: ShortcutsTab,
  modules: ModuleGuideTab,
  faq: FAQTab,
};

export function HelpCenter() {
  const { isHelpOpen, closeHelp } = useOnboardingStore();
  const [activeTab, setActiveTab] = useState<TabId>('quickstart');

  // Esc 关闭帮助中心
  useEffect(() => {
    if (!isHelpOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeHelp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpOpen, closeHelp]);

  if (!isHelpOpen) return null;

  const ActiveContent = TAB_CONTENT[activeTab];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeHelp} />

      {/* 主面板 — 复用 FunctionalOverlay 毛玻璃样式 */}
      <motion.div
        className="relative z-10 w-full max-w-3xl max-h-[80vh] flex flex-col rounded-[24px_12px_20px_16px] bg-white/10 dark:bg-black/30 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white/90">帮助中心</h2>
          <button
            onClick={closeHelp}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
            aria-label="关闭帮助中心"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 页签 */}
        <div className="flex items-center gap-1 px-6 pt-3 pb-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { if (tab.id !== activeTab) soundPlayer.play('ui_tab_switch'); setActiveTab(tab.id); }}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white/90'
                    : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="help-tab-indicator"
                    className="absolute inset-0 rounded-lg bg-white/10 -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin scrollbar-thumb-white/10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <ActiveContent />
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
