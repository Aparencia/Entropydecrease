/**
 * SonarAlertCard — 预警声呐（提醒与自动化卡）
 *
 * 覆盖原 ReminderSettings 全部 6 项：预警时点/滴答/自动开始休息/自动续潜/声音提醒/通知。
 * 即改即存：开关与选择 onChange 直接回调页面层。
 *
 * @ai-context: 深潜设置页改造——预警声呐卡，主题化文案。
 */
import { Bell, Zap } from 'lucide-react';
import { Toggle, SettingRow } from '../shared';
import type { PomodoroSettings } from '../../../store/pomodoroStoreTypes';
import type { DiveProfileStats } from '../../../hooks/useDiveProfile';

interface SonarAlertCardProps {
  localSettings: PomodoroSettings;
  onToggle: (key: string) => void;
  onWarningMinutesChange: (minutes: number) => void;
  stats: DiveProfileStats;
}

export function SonarAlertCard({
  localSettings,
  onToggle,
  onWarningMinutesChange,
  stats,
}: SonarAlertCardProps) {
  return (
    <div className="rounded-kb-lg border border-border/40 bg-bg-secondary/60 p-kb-md">
      <div className="flex items-center gap-2 mb-kb-sm">
        <Bell className="w-icon-sm h-icon-sm text-semantic-warning" strokeWidth={1.5} />
        <h2 className="text-h3 font-medium text-text-primary">预警声呐</h2>
      </div>
      {stats.alertInsight && (
        <p className="text-c1 text-brand-500 mb-kb-sm">✨ {stats.alertInsight}</p>
      )}

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
        <SettingRow label="自动开始休息" description="工作结束后自动进入休息">
          <Toggle
            checked={localSettings.autoStartBreak}
            onChange={() => onToggle('autoStartBreak')}
          />
        </SettingRow>
        <SettingRow label="自动续潜" description="休息结束后自动开始下一个番茄">
          <Toggle
            checked={localSettings.autoStartWork}
            onChange={() => onToggle('autoStartWork')}
          />
        </SettingRow>
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

      {/* 自动化分组标注 */}
      <div className="mt-kb-sm pt-kb-sm border-t border-border/30 flex items-center gap-1.5 text-c1 text-text-tertiary">
        <Zap className="w-3 h-3" strokeWidth={1.5} />
        自动化：自动开始休息 / 自动续潜
      </div>
    </div>
  );
}