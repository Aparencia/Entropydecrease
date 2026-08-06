/**
 * 深潜设置页 — 时长设置 + 上课模式区块
 *
 * @ai-context: 从 PomodoroSettingsPage 拆分。时长修改经 handleSave 同步到
 * 当前活动预设（预设驱动实际计时）；课堂时长同步到「上课」静默预设。
 */
import { Brain, GraduationCap, Timer } from 'lucide-react';
import { Card, Input } from '@/components/ui';
import { SettingsBlock } from './shared';
import type { PomodoroSettings } from '../../store/pomodoroStoreTypes';

interface DurationSettingsProps {
  localSettings: PomodoroSettings;
  activePresetName: string | null;
  aiRecommendedDuration?: number;
  aiReasoning?: string;
  onDurationChange: (key: string, value: string) => void;
}

export function DurationSettings({
  localSettings,
  activePresetName,
  aiRecommendedDuration,
  aiReasoning,
  onDurationChange,
}: DurationSettingsProps) {
  return (
    <>
      <SettingsBlock className="mb-kb-md">
        <Card variant="default" padding="lg">
          <div className="flex items-center gap-2 mb-kb-md">
            <Timer className="w-icon-sm h-icon-sm text-pomodoro" strokeWidth={1.5} />
            <h2 className="text-h3 font-medium text-text-primary">时长设置</h2>
          </div>
          <p className="text-c1 text-text-tertiary mb-kb-md">
            修改会同时应用到当前活动预设「{activePresetName ?? '默认'}」；课堂时长应用到「上课」预设。
          </p>

          <div className="space-y-kb-md">
            {/* AI 推荐时长提示 */}
            {aiRecommendedDuration != null && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-kb-md bg-brand-50 border border-brand-200/30">
                <Brain className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--kb-focus-blue)' }} />
                <p className="text-c1 text-text-secondary">
                  <span className="font-medium" style={{ color: 'var(--kb-focus-blue)' }}>AI 推荐 {aiRecommendedDuration} 分钟</span>
                  {aiReasoning && <span className="ml-1 text-text-tertiary">— {aiReasoning}</span>}
                </p>
              </div>
            )}
            <Input
              label="工作时长（自习模式）"
              type="number"
              value={String(localSettings.workDuration)}
              onChange={(e) => onDurationChange('workDuration', e.target.value)}
              min={1}
              max={180}
              suffix={<span className="text-text-tertiary text-b3">分钟</span>}
            />
            <Input
              label="短休息"
              type="number"
              value={String(localSettings.shortBreakDuration)}
              onChange={(e) => onDurationChange('shortBreakDuration', e.target.value)}
              min={1}
              max={60}
              suffix={<span className="text-text-tertiary text-b3">分钟</span>}
            />
            <Input
              label="长休息"
              type="number"
              value={String(localSettings.longBreakDuration)}
              onChange={(e) => onDurationChange('longBreakDuration', e.target.value)}
              min={1}
              max={60}
              suffix={<span className="text-text-tertiary text-b3">分钟</span>}
            />
            <Input
              label="长休息间隔"
              type="number"
              value={String(localSettings.longBreakInterval)}
              onChange={(e) => onDurationChange('longBreakInterval', e.target.value)}
              min={0}
              max={12}
              suffix={<span className="text-text-tertiary text-b3">个番茄</span>}
            />
          </div>
        </Card>
      </SettingsBlock>

      <SettingsBlock className="mb-kb-md">
        <Card variant="default" padding="lg">
          <div className="flex items-center gap-2 mb-kb-md">
            <GraduationCap className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
            <h2 className="text-h3 font-medium text-text-primary">上课模式设置</h2>
          </div>
          <p className="text-c1 text-text-tertiary mb-kb-md">
            上课模式下，使用固定课堂时长，课间自动短休，不进入长休息。
          </p>
          <div className="space-y-kb-md">
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
        </Card>
      </SettingsBlock>
    </>
  );
}
