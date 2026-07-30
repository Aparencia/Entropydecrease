/**
 * Step7Shortcuts — 快捷键速查
 *
 * @ai-context: 通用组件：Step7Shortcuts。
 */
import { OnboardingCard } from '../OnboardingCard';
import { useOnboardingStore } from '../useOnboardingStore';
import { STEP_TEXTS, SHORTCUTS } from '../onboardingConstants';

export function Step7Shortcuts() {
  const { finishGuide } = useOnboardingStore();
  const text = STEP_TEXTS[6];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <OnboardingCard width={460} className="pointer-events-auto">
        <h3 className="text-lg font-semibold text-white mb-2">{text.title}</h3>
        <p className="text-white/70 text-sm mb-4">{text.description}</p>

        {/* 快捷键表格 */}
        <div className="space-y-2 mb-5">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/5">
              <span className="text-white/60 text-sm">{s.description}</span>
              <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white text-xs font-mono">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <button
          onClick={finishGuide}
          className="w-full px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-medium transition-colors"
        >
          开始使用
        </button>
      </OnboardingCard>
    </div>
  );
}
