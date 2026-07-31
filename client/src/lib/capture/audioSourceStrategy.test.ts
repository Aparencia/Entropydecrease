/**
 * @ai-context: 选源策略单测。覆盖 ADR-001 定义的全部决策分支——
 * 麦克风独立链、强制偏好（含不支持时的降级）、auto 下"锁定窗口→进程环回 /
 * 整屏→端点环回"的互补取舍。
 */
import { describe, it, expect } from 'vitest';
import {
  selectAudioSource,
  isWindowSource,
  describeAudioSource,
  type AudioSourceSelectionInput,
} from './audioSourceStrategy';

const supported = { processLoopbackAvailable: true };
const unsupported = { processLoopbackAvailable: false };

function decide(overrides: Partial<AudioSourceSelectionInput> = {}) {
  return selectAudioSource({
    capabilities: supported,
    sourceId: 'window:12345:0',
    ...overrides,
  });
}

describe('isWindowSource', () => {
  it('仅 window: 前缀视为锁定了具体窗口', () => {
    expect(isWindowSource('window:12345:0')).toBe(true);
    expect(isWindowSource('screen:0:0')).toBe(false);
    expect(isWindowSource(null)).toBe(false);
    expect(isWindowSource('')).toBe(false);
  });
});

describe('selectAudioSource — 麦克风场景', () => {
  it('麦克风场景独立成链，不参与环回选源且无降级', () => {
    const d = decide({ microphone: true, capabilities: unsupported, sourceId: null });
    expect(d.kind).toBe('microphone');
    expect(d.fallback).toBeNull();
  });

  it('麦克风优先级高于强制环回偏好', () => {
    const d = decide({ microphone: true, preference: 'force_process' });
    expect(d.kind).toBe('microphone');
  });
});

describe('selectAudioSource — 用户强制偏好', () => {
  it('强制端点环回时始终用端点环回', () => {
    const d = decide({ preference: 'force_endpoint' });
    expect(d.kind).toBe('endpoint_loopback');
    expect(d.fallback).toBeNull();
  });

  it('强制进程环回且环境支持时用进程环回，并保留端点降级', () => {
    const d = decide({ preference: 'force_process', sourceId: 'screen:0:0' });
    expect(d.kind).toBe('process_loopback');
    expect(d.fallback).toBe('endpoint_loopback');
  });

  it('强制进程环回但环境不支持时降级端点环回，理由说明原因', () => {
    const d = decide({ preference: 'force_process', capabilities: unsupported });
    expect(d.kind).toBe('endpoint_loopback');
    expect(d.reason).toContain('不支持');
  });
});

describe('selectAudioSource — auto 策略', () => {
  it('锁定具体窗口时选进程环回（隔离杂音），降级为端点环回', () => {
    const d = decide();
    expect(d.kind).toBe('process_loopback');
    expect(d.fallback).toBe('endpoint_loopback');
  });

  it('整屏采集时选端点环回（避免漏采跨应用声音）', () => {
    const d = decide({ sourceId: 'screen:0:0' });
    expect(d.kind).toBe('endpoint_loopback');
  });

  it('未指定源时选端点环回', () => {
    const d = decide({ sourceId: null });
    expect(d.kind).toBe('endpoint_loopback');
  });

  it('环境不支持进程环回时选端点环回，理由标明环境限制', () => {
    const d = decide({ capabilities: unsupported });
    expect(d.kind).toBe('endpoint_loopback');
    expect(d.reason).toContain('Windows 10 2004+');
  });

  it('所有分支都给出非空决策理由（供会话元数据归因）', () => {
    const cases: Partial<AudioSourceSelectionInput>[] = [
      {},
      { sourceId: null },
      { capabilities: unsupported },
      { preference: 'force_endpoint' },
      { preference: 'force_process' },
      { preference: 'force_process', capabilities: unsupported },
      { microphone: true },
    ];
    for (const c of cases) {
      expect(decide(c).reason.length).toBeGreaterThan(0);
    }
  });
});

describe('describeAudioSource', () => {
  it('三种源都有用户可读名称', () => {
    expect(describeAudioSource('process_loopback')).toContain('目标窗口');
    expect(describeAudioSource('endpoint_loopback')).toContain('全部声音');
    expect(describeAudioSource('microphone')).toBe('麦克风');
  });
});
