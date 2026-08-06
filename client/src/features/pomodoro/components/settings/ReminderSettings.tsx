/**
 * 深潜设置页 — 提示音与提醒 + 自动化 + 提醒方式区块
 *
 * @ai-context: 从 PomodoroSettingsPage 拆分，三个小 Card 聚合为一个文件。
 */
import { Bell, Zap } from 'lucide-react';
import { Card } from '@/components/ui';
import { SettingsBlock, SettingRow, Toggle } from './shared';
import type { PomodoroSettings } from '../../store/pomodoroStoreTypes';

interface ReminderSettingsProps {
  localSettings: PomodoroSettings;
  onToggle: (key: string) => void;
  onWarningMinutesChange: (minutes: number) => void;
}

export function ReminderSettings({ localSettings, onToggle, onWarningMinutesChange }: ReminderSettingsProps) {
  return (
    <>
      <SettingsBlock className="mb-kb-md">
        <Card variant="default" padding="lg">
          <div className="flex items-center gap-2 mb-kb-sm">
            <Bell className="w-icon-sm h-icon-sm text-semantic-warning" strokeWidth={1.5} />
            <h2 className="text-h3 font-medium text-text-primary">提示音与提醒</h2>
          </div>
          <div className="divide-y divide-border/30">
            <SettingRow label="预警时点" description="专注结束前多久提醒（0 = 关闭）">
              <select
                value={String(localSettings.warningMinutes ?? 5)}
                onChange={(e) => onWarningMinutesChange(parseInt(e.target.value, 10))}
                className="bg-bg-tertiary border border-border/50 rounded-kb-md px-2 py-1 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
              >
                <option value="0">关闭</option>
                <option value="3">3 分钟</option>
                <option value="5">5 分钟</option>
                <option value="10">10 分钟</option>
              </select>
            </SettingRow>
            <SettingRow label="最后 10 秒滴答" description="专注即将结束时的倒计时音效">
              <Toggle
                checked={localSettings.tickFinalEnabled ?? true}
                onChange={() => onToggle('tickFinalEnabled')}
              />
            </SettingRow>
          </div>
        </Card>
      </SettingsBlock>

      <SettingsBlock className="mb-kb-md">
        <Card variant="default" padding="lg">
          <div className="flex items-center gap-2 mb-kb-sm">
            <Zap className="w-icon-sm h-icon-sm text-semantic-warning" strokeWidth={1.5} />
            <h2 className="text-h3 font-medium text-text-primary">自动化</h2>
          </div>
          <div className="divide-y divide-border/30">
            <SettingRow label="自动开始休息" description="工作结束后自动进入休息">
              <Toggle
                checked={localSettings.autoStartBreak}
                onChange={() => onToggle('autoStartBreak')}
              />
            </SettingRow>
            <SettingRow label="自动开始下一个番茄" description="休息结束后自动开始工作">
              <Toggle
                checked={localSettings.autoStartWork}
                onChange={() => onToggle('autoStartWork')}
              />
            </SettingRow>
          </div>
        </Card>
      </SettingsBlock>

      <SettingsBlock className="mb-kb-xl">
        <Card variant="default" padding="lg">
          <div className="flex items-center gap-2 mb-kb-sm">
            <Bell className="w-icon-sm h-icon-sm text-brand-600" strokeWidth={1.5} />
            <h2 className="text-h3 font-medium text-text-primary">提醒方式</h2>
          </div>
          <div className="divide-y divide-border/30">
            <SettingRow label="声音提醒" description="阶段切换时播放提示音">
              <Toggle
                checked={localSettings.soundEnabled}
                onChange={() => onToggle('soundEnabled')}
              />
            </SettingRow>
            <SettingRow label="浏览器通知" description="通过系统通知提醒阶段切换">
              <Toggle
                checked={localSettings.notificationEnabled}
                onChange={() => onToggle('notificationEnabled')}
              />
            </SettingRow>
          </div>
        </Card>
      </SettingsBlock>
    </>
  );
}
