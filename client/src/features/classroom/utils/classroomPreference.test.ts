/**
 * @ai-context: 课堂启动偏好持久化单测（P0-3）。重点覆盖"读取失败/非法值
 * 必须回落默认 smart+mixed"——偏好读取绝不能阻断课堂采集启动。
 * 测试风格克隆 audioSourcePreference.test.ts。
 * @ai-context: EN: launch-preference persistence tests; any read failure or
 * invalid value must fall back to the default smart+mixed so preference
 * loading never blocks capture startup.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  loadLaunchPref,
  saveLaunchPref,
  CLASSROOM_LAUNCH_PREF_KEY,
  DEFAULT_LAUNCH_PREF,
} from './classroomPreference';

describe('classroomPreference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未设置时返回默认 smart + mixed', () => {
    expect(loadLaunchPref()).toEqual({ capturePath: 'smart', mode: 'mixed' });
    expect(DEFAULT_LAUNCH_PREF).toEqual({ capturePath: 'smart', mode: 'mixed' });
  });

  it('保存后可正确读回合法值', () => {
    saveLaunchPref({ capturePath: 'full_record', mode: 'audio' });
    expect(loadLaunchPref()).toEqual({ capturePath: 'full_record', mode: 'audio' });
    saveLaunchPref({ capturePath: 'fine', mode: 'vision' });
    expect(loadLaunchPref()).toEqual({ capturePath: 'fine', mode: 'vision' });
  });

  it('JSON 损坏时回落默认且不抛错', () => {
    localStorage.setItem(CLASSROOM_LAUNCH_PREF_KEY, '{not-json');
    expect(() => loadLaunchPref()).not.toThrow();
    expect(loadLaunchPref()).toEqual(DEFAULT_LAUNCH_PREF);
  });

  it('capturePath 非法时整体回落默认', () => {
    localStorage.setItem(
      CLASSROOM_LAUNCH_PREF_KEY,
      JSON.stringify({ capturePath: 'turbo', mode: 'audio' }),
    );
    expect(loadLaunchPref()).toEqual(DEFAULT_LAUNCH_PREF);
  });

  it('mode 非法时整体回落默认', () => {
    localStorage.setItem(
      CLASSROOM_LAUNCH_PREF_KEY,
      JSON.stringify({ capturePath: 'smart', mode: 'super' }),
    );
    expect(loadLaunchPref()).toEqual(DEFAULT_LAUNCH_PREF);
  });

  it('字段缺失时回落默认', () => {
    localStorage.setItem(CLASSROOM_LAUNCH_PREF_KEY, JSON.stringify({ mode: 'audio' }));
    expect(loadLaunchPref()).toEqual(DEFAULT_LAUNCH_PREF);
  });

  it('localStorage 读取抛错时静默降级而非抛出', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => loadLaunchPref()).not.toThrow();
    expect(loadLaunchPref()).toEqual(DEFAULT_LAUNCH_PREF);
  });

  it('localStorage 写入抛错时静默降级而非抛出', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveLaunchPref({ capturePath: 'fine', mode: 'vision' })).not.toThrow();
  });
});
