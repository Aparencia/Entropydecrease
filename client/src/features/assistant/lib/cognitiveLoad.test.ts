/**
 * cognitiveLoad 单元测试
 * Unit tests for cognitiveLoad
 *
 * @ai-context: 覆盖 EMA 平滑（含冷启动直通）与迟滞状态机（进入/保持/退出）。
 * @ai-context: Covers EMA smoothing (incl. cold-start passthrough) and the
 * hysteresis state machine (enter / hold / exit).
 */
import { describe, it, expect } from 'vitest';
import {
  createLoadEstimator,
  updateLoadSmoothed,
  advanceLoadState,
} from './cognitiveLoad';
import { LOAD_EMA_ALPHA, LOAD_HIGH_THRESHOLD, LOAD_RECOVER_THRESHOLD } from '../constants';

describe('updateLoadSmoothed', () => {
  it('冷启动首个样本直接采用瞬时值', () => {
    const s = createLoadEstimator();
    expect(updateLoadSmoothed(s, 88, false)).toBe(88);
  });

  it('后续样本按 EMA 系数平滑', () => {
    const s = { smoothed: 60, overloaded: false };
    // 0.3*100 + 0.7*60 = 72
    expect(updateLoadSmoothed(s, 100, true)).toBe(Math.round(LOAD_EMA_ALPHA * 100 + (1 - LOAD_EMA_ALPHA) * 60));
  });

  it('输入被限定在 0-100', () => {
    const s = createLoadEstimator();
    expect(updateLoadSmoothed(s, 999, false)).toBe(100);
    expect(updateLoadSmoothed(s, -50, false)).toBe(0);
  });
});

describe('advanceLoadState（迟滞状态机）', () => {
  it('越过进入阈值 → 锁存过载并报告 justEntered', () => {
    const s = createLoadEstimator();
    const r = advanceLoadState(s, LOAD_HIGH_THRESHOLD);
    expect(r.justEntered).toBe(true);
    expect(r.state.overloaded).toBe(true);
  });

  it('未达进入阈值 → 保持常态', () => {
    const s = createLoadEstimator();
    const r = advanceLoadState(s, LOAD_HIGH_THRESHOLD - 1);
    expect(r.justEntered).toBe(false);
    expect(r.state.overloaded).toBe(false);
  });

  it('已过载且仍高 → 不重复触发', () => {
    const s = { smoothed: LOAD_HIGH_THRESHOLD, overloaded: true };
    const r = advanceLoadState(s, LOAD_HIGH_THRESHOLD + 10);
    expect(r.justEntered).toBe(false);
    expect(r.state.overloaded).toBe(true);
  });

  it('已过载但仅小幅回落（未达恢复阈值）→ 仍锁存', () => {
    const s = { smoothed: LOAD_HIGH_THRESHOLD, overloaded: true };
    const r = advanceLoadState(s, LOAD_RECOVER_THRESHOLD + 5);
    expect(r.justEntered).toBe(false);
    expect(r.state.overloaded).toBe(true);
  });

  it('降至恢复阈值以下 → 解锁，且再次越过进入阈值可重新触发', () => {
    const s = { smoothed: LOAD_HIGH_THRESHOLD, overloaded: true };
    const exit = advanceLoadState(s, LOAD_RECOVER_THRESHOLD);
    expect(exit.state.overloaded).toBe(false);
    const reenter = advanceLoadState(exit.state, LOAD_HIGH_THRESHOLD);
    expect(reenter.justEntered).toBe(true);
  });
});
