/**
 * DashboardViewSwitcher — 三视图分段控制器（今日/成长/世界）
 *
 * 认知架构入口：一个视图 = 一个心理模式。切换即切换认知任务。
 * 双方案表面语言分支：deep-sea 毛玻璃胶囊 / aurora-dome 平面胶囊。
 * sticky 顶部常驻，保证切换入口随时可达。
 *
 * @ai-context: 首页三视图切换器。
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { HomeScheme } from '../../hooks/useHomeScheme';

export type DashboardView = 'today' | 'growth' | 'world';

const VIEW_TABS: Array<{ id: DashboardView; label: string }> = [
  { id: 'today', label: '今日' },
  { id: 'growth', label: '成长' },
  { id: 'world', label: '世界' },
];

interface DashboardViewSwitcherProps {
  view: DashboardView;
  onChange: (v: DashboardView) => void;
  scheme: HomeScheme;
}

export function DashboardViewSwitcher({ view, onChange, scheme }: DashboardViewSwitcherProps) {
  return (
    <div className="sticky top-0 z-20 max-w-[1100px] mx-auto px-6 pt-3 pb-1">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        role="tablist"
        aria-label="首页视图切换"
        className={cn(
          'flex items-center gap-1 p-1 w-fit mx-auto rounded-kb-lg border',
          scheme === 'deep-sea'
            ? 'bg-bg-secondary/80 backdrop-blur-sm border-border/40'
            : 'bg-bg-elevated shadow-kb-sm border-border/30',
        )}
      >
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'px-6 py-2 rounded-kb-md text-b2 font-medium',
              'transition-all duration-beat-x2 hover:scale-[1.02] active:scale-[0.98]',
              view === tab.id
                ? 'bg-bg-elevated text-text-primary shadow-kb-sm border border-border/30'
                : 'text-text-tertiary hover:text-text-secondary border border-transparent',
            )}
          >
            {tab.label}
          </button>
        ))}
      </motion.div>
    </div>
  );
}
