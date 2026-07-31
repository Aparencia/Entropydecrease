/**
 * @ai-context: 设置页组件：AudioCaptureSettings。课堂助手音频源偏好选择。
 * 选项语义见 ADR-001 的双源互补设计：进程环回"干净但可能漏采"、
 * 端点环回"不漏采但含全部系统声音"，故不设默认优劣，交由用户按场景选。
 * @ai-context: 偏好写 localStorage，采集启动时由 useSessionControl 读取并
 * 经 IPC 传给主进程（主进程无法访问 localStorage）。
 */
import { useState, useCallback } from 'react';
import { Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { Volume2, Check } from 'lucide-react';
import type { AudioSourcePreference } from '@/lib/capture/audioSourceStrategy';
import {
  getAudioSourcePreference,
  setAudioSourcePreference,
  AUDIO_SOURCE_PREFERENCE_LABELS,
} from '@/lib/capture/audioSourcePreference';

const OPTIONS: AudioSourcePreference[] = ['auto', 'force_process', 'force_endpoint'];

/**
 * 课堂助手音频采集设置
 *
 * 决定采集"仅目标窗口的声音"还是"系统全部声音"：
 * 前者可隔离 QQ/微信提示音等杂音且不受系统音量影响，
 * 后者不会漏采跨应用的声音。
 */
export default function AudioCaptureSettings() {
  const { toast } = useToast();
  const [preference, setPreference] = useState<AudioSourcePreference>(getAudioSourcePreference);

  const handleSelect = useCallback((next: AudioSourcePreference) => {
    if (next === preference) return;
    soundPlayer.play('ui_toggle_on');
    setPreference(next);
    setAudioSourcePreference(next);
    toast({ type: 'success', message: '音频采集方式已更新，下次开始采集时生效' });
  }, [preference, toast]);

  return (
    <Card padding="lg" variant="elevated">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-kb-md bg-brand-500/10 text-brand-500 flex items-center justify-center flex-shrink-0">
          <Volume2 className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-h3 font-semibold text-text-primary">课堂音频采集</h2>
          <p className="text-b3 text-text-tertiary mt-0.5">
            决定课堂助手采集哪些声音。仅 Windows 10 2004 及以上支持按窗口采集，
            不支持时会自动使用系统声音。
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {OPTIONS.map((option) => {
          const { label, hint } = AUDIO_SOURCE_PREFERENCE_LABELS[option];
          const active = preference === option;
          return (
            <button
              key={option}
              onClick={() => handleSelect(option)}
              className={cn(
                'w-full text-left px-4 py-3 rounded-kb-md border transition-colors duration-kb-fast',
                active
                  ? 'bg-brand-500/10 border-brand-400/50'
                  : 'bg-bg-secondary border-border-default hover:border-border-strong',
              )}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={cn('text-b2 font-medium', active ? 'text-brand-600' : 'text-text-primary')}>
                  {label}
                </span>
                {active && <Check className="w-icon-sm h-icon-sm text-brand-500 flex-shrink-0" strokeWidth={2} />}
              </div>
              <p className="text-c1 text-text-tertiary mt-1 leading-relaxed">{hint}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
