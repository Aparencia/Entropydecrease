/**
 * 音效与音频配置单元测试
 * Unit tests for sound effects and audio configuration
 *
 * @ai-context: 覆盖音效清单的按类别筛选/按 ID 查找、音轨按阶段过滤、
 * 音频偏好的默认值/合并加载/持久化，以及设备类型标签与 dB 偏移常量。
 * 无任何音频 I/O，localStorage 由 jsdom 提供。
 * @ai-context: Covers sound lookup by category/id, track filtering by
 * phase, audio preference defaults/merge/round-trip, and device type
 * constants. No audio I/O; localStorage comes from jsdom.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SOUND_DEFINITIONS,
  getSoundsByCategory,
  findSoundDefinition,
  audioTracks,
  getTracksForPhase,
  defaultAudioPreferences,
  loadAudioPreferences,
  saveAudioPreferences,
  DEVICE_TYPE_LABELS,
  DEVICE_TYPE_DB_OFFSET,
  DEFAULT_SOUND_SETTINGS,
  CATEGORY_LABELS,
} from './audioConfig';

describe('sound definitions', () => {
  it('should expose the full sound catalog', () => {
    expect(SOUND_DEFINITIONS.length).toBeGreaterThan(30);
    for (const def of SOUND_DEFINITIONS) {
      expect(def.id).toBeTruthy();
      expect(def.filePath).toMatch(/\.wav$/);
    }
  });

  it('should filter sounds by category', () => {
    const pomodoro = getSoundsByCategory('pomodoro');
    expect(pomodoro.length).toBeGreaterThan(0);
    expect(pomodoro.every((s) => s.category === 'pomodoro')).toBe(true);

    const operation = getSoundsByCategory('operation');
    expect(operation).toHaveLength(8);
  });

  it('should find a definition by id and return undefined when missing', () => {
    expect(findSoundDefinition('ui_click')?.name).toBe('通用点击');
    expect(findSoundDefinition('nope')).toBeUndefined();
  });

  it('should map every category to a label', () => {
    expect(CATEGORY_LABELS.pomodoro).toBe('深潜音效');
    expect(CATEGORY_LABELS.operation).toBe('操作音效');
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(6);
  });

  it('should ship a sane default settings shape', () => {
    expect(DEFAULT_SOUND_SETTINGS.masterMute).toBe(false);
    const categories = Object.values(DEFAULT_SOUND_SETTINGS.categories);
    expect(categories).toHaveLength(6);
    expect(categories.every((c) => c.enabled === true)).toBe(true);
  });
});

describe('audio tracks', () => {
  it('should resolve track src through the public asset url', () => {
    // 测试环境 BASE_URL='/'，路径应保持 /audio/...
    expect(audioTracks.length).toBe(11);
    expect(audioTracks[0].src).toBe('/audio/rain.mp3');
  });

  it('should filter tracks by phase including both', () => {
    const focus = getTracksForPhase('focus');
    const breakPhase = getTracksForPhase('break');
    expect(focus).toHaveLength(8);
    expect(breakPhase).toHaveLength(5);
    expect(focus.every((t) => t.phase === 'focus' || t.phase === 'both')).toBe(true);
    expect(breakPhase.every((t) => t.phase === 'break' || t.phase === 'both')).toBe(true);
  });
});

describe('audio preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return defaults when nothing is stored', () => {
    expect(loadAudioPreferences()).toEqual(defaultAudioPreferences);
  });

  it('should merge saved partial preferences over defaults', () => {
    // Arrange
    localStorage.setItem('kb_audio_preferences', JSON.stringify({ whiteNoiseEnabled: true, whiteNoiseVolume: 0.8 }));
    // Act
    const prefs = loadAudioPreferences();
    // Assert
    expect(prefs.whiteNoiseEnabled).toBe(true);
    expect(prefs.whiteNoiseVolume).toBe(0.8);
    expect(prefs.deviceType).toBe('headphones'); // 缺省字段保留默认
  });

  it('should round-trip saved preferences', () => {
    // Arrange
    const custom = { ...defaultAudioPreferences, bgmEnabled: true, deviceType: 'speakers' as const };
    // Act
    saveAudioPreferences(custom);
    // Assert
    expect(loadAudioPreferences()).toEqual(custom);
  });

  it('should fall back to defaults on corrupt storage', () => {
    localStorage.setItem('kb_audio_preferences', '{broken json');
    expect(loadAudioPreferences()).toEqual(defaultAudioPreferences);
  });
});

describe('device type constants', () => {
  it('should label every device type', () => {
    expect(DEVICE_TYPE_LABELS.headphones).toBe('头戴式耳机');
    expect(DEVICE_TYPE_LABELS.speakers).toBe('桌面音箱');
    expect(Object.keys(DEVICE_TYPE_LABELS)).toHaveLength(4);
  });

  it('should keep headphones as the zero-offset baseline', () => {
    expect(DEVICE_TYPE_DB_OFFSET.headphones).toBe(0);
    expect(DEVICE_TYPE_DB_OFFSET.earbuds).toBeGreaterThan(0);
    expect(DEVICE_TYPE_DB_OFFSET.speakers).toBeLessThan(0);
    expect(DEVICE_TYPE_DB_OFFSET.laptop).toBeLessThan(DEVICE_TYPE_DB_OFFSET.speakers);
  });
});
