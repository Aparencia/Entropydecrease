/**
 * behaviorMetrics 单元测试
 * Unit tests for behaviorMetrics
 *
 * @ai-context: 覆盖滚动窗口指标计算、打字骤降比例、A1 情绪分级与 A5 瞬时负荷分。
 * @ai-context: Covers rolling-window metrics, typing drop ratio, A1 emotion
 * grading and A5 instant load score.
 */
import { describe, it, expect } from 'vitest';
import {
  createBehaviorWindow,
  pruneWindow,
  computeMetrics,
  typingDropRatio,
  assessEmotionLevel,
  instantLoadScore,
  type BehaviorWindow,
} from './behaviorMetrics';
import {
  STAGNATION_THRESHOLD_MS,
  TYPING_DROP_RATIO,
  SWITCH_BURST_COUNT,
} from '../constants';

const NOW = 1_000_000;

/** 构造均匀击键窗口：count 次击键，间隔 gapMs，deletesAt 指定删除样本下标 */
function makeWindow(count: number, gapMs: number, deletesAt: number[] = []): BehaviorWindow {
  const win = createBehaviorWindow();
  for (let i = 0; i < count; i++) {
    win.keys.push({ t: NOW - (count - 1 - i) * gapMs, isDelete: deletesAt.includes(i) });
  }
  win.lastKeyAt = win.keys.length > 0 ? win.keys[win.keys.length - 1].t : null;
  return win;
}

describe('pruneWindow', () => {
  it('剔除窗口外样本且不改原对象', () => {
    const win = makeWindow(10, 1000);
    win.routeSwitches.push(NOW - 100, NOW - 999_999);
    const pruned = pruneWindow(win, NOW, 5000);
    expect(pruned.keys.every(k => k.t >= NOW - 5000)).toBe(true);
    expect(pruned.routeSwitches).toEqual([NOW - 100]);
    expect(win.keys.length).toBe(10); // 原对象不变
  });
});

describe('computeMetrics', () => {
  it('空窗口返回零值与无限静默', () => {
    const m = computeMetrics(createBehaviorWindow(), NOW);
    expect(m.keyRatePerMin).toBe(0);
    expect(m.deleteRatio).toBe(0);
    expect(m.silenceMs).toBe(Infinity);
    expect(m.burstRatio).toBe(0);
  });

  it('正确计算速率/删除比/爆发比', () => {
    // 10 次击键、间隔 200ms（全部算爆发）、其中 3 次删除
    const win = makeWindow(10, 200, [0, 3, 6]);
    const m = computeMetrics(win, NOW);
    expect(m.deleteRatio).toBeCloseTo(0.3);
    expect(m.burstRatio).toBe(1); // 9 个间隔全部 <500ms
    expect(m.silenceMs).toBe(0);
    // 跨度 1800ms 内 10 次 → ≈333 次/分钟
    expect(m.keyRatePerMin).toBeCloseTo((10 / 1800) * 60000, 0);
  });

  it('慢击键不计入爆发', () => {
    const win = makeWindow(4, 1000);
    const m = computeMetrics(win, NOW);
    expect(m.burstRatio).toBe(0);
  });
});

describe('typingDropRatio', () => {
  it('基线无效时返回 0', () => {
    expect(typingDropRatio(100, 0)).toBe(0);
    expect(typingDropRatio(100, -5)).toBe(0);
  });
  it('正常计算并限定 [0,1]', () => {
    expect(typingDropRatio(60, 100)).toBeCloseTo(0.4);
    expect(typingDropRatio(150, 100)).toBe(0); // 变快不算骤降
  });
});

describe('assessEmotionLevel', () => {
  const base = computeMetrics(makeWindow(10, 200), NOW);

  it('无输入焦点时不干预', () => {
    expect(assessEmotionLevel({ metrics: base, dropRatio: 1, hasInputFocus: false })).toBeNull();
  });

  it('长时间停滞 → 重度(3)', () => {
    const win = makeWindow(2, 200);
    win.lastKeyAt = NOW - STAGNATION_THRESHOLD_MS - 1;
    const m = computeMetrics(win, NOW);
    expect(assessEmotionLevel({ metrics: m, dropRatio: 0, hasInputFocus: true })).toBe(3);
  });

  it('高删除占比 → 中度(2)', () => {
    const win = makeWindow(10, 200, [0, 1, 2, 3]); // 40% 删除 ≥ DELETE_KEY_RATIO
    const m = computeMetrics(win, NOW);
    expect(assessEmotionLevel({ metrics: m, dropRatio: 0, hasInputFocus: true })).toBe(2);
  });

  it('打字骤降 → 轻度(1)', () => {
    expect(assessEmotionLevel({ metrics: base, dropRatio: TYPING_DROP_RATIO, hasInputFocus: true })).toBe(1);
  });

  it('从未击键（仅阅读）不判停滞', () => {
    const m = computeMetrics(createBehaviorWindow(), NOW);
    expect(assessEmotionLevel({ metrics: m, dropRatio: 0, hasInputFocus: true })).toBeNull();
  });
});

describe('instantLoadScore', () => {
  it('安静窗口为 0 分', () => {
    expect(instantLoadScore(computeMetrics(createBehaviorWindow(), NOW))).toBe(0);
  });

  it('全信号拉满为 100 分', () => {
    const win = makeWindow(10, 200, [0, 1, 2, 3]); // 爆发+高删除
    win.routeSwitches = Array.from({ length: SWITCH_BURST_COUNT }, (_, i) => NOW - i * 1000);
    expect(instantLoadScore(computeMetrics(win, NOW))).toBe(100);
  });

  it('单一切换信号给出部分分且限定范围', () => {
    const win = makeWindow(2, 1000);
    win.routeSwitches = [NOW - 1000];
    const score = instantLoadScore(computeMetrics(win, NOW));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
    // 1 次切换 = 0.4 * (1/SWITCH_BURST_COUNT) * 100
    expect(score).toBe(Math.round((1 / SWITCH_BURST_COUNT) * 0.4 * 100));
  });

  it('爆发比达到阈值即满分（只计爆发权重分）', () => {
    // 间隔 400ms（<500ms 算爆发）但删除/切换为 0 → burstRatio=1 ≥ 阈值
    const win = makeWindow(5, 400);
    const score = instantLoadScore(computeMetrics(win, NOW));
    expect(score).toBe(Math.round(0.35 * 100));
  });
});
