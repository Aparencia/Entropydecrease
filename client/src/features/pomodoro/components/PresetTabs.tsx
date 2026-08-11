/**
 * PresetTabs — 番茄钟预设横向标签栏
 *
 * 从 PomodoroPage 内联 JSX 抽取并 React.memo 化（P3-19）：番茄钟每秒 tick
 * 会触发父组件重渲染，但标签栏仅依赖 presets/activePresetId，与倒计时无关，
 * memo 后避免每秒重建 motion.button 列表。
 *
 * @ai-context: 设置页/番茄钟组件：PresetTabs。纯展示 + 回调上抛，无内部状态。
 */
import { memo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, PenLine, BookMarked, Brain, Timer, Moon, Coffee, Dumbbell, Music, Languages, Calculator, Microscope, GraduationCap, Plus, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { SPRING } from '@/lib/animation/springConfig';
import type { PomodoroPreset } from '@/types/models';
import PresetContextMenu from './PresetContextMenu';

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
  /** 预设管理入口（深潜设置页：删除/排序/编辑），省略时不渲染 */
  onManage?: () => void;
  /** 右键编辑预设 */
  onEditPreset?: (preset: PomodoroPreset) => void;
  /** 右键复制为新预设 */
  onDuplicatePreset?: (preset: PomodoroPreset) => void;
  /** 右键删除预设 */
  onDeletePreset?: (id: string) => void;
}

export default memo(function PresetTabs({ presets, activePresetId, canCreate, onSelect, onCreate, onManage, onEditPreset, onDuplicatePreset, onDeletePreset }: PresetTabsProps) {
  const [ctxMenu, setCtxMenu] = useState<{ preset: PomodoroPreset; x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, preset: PomodoroPreset) => {
    e.preventDefault();
    setCtxMenu({ preset, x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  return (
    <>
    <motion.div
      className="flex flex-col items-center gap-1 p-1.5 bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border/20 max-w-full"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, ...SPRING.gentle }}
    >
      <div className="grid grid-cols-4 gap-1 w-full max-w-[480px]">
        {presets.map((preset) => {
          const Icon = PRESET_ICONS[preset.icon] ?? BookOpen;
          const isActive = activePresetId === preset.id;
          return (
            <motion.button
              key={preset.id}
              onClick={() => onSelect(preset.id)}
              onContextMenu={(e) => handleContextMenu(e, preset)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'relative flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-300 whitespace-nowrap min-w-0',
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
              <span className="relative flex items-center gap-1 truncate">
                <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{preset.name}</span>
                <span className={cn('text-[9px] opacity-60 shrink-0', isActive && 'opacity-80')}>{preset.workDuration}min</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      {/* 操作按钮行 */}
      {(canCreate || onManage) && (
        <div className="flex items-center gap-1.5">
          {canCreate && (
            <Tip text="新建预设">
            <motion.button
              onClick={onCreate}
              whileTap={{ scale: 0.9 }}
              className="flex items-center justify-center w-7 h-7 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/60 transition-all duration-200"
              aria-label="新建预设"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            </motion.button>
            </Tip>
          )}
          {onManage && (
            <Tip text="预设管理（删除 / 排序）">
            <motion.button
              onClick={onManage}
              whileTap={{ scale: 0.9 }}
              className="flex items-center justify-center w-7 h-7 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/60 transition-all duration-200"
              aria-label="预设管理"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
            </motion.button>
            </Tip>
          )}
        </div>
      )}
    </motion.div>
      {/* 右键菜单 */}
      {ctxMenu && onEditPreset && onDuplicatePreset && onDeletePreset && (
        <PresetContextMenu
          preset={ctxMenu.preset}
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={closeCtxMenu}
          onEdit={onEditPreset}
          onDuplicate={onDuplicatePreset}
          onDelete={onDeletePreset}
        />
      )}
    </>
  );
});
