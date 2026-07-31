/**
 * @ai-context: 音频源偏好持久化单测。重点覆盖"读取失败/非法值必须回落
 * 到 auto"——偏好读取绝不能阻断采集启动（见 audioSourcePreference 头注）。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getAudioSourcePreference,
  setAudioSourcePreference,
  AUDIO_SOURCE_PREFERENCE_KEY,
  AUDIO_SOURCE_PREFERENCE_LABELS,
} from './audioSourcePreference';

describe('audioSourcePreference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未设置时默认 auto', () => {
    expect(getAudioSourcePreference()).toBe('auto');
  });

  it('可写入并读回三种合法值', () => {
    for (const value of ['auto', 'force_process', 'force_endpoint'] as const) {
      setAudioSourcePreference(value);
      expect(getAudioSourcePreference()).toBe(value);
    }
  });

  it('存储中的非法值回落到 auto', () => {
    localStorage.setItem(AUDIO_SOURCE_PREFERENCE_KEY, 'force_microphone');
    expect(getAudioSourcePreference()).toBe('auto');
  });

  it('localStorage 读取抛错时回落到 auto 而非抛出', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => getAudioSourcePreference()).not.toThrow();
    expect(getAudioSourcePreference()).toBe('auto');
  });

  it('localStorage 写入抛错时静默降级而非抛出', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => setAudioSourcePreference('force_process')).not.toThrow();
  });

  it('每种偏好都有非空的标签与说明（设置页依赖）', () => {
    for (const value of ['auto', 'force_process', 'force_endpoint'] as const) {
      const { label, hint } = AUDIO_SOURCE_PREFERENCE_LABELS[value];
      expect(label.length).toBeGreaterThan(0);
      expect(hint.length).toBeGreaterThan(0);
    }
  });
});
