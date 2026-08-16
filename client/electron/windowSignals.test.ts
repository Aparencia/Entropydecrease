// @vitest-environment node
/**
 * 窗口信号层测试（注入式：native 数据由调用方传入，本模块不依赖 electron）
 * @ai-context: 覆盖 HWND 解析、native 索引构建、几何信号计算、信号缺失降级。
 */
import { describe, it, expect } from 'vitest';
import { parseHwndFromSourceId, buildNativeIndex, resolveGeometrySignals } from './windowSignals.js';

describe('parseHwndFromSourceId', () => {
  it('解析标准 desktopCapturer id', () => {
    expect(parseHwndFromSourceId('window:123456:0')).toBe('123456');
  });
  it('非 window 前缀返回 null', () => {
    expect(parseHwndFromSourceId('screen:0:0')).toBeNull();
    expect(parseHwndFromSourceId('')).toBeNull();
    expect(parseHwndFromSourceId(null as unknown as string)).toBeNull();
  });
  it('畸形 id 返回 null', () => {
    expect(parseHwndFromSourceId('window:')).toBeNull();
    expect(parseHwndFromSourceId('window:abc:0')).toBe('abc');
  });
});

describe('buildNativeIndex', () => {
  it('按 hwnd 字符串建索引', () => {
    const idx = buildNativeIndex([
      { hwnd: '111', processName: 'chrome.exe', width: 1280, height: 720, alwaysOnTop: false },
    ]);
    expect(idx.get('111')?.processName).toBe('chrome.exe');
    expect(idx.size).toBe(1);
  });
  it('空输入返回空 Map', () => {
    expect(buildNativeIndex([]).size).toBe(0);
  });
});

describe('resolveGeometrySignals', () => {
  it('计算宽高比与面积占比', () => {
    const s = resolveGeometrySignals(
      { hwnd: '1', processName: 'chrome.exe', width: 1280, height: 720, alwaysOnTop: true },
      1920 * 1080,
    );
    expect(s.aspectRatio).toBeCloseTo(16 / 9, 5);
    expect(s.areaRatio).toBeCloseTo(1280 * 720 / (1920 * 1080), 5);
    expect(s.alwaysOnTop).toBe(true);
  });
  it('native 缺失（undefined）时返回空信号（降级）', () => {
    expect(resolveGeometrySignals(undefined, 1920 * 1080)).toEqual({});
  });
  it('显示器面积为 0 时避免除零', () => {
    const s = resolveGeometrySignals(
      { hwnd: '1', processName: 'x.exe', width: 100, height: 100, alwaysOnTop: false },
      0,
    );
    expect(s.areaRatio).toBeUndefined();
  });
});