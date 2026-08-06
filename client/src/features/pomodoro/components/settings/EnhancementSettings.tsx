/**
 * 深潜设置页 — 体验增强区块（创新功能开关，全部缺省关闭）
 *
 * @ai-context: 从 PomodoroSettingsPage 拆分。所有开关写入 PomodoroSettings
 * 扩展字段（可选类型），关闭时不改变既有行为。
 */
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui';
import { SettingsBlock, SettingRow, Toggle } from './shared';
import type { PomodoroSettings } from '../../store/pomodoroStoreTypes';

interface EnhancementSettingsProps {
  localSettings: PomodoroSettings;
  onToggle: (key: string) => void;
}

export function EnhancementSettings({ localSettings, onToggle }: EnhancementSettingsProps) {
  return (
    <SettingsBlock className="mb-kb-xl">
      <Card variant="default" padding="lg">
        <div className="flex items-center gap-2 mb-kb-sm">
          <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
          <h2 className="text-h3 font-medium text-text-primary">体验增强</h2>
        </div>
        <p className="text-b2 text-text-tertiary mb-kb-md">
          可选增强功能，默认关闭；开启后不影响核心计时流程，随时可关闭。
        </p>

        <div className="divide-y divide-border/30">
          <SettingRow label="休息记忆重放" description="休息时展示本次专注目标的关键词，促进主动回忆巩固（沉浸模式）">
            <Toggle
              checked={localSettings.breakReplayEnabled ?? false}
              onChange={() => onToggle('breakReplayEnabled')}
            />
          </SettingRow>

          <SettingRow label="心流音乐" description="根据专注状态自动调整背景音乐（沉浸模式）">
            <Toggle
              checked={localSettings.flowMusicEnabled ?? false}
              onChange={() => onToggle('flowMusicEnabled')}
            />
          </SettingRow>

          <SettingRow label="守护灵联动" description="结合分心检测实时调节心流音乐（需在数字养生中开启专注守护灵）">
            <Toggle
              checked={localSettings.guardianLinkEnabled ?? false}
              onChange={() => onToggle('guardianLinkEnabled')}
            />
          </SettingRow>

          <SettingRow label="阶段音轨自动切换" description="休息时自动切换为休息推荐音轨，专注时切回">
            <Toggle
              checked={localSettings.autoSwitchAudioPhase ?? false}
              onChange={() => onToggle('autoSwitchAudioPhase')}
            />
          </SettingRow>
        </div>
      </Card>
    </SettingsBlock>
  );
}
