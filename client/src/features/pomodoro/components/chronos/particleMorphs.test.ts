/**
 * particleMorphs — 形态描述符合成测试
 *
 * @ai-context: composeMorph 纯函数：六气质 × 五状态 × 双主题 合成正确性。
 */
import { describe, it, expect } from 'vitest';
import { composeMorph, STATE_BASE_MORPH } from './particleMorphs';

describe('composeMorph — 粒子形态合成', () => {
  it('沉睡态在任何气质下保持星云弥散（volume + drift，不维持球型）', () => {
    for (const mood of ['grid', 'flow', 'nebula', 'flame', 'crystal', 'torrent'] as const) {
      const morph = composeMorph(mood, 'asleep', 'deep-sea');
      expect(morph.distribution).toBe('volume');
      expect(morph.motion).toBe('drift');
      expect(morph.visibleRatio).toBeLessThan(1); // 仅部分粒子可见
    }
  });

  it('短休/长休保持种子团/树冠语义（任何气质不丢失）', () => {
    expect(composeMorph('flame', 'short_break', 'deep-sea').distribution).toBe('cluster');
    expect(composeMorph('torrent', 'long_break', 'deep-sea').distribution).toBe('canopy');
  });

  it('呼吸/专注态采用气质外形：grid=经纬网格、flame=螺旋、crystal=晶簇', () => {
    expect(composeMorph('grid', 'breathing', 'deep-sea').distribution).toBe('grid');
    expect(composeMorph('flame', 'focus', 'deep-sea').distribution).toBe('helix');
    expect(composeMorph('flame', 'focus', 'deep-sea').motion).toBe('spiral'); // 火焰专注=螺旋加速
    expect(composeMorph('crystal', 'breathing', 'deep-sea').distribution).toBe('crystal');
  });

  it('缺省 mood 回退 flow（自由流动壳）', () => {
    const morph = composeMorph(undefined, 'focus', 'deep-sea');
    expect(morph.distribution).toBe('shell');
    expect(morph.motion).toBe('flow');
  });

  it('专注态流速随气质与主题调制：flame 快于 flow，aurora 快于 deep-sea', () => {
    const flowDeep = composeMorph('flow', 'focus', 'deep-sea').flowSpeed;
    const flameDeep = composeMorph('flame', 'focus', 'deep-sea').flowSpeed;
    const flameAurora = composeMorph('flame', 'focus', 'aurora-dome').flowSpeed;
    expect(flameDeep).toBeGreaterThan(flowDeep);
    expect(flameAurora).toBeGreaterThan(flameDeep);
  });

  it('双主题差异化：deep-sea 粒子厚重（尺寸大透明度低），aurora 轻盈（尺寸小透明度高）', () => {
    const deep = composeMorph('flow', 'focus', 'deep-sea');
    const aurora = composeMorph('flow', 'focus', 'aurora-dome');
    expect(deep.size).toBeGreaterThan(aurora.size);
    expect(deep.opacity).toBeLessThan(aurora.opacity);
  });

  it('非专注态 flowSpeed 恒为 0（仅专注产生能量流）', () => {
    for (const state of ['asleep', 'breathing', 'short_break', 'long_break'] as const) {
      expect(composeMorph('torrent', state, 'deep-sea').flowSpeed).toBe(0);
    }
  });

  it('状态基础表覆盖全部五态且参数合法', () => {
    for (const state of ['asleep', 'breathing', 'focus', 'short_break', 'long_break'] as const) {
      const base = STATE_BASE_MORPH[state];
      expect(base.radius).toBeGreaterThan(0);
      expect(base.visibleRatio).toBeGreaterThan(0);
      expect(base.visibleRatio).toBeLessThanOrEqual(1);
    }
  });
});
