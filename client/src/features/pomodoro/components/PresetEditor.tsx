/**
 * PresetEditor — 番茄预设创建/编辑弹窗
 *
 * 表单字段：名称、图标、专注/短休/长休时长、长休间隔、静默开关。
 * 底部实时预览循环标记数量。
 *
 * @ai-context: 新增组件，供 PomodoroPage "+"按钮和设置页编辑按钮调用。
 * 图标选择网格预置 13 个学习相关 lucide 图标。
 * @ai-context: Preset create/edit modal with live cycle-marker preview.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GraduationCap, BookOpen, PenLine, BookMarked, Brain, Timer, Moon, Coffee, Dumbbell, Music, Languages, Calculator, Microscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input } from '@/components/ui';
import CycleMarkers from './CycleMarkers';
import type { PomodoroPreset } from '@/types/models';

/** 可选图标列表 */
const ICON_OPTIONS = [
  { name: 'GraduationCap', Icon: GraduationCap },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'PenLine', Icon: PenLine },
  { name: 'BookMarked', Icon: BookMarked },
  { name: 'Brain', Icon: Brain },
  { name: 'Timer', Icon: Timer },
  { name: 'Moon', Icon: Moon },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Dumbbell', Icon: Dumbbell },
  { name: 'Music', Icon: Music },
  { name: 'Languages', Icon: Languages },
  { name: 'Calculator', Icon: Calculator },
  { name: 'Microscope', Icon: Microscope },
] as const;

interface PresetEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<PomodoroPreset, 'id' | 'sortOrder' | 'createdAt' | 'builtin'>) => void;
  /** 编辑模式时传入已有预设 */
  initial?: PomodoroPreset | null;
}

export default function PresetEditor({ open, onClose, onSave, initial }: PresetEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'BookOpen');
  const [workDuration, setWorkDuration] = useState(initial?.workDuration ?? 25);
  const [shortBreak, setShortBreak] = useState(initial?.shortBreakDuration ?? 5);
  const [longBreak, setLongBreak] = useState(initial?.longBreakDuration ?? 15);
  const [interval, setInterval_] = useState(initial?.longBreakInterval ?? 4);
  const [silent, setSilent] = useState(initial?.silent ?? false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim().slice(0, 8),
      icon,
      workDuration: Math.max(1, Math.min(180, workDuration)),
      shortBreakDuration: Math.max(1, Math.min(60, shortBreak)),
      longBreakDuration: Math.max(1, Math.min(60, longBreak)),
      longBreakInterval: Math.max(0, Math.min(12, interval)),
      silent,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* 背景遮罩 */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

          {/* 弹窗主体 */}
          <motion.div
            className="relative w-full max-w-md bg-bg-elevated rounded-2xl border border-border/30 shadow-xl p-6 max-h-[85vh] overflow-y-auto"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-h3 font-semibold text-text-primary">
                {initial ? '编辑预设' : '新建预设'}
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-bg-secondary text-text-tertiary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 名称 */}
              <Input
                label="预设名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：刷题、背单词"
                maxLength={8}
              />

              {/* 图标选择 */}
              <div>
                <p className="text-b2 font-medium text-text-primary mb-2">图标</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {ICON_OPTIONS.map(({ name: iconName, Icon }) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setIcon(iconName)}
                      className={cn(
                        'p-2 rounded-lg flex items-center justify-center transition-all',
                        icon === iconName
                          ? 'bg-brand-500 text-white shadow-sm'
                          : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary',
                      )}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  ))}
                </div>
              </div>

              {/* 时长设置 */}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="专注（分钟）"
                  type="number"
                  value={String(workDuration)}
                  onChange={(e) => setWorkDuration(parseInt(e.target.value) || 0)}
                  min={1}
                  max={180}
                />
                <Input
                  label="短休（分钟）"
                  type="number"
                  value={String(shortBreak)}
                  onChange={(e) => setShortBreak(parseInt(e.target.value) || 0)}
                  min={1}
                  max={60}
                />
                <Input
                  label="长休（分钟）"
                  type="number"
                  value={String(longBreak)}
                  onChange={(e) => setLongBreak(parseInt(e.target.value) || 0)}
                  min={1}
                  max={60}
                />
                <Input
                  label="长休间隔"
                  type="number"
                  value={String(interval)}
                  onChange={(e) => setInterval_(parseInt(e.target.value) || 0)}
                  min={0}
                  max={12}
                  suffix={<span className="text-text-tertiary text-c1">个</span>}
                />
              </div>
              <p className="text-c1 text-text-tertiary -mt-2">
                长休间隔 = 0 表示不设长休（类似上课模式）
              </p>

              {/* 静默开关 */}
              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-b2 text-text-primary">静默模式</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={silent}
                  onClick={() => setSilent(!silent)}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    silent ? 'bg-brand-600' : 'bg-bg-tertiary border border-border/50',
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                    silent && 'translate-x-5',
                  )} />
                </button>
              </label>

              {/* 循环标记预览 */}
              <div className="pt-2 border-t border-border/20">
                <p className="text-c1 text-text-tertiary mb-2">循环标记预览</p>
                <CycleMarkers total={interval > 0 ? interval : 4} filled={1} />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 mt-6">
              <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={!name.trim()}>
                {initial ? '保存' : '创建'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
