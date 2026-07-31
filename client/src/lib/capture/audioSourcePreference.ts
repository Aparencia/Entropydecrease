/**
 * 音频源偏好持久化
 *
 * @ai-context: 见 ADR-001。偏好由用户在设置页选择，采集启动时读取并经
 * audio_capture_start 传给主进程参与选源；主进程无法访问 localStorage，
 * 故必须由渲染进程读取后传递（与 aiConfig.gatewayUrl 同一模式）。
 * @ai-context: 读写全程静默降级——localStorage 不可用（隐私模式/配额满）
 * 时回落到 'auto'，绝不因偏好读取失败阻断采集启动。
 */

import type { AudioSourcePreference } from './audioSourceStrategy';

/** localStorage key（不可改，否则用户设置丢失） */
export const AUDIO_SOURCE_PREFERENCE_KEY = 'keban_audio_source_preference';

const VALID: readonly AudioSourcePreference[] = ['auto', 'force_process', 'force_endpoint'];

/** 读取音频源偏好；无效或读取失败均返回 'auto' */
export function getAudioSourcePreference(): AudioSourcePreference {
  try {
    const raw = localStorage.getItem(AUDIO_SOURCE_PREFERENCE_KEY);
    if (raw && (VALID as readonly string[]).includes(raw)) {
      return raw as AudioSourcePreference;
    }
  } catch { /* 静默降级 */ }
  return 'auto';
}

/** 保存音频源偏好 */
export function setAudioSourcePreference(preference: AudioSourcePreference): void {
  try {
    localStorage.setItem(AUDIO_SOURCE_PREFERENCE_KEY, preference);
  } catch { /* 静默降级 */ }
}

/** 偏好项的用户可读说明（设置页展示用） */
export const AUDIO_SOURCE_PREFERENCE_LABELS: Record<
  AudioSourcePreference,
  { label: string; hint: string }
> = {
  auto: {
    label: '自动（推荐）',
    hint: '锁定具体窗口时只采该窗口的声音（隔离其他应用杂音）；采集整屏时采系统全部声音',
  },
  force_process: {
    label: '仅目标窗口声音',
    hint: '始终只采集目标窗口所在应用的声音，不受系统音量影响；换用其他播放器时可能采不到',
  },
  force_endpoint: {
    label: '系统全部声音',
    hint: '采集电脑正在播放的所有声音，不会漏采；其他应用的提示音也会被一并录入',
  },
};
