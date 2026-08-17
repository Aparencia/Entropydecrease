/**
 * SmartSampler 感知哈希去重集成测试
 *
 * @ai-context
 * 中文：jsdom 不提供 OffscreenCanvas / createImageBitmap，此处通过
 * vi.stubGlobal 注入可控 mock：imageBuffer 首字节作为 seed，mock 的
 * getImageData 按 seed 生成确定性灰度图案，从而精确控制帧间 dHash
 * 汉明距离（seed1↔seed2 距离 64，seed1↔seed3 距离 3）。
 * English: jsdom lacks OffscreenCanvas / createImageBitmap; controllable
 * mocks are injected via vi.stubGlobal. The first byte of imageBuffer acts
 * as a seed, and the mocked getImageData renders deterministic grayscale
 * patterns per seed, giving precise control over inter-frame dHash Hamming
 * distances (seed1↔seed2 = 64, seed1↔seed3 = 3).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartSampler } from './smartSampler';
import type { ScreenshotData } from './captureTypes';

// ================================================================
// Mock：按 seed 生成确定性像素图案
// ================================================================

/** seed → 灰度图案：1=递增渐变；2=递减渐变（距 seed1 64 位）；3=距 seed1 3 位 */
function grayForSeed(seed: number, x: number, y: number, width: number): number {
  if (seed === 2) return (width - 1 - x) * 10;
  if (seed === 3 && y === 0) return [30, 20, 10, 0, 10, 20, 30, 40, 50][x];
  return x * 10;
}

class MockCtx {
  private seed = 0;

  drawImage(bitmap: { seed: number }): void {
    this.seed = bitmap.seed;
  }

  getImageData(_x: number, _y: number, w: number, h: number): { data: Uint8ClampedArray } {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = grayForSeed(this.seed, x, y, w);
        const o = (y * w + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    }
    return { data };
  }
}

class MockOffscreenCanvas {
  private readonly ctx = new MockCtx();

  constructor(public width: number, public height: number) {}

  getContext(): MockCtx {
    return this.ctx;
  }

  async convertToBlob(): Promise<Blob> {
    return new Blob(['jpeg-mock'], { type: 'image/jpeg' });
  }
}

/** 构造 ScreenshotData，imageBuffer 首字节为 seed */
function makeFrame(seed: number, changeScore: number, hasChanged = true): ScreenshotData {
  return {
    imageBuffer: new Uint8Array([seed]).buffer,
    width: 100,
    height: 80,
    hasChanged,
    changeScore,
  };
}

// ================================================================
// 测试
// ================================================================

describe('SmartSampler 感知哈希去重', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { seed: bytes[0] ?? 0, width: 100, height: 80, close: vi.fn() };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('连续相同帧仅采集 1 帧', async () => {
    const sampler = new SmartSampler();
    const f1 = await sampler.processFrame(makeFrame(1, 0.5));
    expect(f1).not.toBeNull();

    const f2 = await sampler.processFrame(makeFrame(1, 0.5));
    expect(f2).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(1);
  });

  it('内容不同的帧正常捕获', async () => {
    const sampler = new SmartSampler();
    const f1 = await sampler.processFrame(makeFrame(1, 0.5));
    const f2 = await sampler.processFrame(makeFrame(2, 0.5));
    expect(f1).not.toBeNull();
    expect(f2).not.toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(2);
  });

  it('定时兜底触发同样去重，且跳过时重置兜底计时', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const debugSpy = vi.spyOn(console, 'debug');
    const sampler = new SmartSampler();

    nowSpy.mockReturnValue(1_000_000);
    await sampler.processFrame(makeFrame(1, 0.5));
    expect(sampler.getKeyframes()).toHaveLength(1);

    // 16s 后静止画面触发兜底 → 感知哈希判定重复，跳过
    nowSpy.mockReturnValue(1_016_000);
    const f2 = await sampler.processFrame(makeFrame(1, 0, false));
    expect(f2).toBeNull();
    expect(debugSpy).toHaveBeenCalledWith(
      '[SmartSampler] 跳过帧：感知哈希重复',
      expect.stringContaining('distance='),
      expect.stringContaining('dupThreshold='),
      expect.any(String),
    );

    // 跳过时已重置 lastCaptureTime：100ms 后的帧不再触发兜底判定
    debugSpy.mockClear();
    nowSpy.mockReturnValue(1_016_100);
    const f3 = await sampler.processFrame(makeFrame(1, 0, false));
    expect(f3).toBeNull();
    expect(debugSpy).toHaveBeenCalledWith('[SmartSampler] 跳过帧：未满足捕获条件');
    expect(sampler.getKeyframes()).toHaveLength(1);
  });

  it('小差异帧（距离 3 ≤ 常规阈值 5）被跳过', async () => {
    const sampler = new SmartSampler();
    await sampler.processFrame(makeFrame(1, 0.5));
    const f2 = await sampler.processFrame(makeFrame(3, 0.5));
    expect(f2).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(1);
  });

  it('渐进板书帧使用收紧阈值：距离 3 > 2 仍正常捕获', async () => {
    const sampler = new SmartSampler();
    await sampler.processFrame(makeFrame(1, 0.5));
    // score 0.15 → writing 区间且由变化触发，收紧阈值 2 < 距离 3 → 捕获
    const f2 = await sampler.processFrame(makeFrame(3, 0.15));
    expect(f2).not.toBeNull();
    expect(f2!.changeType).toBe('writing');
    expect(sampler.getKeyframes()).toHaveLength(2);
  });

  it('changeThreshold 提升至 0.12：0.08–0.12 区间的变化不再触发落帧', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const sampler = new SmartSampler();

    nowSpy.mockReturnValue(1_000_000);
    await sampler.processFrame(makeFrame(1, 0.5));

    // 100ms 后变化分数 0.1（旧阈值会触发）→ 不满足新阈值且未到兜底间隔
    nowSpy.mockReturnValue(1_000_100);
    const f2 = await sampler.processFrame(makeFrame(2, 0.1));
    expect(f2).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(1);
  });

  it('reset 后哈希状态清空，相同帧可重新捕获', async () => {
    const sampler = new SmartSampler();
    await sampler.processFrame(makeFrame(1, 0.5));
    sampler.reset();
    const f2 = await sampler.processFrame(makeFrame(1, 0.5));
    expect(f2).not.toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(1);
  });

  it('P1-7 强制补帧：静止画面（无变化/未到兜底间隔）也能捕获', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const sampler = new SmartSampler();
    nowSpy.mockReturnValue(1_000_000);
    await sampler.processFrame(makeFrame(1, 0.5));
    expect(sampler.getKeyframes()).toHaveLength(1);

    // 静止画面 + 强制补帧 → 捕获新帧（变化检测门槛被跳过）
    nowSpy.mockReturnValue(1_000_100);
    sampler.forceNextCapture();
    const f2 = await sampler.processFrame(makeFrame(2, 0, false));
    expect(f2).not.toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(2);

    // 强制标志一次性消费：后续静止帧恢复跳过
    const f3 = await sampler.processFrame(makeFrame(1, 0, false));
    expect(f3).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(2);
  });

  it('P1-6 setConfig：运行中调整采样参数（技能类收紧变化阈值）', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const sampler = new SmartSampler();
    nowSpy.mockReturnValue(1_000_000);
    await sampler.processFrame(makeFrame(1, 0.5));

    // 默认阈值 0.12：0.1 变化不捕获
    nowSpy.mockReturnValue(1_000_100);
    expect(await sampler.processFrame(makeFrame(2, 0.1))).toBeNull();

    // 技能类参数：阈值 0.05 → 0.1 变化捕获
    sampler.setConfig({ changeThreshold: 0.05 });
    nowSpy.mockReturnValue(1_000_200);
    const f2 = await sampler.processFrame(makeFrame(3, 0.1));
    expect(f2).not.toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(2);
  });

  it('方案 C 双通道独立去重：幻灯片帧与板书帧互不干扰', async () => {
    const sampler = new SmartSampler();
    // slide 帧（score 0.7）入 slide 池
    const f1 = await sampler.processFrame(makeFrame(1, 0.7));
    expect(f1?.changeType).toBe('slide_change');

    // 相同内容的 scene 帧：board 池为空 → 不受 slide 池影响，正常捕获
    const f2 = await sampler.processFrame(makeFrame(1, 0.5));
    expect(f2).not.toBeNull();
    expect(f2!.changeType).toBe('scene_change');
    expect(sampler.getKeyframes()).toHaveLength(2);

    // 再次 slide 帧：slide 池命中（距离 0 ≤ 8）→ 跳过
    const f3 = await sampler.processFrame(makeFrame(1, 0.7));
    expect(f3).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(2);
  });

  it('方案 C 幻灯片帧放宽阈值：距离 3 ≤ 8 判重跳过（同页动画容忍）', async () => {
    const sampler = new SmartSampler();
    await sampler.processFrame(makeFrame(1, 0.7));
    // seed3 与 seed1 距离 3：slide 阈值 8 判重（旧实现阈值 5 也判重，此处验证通道路由）
    const f2 = await sampler.processFrame(makeFrame(3, 0.7));
    expect(f2).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(1);
  });

  it('方案 C 哈希池收集全部通道帧：距最旧帧近但距新帧远时不误判', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const sampler = new SmartSampler();
    nowSpy.mockReturnValue(1_000_000);
    // 帧 1（seed1）入 board 池
    await sampler.processFrame(makeFrame(1, 0.5));
    // 帧 2（seed2，距离 64）入池
    nowSpy.mockReturnValue(1_000_100);
    await sampler.processFrame(makeFrame(2, 0.5));
    // 帧 3（seed1 变体 seed3，距离 seed1=3、seed2=61）：与池中任一帧距离 3 > 阈值 2？
    // scene 帧阈值 5：3 ≤ 5 → 判重跳过（若仅对比上一帧 seed2 则距离 61 会被误采）
    nowSpy.mockReturnValue(1_000_200);
    const f3 = await sampler.processFrame(makeFrame(3, 0.5));
    expect(f3).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(2);
  });

  it('方案 C 跨池去重：静态 PPT 页 15s 兜底（periodic）不再重复捕获', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    const sampler = new SmartSampler();
    nowSpy.mockReturnValue(1_000_000);
    // slide 帧（score 0.7）入 slide 池
    const f1 = await sampler.processFrame(makeFrame(1, 0.7));
    expect(f1?.changeType).toBe('slide_change');

    // 16s 后同内容静止帧：periodic 兜底触发，跨池命中 slide 池 → 跳过（双池回归护栏）
    nowSpy.mockReturnValue(1_016_000);
    const f2 = await sampler.processFrame(makeFrame(1, 0, false));
    expect(f2).toBeNull();
    expect(sampler.getKeyframes()).toHaveLength(1);
  });
});
