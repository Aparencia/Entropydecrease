/**
 * frameHash 单元测试 — dHash 纯函数核心
 *
 * @ai-context
 * 中文：jsdom 环境不提供 OffscreenCanvas，因此只测试可注入像素数据的
 * 纯函数核心（rgbaToGray / computeDHashFromGray / hammingDistance /
 * isSimilar）；Canvas 薄封装 computeFrameHash 在 smartSampler.test.ts
 * 中通过 mock 全局对象间接覆盖。
 * English: jsdom lacks OffscreenCanvas, so tests here cover the pure,
 * pixel-injectable core functions; the thin Canvas wrapper computeFrameHash
 * is covered indirectly in smartSampler.test.ts via global mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  DHASH_WIDTH,
  DHASH_HEIGHT,
  HASH_BITS,
  rgbaToGray,
  computeDHashFromGray,
  hammingDistance,
  isSimilar,
} from './frameHash';

/** 按 f(x, y) 生成 9×8 灰度网格（行优先） */
function makeGray(f: (x: number, y: number) => number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(DHASH_WIDTH * DHASH_HEIGHT);
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    for (let x = 0; x < DHASH_WIDTH; x++) {
      gray[y * DHASH_WIDTH + x] = f(x, y);
    }
  }
  return gray;
}

describe('rgbaToGray', () => {
  it('按 BT.601 加权将 RGBA 转为灰度', () => {
    // 纯白 + 纯黑 + 纯红 三个像素
    const rgba = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 0, 0, 255,
    ]);
    const gray = rgbaToGray(rgba);
    expect(gray).toHaveLength(3);
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
    expect(gray[2]).toBe(Math.round(255 * 0.299));
  });
});

describe('computeDHashFromGray', () => {
  it('相同图像哈希距离为 0', () => {
    const a = makeGray((x, y) => (x * 13 + y * 7) % 256);
    const b = makeGray((x, y) => (x * 13 + y * 7) % 256);
    const hashA = computeDHashFromGray(a);
    const hashB = computeDHashFromGray(b);
    expect(hashA).toBe(hashB);
    expect(hammingDistance(hashA, hashB)).toBe(0);
  });

  it('明显不同图像（渐变方向相反）距离为最大 64 位', () => {
    const asc = computeDHashFromGray(makeGray((x) => x * 10));
    const desc = computeDHashFromGray(makeGray((x) => (DHASH_WIDTH - 1 - x) * 10));
    expect(hammingDistance(asc, desc)).toBe(HASH_BITS);
  });

  it('局部微小差异产生小的汉明距离', () => {
    const base = makeGray((x) => x * 10);
    // 仅翻转第 0 行前 3 个相邻比较（30>20>10>0 递减，其余保持递增）
    const tweaked = makeGray((x, y) =>
      y === 0 ? [30, 20, 10, 0, 10, 20, 30, 40, 50][x] : x * 10,
    );
    const distance = hammingDistance(
      computeDHashFromGray(base),
      computeDHashFromGray(tweaked),
    );
    expect(distance).toBe(3);
  });
});

describe('hammingDistance / isSimilar', () => {
  it('正确统计不同位数量', () => {
    expect(hammingDistance(0n, 0n)).toBe(0);
    expect(hammingDistance(0n, 0b111n)).toBe(3);
    expect(hammingDistance(0b1010n, 0b0101n)).toBe(4);
  });

  it('阈值边界：常规阈值 5 判定重复，板书收紧阈值 2 判定不重复', () => {
    const a = 0n;
    const b = 0b111n; // 距离 3
    expect(isSimilar(a, b, 5)).toBe(true);
    expect(isSimilar(a, b, 2)).toBe(false);
    expect(isSimilar(a, b, 3)).toBe(true);
  });
});
