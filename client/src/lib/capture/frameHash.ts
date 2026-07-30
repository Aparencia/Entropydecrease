/**
 * 关键帧感知哈希（dHash）— 帧间内容去重
 *
 * @ai-context
 * 中文：基于差值哈希（dHash）的关键帧去重工具。将 ImageBitmap 经
 * OffscreenCanvas 缩放到 9×8 灰度图，比较水平相邻像素亮度生成 64 位
 * 指纹（bigint），通过汉明距离判断两帧内容是否近似相同。核心算法
 * computeDHashFromGray 是可注入像素数据的纯函数，便于在 jsdom（无
 * OffscreenCanvas）环境下单测；Canvas 部分仅做薄封装。纯客户端计算，
 * 无任何网络/原生依赖。
 *
 * English: Perceptual difference-hash (dHash) utilities for keyframe
 * deduplication. An ImageBitmap is downscaled to a 9×8 grayscale grid via
 * OffscreenCanvas, and adjacent horizontal luminance comparisons produce a
 * 64-bit fingerprint (bigint). Hamming distance between fingerprints tells
 * whether two frames are visually near-identical. The core algorithm
 * computeDHashFromGray is a pure function accepting raw pixel data so it can
 * be unit-tested without OffscreenCanvas (jsdom); the Canvas layer is a thin
 * wrapper. Pure client-side computation with no network/native dependencies.
 */

// ================================================================
// 常量
// ================================================================

/** dHash 采样网格宽度（每行比较 8 对相邻像素，需 9 列） */
export const DHASH_WIDTH = 9;
/** dHash 采样网格高度 */
export const DHASH_HEIGHT = 8;
/** 哈希总位数：8 列差值 × 8 行 = 64 位 */
export const HASH_BITS = (DHASH_WIDTH - 1) * DHASH_HEIGHT;

// ================================================================
// 纯函数核心（可单测，无 Canvas 依赖）
// ================================================================

/**
 * RGBA 像素数组 → 灰度数组（ITU-R BT.601 加权）
 * @param rgba 长度为 pixelCount * 4 的 RGBA 数据
 */
export function rgbaToGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const pixelCount = rgba.length >> 2;
  const gray = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    gray[i] = Math.round(
      rgba[o] * 0.299 + rgba[o + 1] * 0.587 + rgba[o + 2] * 0.114,
    );
  }
  return gray;
}

/**
 * 从灰度像素计算 dHash（纯函数，可注入像素数据单测）
 * @param gray 长度为 width * height 的灰度数据（行优先）
 * @returns 64 位哈希（bigint），每位表示 gray[y][x] < gray[y][x+1]
 */
export function computeDHashFromGray(
  gray: ArrayLike<number>,
  width: number = DHASH_WIDTH,
  height: number = DHASH_HEIGHT,
): bigint {
  let hash = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      hash <<= 1n;
      if (gray[y * width + x] < gray[y * width + x + 1]) {
        hash |= 1n;
      }
    }
  }
  return hash;
}

/** 两个哈希间的汉明距离（不同位的数量） */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor !== 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/** 汉明距离 ≤ threshold 视为两帧内容近似相同 */
export function isSimilar(a: bigint, b: bigint, threshold: number): boolean {
  return hammingDistance(a, b) <= threshold;
}

// ================================================================
// Canvas 薄封装
// ================================================================

/**
 * 计算 ImageBitmap 的感知哈希（dHash）
 *
 * @ai-context
 * 中文：将位图缩放绘制到 9×8 OffscreenCanvas 后读取像素并调用纯函数
 * 计算哈希；不负责 bitmap.close()，由调用方管理生命周期以便复用位图。
 * English: Downscales the bitmap onto a 9×8 OffscreenCanvas, reads pixels
 * and delegates to the pure hash function. Does NOT close the bitmap —
 * caller owns its lifecycle so the bitmap can be reused for compression.
 *
 * @returns 64 位哈希；Canvas 不可用或读取失败时返回 null（调用方应放行该帧）
 */
export async function computeFrameHash(bitmap: ImageBitmap): Promise<bigint | null> {
  try {
    const canvas = new OffscreenCanvas(DHASH_WIDTH, DHASH_HEIGHT);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, DHASH_WIDTH, DHASH_HEIGHT);
    const { data } = ctx.getImageData(0, 0, DHASH_WIDTH, DHASH_HEIGHT);
    return computeDHashFromGray(rgbaToGray(data));
  } catch (err) {
    console.debug('[frameHash] 哈希计算失败，放行该帧', err);
    return null;
  }
}
