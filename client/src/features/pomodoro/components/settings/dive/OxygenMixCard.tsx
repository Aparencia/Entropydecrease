/**
 * OxygenMixCard — 氧气配比（时长设置卡）
 *
 * 覆盖原 DurationSettings 全部设置项：自习时长/短休/长休/长休间隔 + 课堂时长。
 * 即改即存：数值输入 onChange 直接回调页面层。
 *
 * @ai-context: 深潜设置页改造——氧气配比卡，主题化文案。
 */
import { Timer, GraduationCap } from 'lucide-react';
import { Input } from '@/components/ui';
import type { PomodoroSettings } from '../../../store/pomodoroStoreTypes';
import type { DiveProfileStats } from '../../../hooks/useDiveProfile';

interface OxygenMixCardProps {
  localSettings: PomodoroSettings;
  activePresetName: string | null;
  onDurationChange: (key: string, value: string) => void;
  stats: DiveProfileStats;
}

export function OxygenMixCard({
  localSettings,
  activePresetName,
  onDurationChange,
  stats,
}: OxygenMixCardProps) {
  return (
    <div className="rounded-kb-lg border border-border/40 bg-bg-secondary/60 p-kb-md">
      <div className="flex items-center gap-2 mb-kb-sm">
        <Timer className="w-icon-sm h-icon-sm text-pomodoro" strokeWidth={1.5} />
        <h2 className="text-h3 font-medium text-text-primary">氧气配比</h2>
      </div>
      {stats.durationInsight && (
        <p className="text-c1 text-brand-500 mb-kb-md">✨ {stats.durationInsight}</p>
      )}

      <div className="space-y-kb-md">
        <Input
          label="专注时长（自习）"
          type="number"
          value={String(localSettings.workDuration)}
          onChange={(e) => onDurationChange('workDuration', e.target.value)}
          min={1}
          max={180}
          suffix={<span className="text-text-tertiary text-b3">分钟</span>}
        />
        <div className="grid grid-cols-2 gap-kb-md">
          <Input
            label="短休"
            type="number"
            value={String(localSettings.shortBreakDuration)}
            onChange={(e) => onDurationChange('shortBreakDuration', e.target.value)}
            min={1}
            max={60}
            suffix={<span className="text-text-tertiary text-b3">分钟</span>}
          />
          <Input
            label="长休"
            type="number"
            value={String(localSettings.longBreakDuration)}
            onChange={(e) => onDurationChange('longBreakDuration', e.target.value)}
            min={1}
            max={60}
            suffix={<span className="text-text-tertiary text-b3">分钟</span>}
          />
        </div>
        <Input
          label="长休间隔（0 = 无长休）"
          type="number"
          value={String(localSettings.longBreakInterval)}
          onChange={(e) => onDurationChange('longBreakInterval', e.target.value)}
          min={0}
          max={12}
          suffix={<span className="text-text-tertiary text-b3">个番茄</span>}
        />
      </div>

      {/* 上课模式（课堂时长） */}
      <div className="mt-kb-md pt-kb-md border-t border-border/30">
        <div className="flex items-center gap-2 mb-kb-sm">
          <GraduationCap className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
          <h3 className="text-b2 font-medium text-text-primary">上课模式</h3>
        </div>
        <p className="text-c1 text-text-tertiary mb-kb-md">
          课堂时长应用于「上课」预设（{activePresetName ?? '默认'}）
        </p>
        <Input
          label="课堂时长"
          type="number"
          value={String(localSettings.classDuration)}
          onChange={(e) => onDurationChange('classDuration', e.target.value)}
          min={10}
          max={120}
          suffix={<span className="text-text-tertiary text-b3">分钟</span>}
        />
      </div>
    </div>
  );
}