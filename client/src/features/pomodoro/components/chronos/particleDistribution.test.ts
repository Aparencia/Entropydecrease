/**
 * particleDistribution — 静态分布预计算测试
 *
 * @ai-context: computeStaticDistribution 纯函数：八种分布输出合法性与归一化正确性。
 */
import { describe, it, expect } from 'vitest';
import { computeStaticDistribution, type ParticleBase } from './particleDistribution';
import type { Distribution } from './particleMorphs';

/** 构造确定性基础参数（固定种子，避免随机波动） */
function makeBase(count: number): ParticleBase {
  const theta0 = new Float32Array(count);
  const phi0 = new Float32Array(count);
  const u = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // 黄金比例伪随机：确定性序列
    const seed = (i * 0.6180339887) % 1;
    theta0[i] = seed * Math.PI * 2;
    phi0[i] = Math.acos(2 * ((seed * 0.7 + 0.15) % 1) - 1);
    u[i] = (seed * 0.3 + 0.1) % 1;
  }
  return { theta0, phi0, u };
}

const ALL_DISTRIBUTIONS: Distribution[] = ['volume', 'shell', 'grid', 'helix', 'crystal', 'torrent', 'cluster', 'canopy'];

describe('computeStaticDistribution — 静态分布预计算', () => {
  it('八种分布输出均为有限值（无 NaN/Infinity）', () => {
    const base = makeBase(200);
    for (const dist of ALL_DISTRIBUTIONS) {
      const out = new Float32Array(200 * 3);
      computeStaticDistribution(dist, 1, base, out);
      for (let i = 0; i < out.length; i++) {
        expect(Number.isFinite(out[i])).toBe(true);
      }
    }
  });

  it('volume 归一化：任意半径 ≤ 1（R=1 预计算）', () => {
    const base = makeBase(200);
    const out = new Float32Array(200 * 3);
    computeStaticDistribution('volume', 1, base, out);
    for (let i = 0; i < 200; i++) {
      const r = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      expect(r).toBeLessThanOrEqual(1.0001);
    }
  });

  it('shell 归一化：半径落在 0.88-1.12 球壳区间', () => {
    const base = makeBase(200);
    const out = new Float32Array(200 * 3);
    computeStaticDistribution('shell', 1, base, out);
    for (let i = 0; i < 200; i++) {
      const r = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      expect(r).toBeGreaterThanOrEqual(0.88);
      expect(r).toBeLessThanOrEqual(1.12);
    }
  });

  it('cluster 归一化：半径落在 0.6-1.0 紧密球团区间', () => {
    const base = makeBase(200);
    const out = new Float32Array(200 * 3);
    computeStaticDistribution('cluster', 1, base, out);
    for (let i = 0; i < 200; i++) {
      const r = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      expect(r).toBeGreaterThanOrEqual(0.599);
      expect(r).toBeLessThanOrEqual(1.001);
    }
  });

  it('volume 低可见比例：半径分布按 visibleRatio 归一化（分母稳定）', () => {
    const base = makeBase(200);
    const out = new Float32Array(200 * 3);
    computeStaticDistribution('volume', 0.45, base, out);
    for (let i = 0; i < 200; i++) {
      const r = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      expect(r).toBeLessThanOrEqual(1.0001); // 分母不塌缩（旧 bug：visibleRatio 过小导致极端位置）
    }
  });
});
