/**
 * PresetTabs — 番茄钟预设横向标签栏
 *
 * 从 PomodoroPage 内联 JSX 抽取并 React.memo 化（P3-19）：番茄钟每秒 tick
 * 会触发父组件重渲染，但标签栏仅依赖 presets/activePresetId，与倒计时无关，
 * memo 后避免每秒重建 motion.button 列表。
 *
 * @ai-context: 设置页/番茄钟组件：PresetTabs。纯展示 + 回调上抛，无内部状态。
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, PenLine, BookMarked, Brain, Timer, Moon, Coffee, Dumbbell, Music, Languages, Calculator, Microscope, GraduationCap, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/animation/springConfig';
import type { PomodoroPreset } from '@/types/models';

/** 预设图标映射（lucide 图标名 → 组件） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRESET_ICONS: Record<string, React.ComponentType<any>> = {
  GraduationCap, BookOpen, PenLine, BookMarked, Brain, Timer,
  Moon, Coffee, Dumbbell, Music, Languages, Calculator, Microscope,
};

interface PresetTabsProps {
  presets: PomodoroPreset[];
  activePresetId?: string;
  canCreate: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export default memo(function PresetTabs({ presets, activePresetId, canCreate, onSelect, onCreate }: PresetTabsProps) {
  return (
    <motion.div
      className="flex items-center gap-0.5 p-1 bg-bg-secondary/60 backdrop-blur-sm rounded-full border border-border/20 max-w-full overflow-x-auto"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, ...SPRING.gentle }}
    >
      {presets.map((preset) => {
        const Icon = PRESET_ICONS[preset.icon] ?? BookOpen;
        const isActive = activePresetId === preset.id;
        return (
          <motion.button
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            whileTap={{ scale: 0.97 }}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-300 whitespace-nowrap',
              isActive
                ? 'text-white shadow-[0_2px_12px_rgba(91,138,114,0.3)]'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {isActive && (
              <motion.div
                layoutId="pomo-mode-bg"
                className="absolute inset-0 rounded-full bg-brand-500"
                transition={SPRING.default}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {preset.name}
              <span className={cn('text-[10px] opacity-60', isActive && 'opacity-80')}>· {preset.workDuration}min</span>
            </span>
          </motion.button>
        );
      })}
      {/* "+" 快捷创建预设入口（达上限时隐藏） */}
      {canCreate && (
        <motion.button
          onClick={onCreate}
          whileTap={{ scale: 0.9 }}
          className="flex items-center justify-center w-8 h-8 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/60 transition-all duration-200 flex-shrink-0"
          aria-label="新建预设"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
      )}
    </motion.div>
  );
});
