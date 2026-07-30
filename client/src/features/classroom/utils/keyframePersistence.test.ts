/**
 * keyframePersistence 单元测试
 * 覆盖：非 Electron 环境防护、保存成功回填 fileUrl、保存失败静默降级
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Dispatch, SetStateAction } from 'react';
import { persistKeyframeImage } from './keyframePersistence';
import type { KeyFrame, SessionBundle } from '@/lib/capture';

type ElectronAPI = Window['electronAPI'];

function makeKeyframe(): KeyFrame {
  return {
    id: 'kf-1',
    timestamp: 1000,
    imageBase64: 'aW1n',
    changeType: 'slide_change',
  };
}

function setElectronAPI(api: unknown): void {
  (window as { electronAPI?: unknown }).electronAPI = api;
}

describe('persistKeyframeImage', () => {
  const originalElectronAPI = (window as { electronAPI?: ElectronAPI }).electronAPI;

  afterEach(() => {
    setElectronAPI(originalElectronAPI);
    vi.restoreAllMocks();
  });

  it('should return early without throwing when electronAPI is absent (non-Electron env)', () => {
    // Arrange: 浏览器 / PWA 环境无 window.electronAPI
    setElectronAPI(undefined);
    const setBundle = vi.fn();

    // Act & Assert: 不应抛 "Cannot read properties of undefined"
    expect(() => persistKeyframeImage('s-1', makeKeyframe(), setBundle)).not.toThrow();
    expect(setBundle).not.toHaveBeenCalled();
  });

  it('should back-fill fileUrl on keyframe and bundle when save succeeds', async () => {
    // Arrange
    const invoke = vi.fn().mockResolvedValue({ url: 'keyframe://s-1/kf-1.jpg' });
    setElectronAPI({ invoke });
    const kf = makeKeyframe();
    let bundle: Partial<SessionBundle> = { keyframes: [kf] };
    const setBundle: Dispatch<SetStateAction<Partial<SessionBundle>>> = vi.fn(
      (action: SetStateAction<Partial<SessionBundle>>) => {
        bundle = typeof action === 'function' ? action(bundle) : action;
      },
    );

    // Act
    persistKeyframeImage('s-1', kf, setBundle);
    await vi.waitFor(() => expect(setBundle).toHaveBeenCalled());

    // Assert: IPC 参数正确 + 事件对象与 bundle 均回填 fileUrl
    expect(invoke).toHaveBeenCalledWith('keyframe_save', {
      sessionId: 's-1',
      keyframeId: 'kf-1',
      imageBase64: 'aW1n',
    });
    expect(kf.fileUrl).toBe('keyframe://s-1/kf-1.jpg');
    expect(bundle.keyframes?.[0].fileUrl).toBe('keyframe://s-1/kf-1.jpg');
  });

  it('should warn silently on save failure without updating bundle', async () => {
    // Arrange
    const invoke = vi.fn().mockRejectedValue(new Error('disk full'));
    setElectronAPI({ invoke });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setBundle = vi.fn();

    // Act
    persistKeyframeImage('s-1', makeKeyframe(), setBundle);
    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());

    // Assert: 静默降级，不更新 bundle
    expect(setBundle).not.toHaveBeenCalled();
  });
});
