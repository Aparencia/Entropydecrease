/**
 * outputDeviceMonitor 纯逻辑单元测试
 *
 * @ai-context: 覆盖 computeChunkRms（RMS 计算含空/静音/满幅边界）与
 * SilenceTracker（连续静音诊断触发一次、有声复位后可再次诊断）。
 * 设备枚举/订阅为浏览器副作用不在此测试。
 */
import { describe, it, expect } from 'vitest';
import { computeChunkRms, SilenceTracker } from './outputDeviceMonitor';

/** 构造指定幅值的 PCM Float32 音频块 */
function makeChunk(amplitude: number, length = 1024): ArrayBuffer {
  const samples = new Float32Array(length).fill(amplitude);
  return samples.buffer;
}

describe('computeChunkRms', () => {
  it('空缓冲区应返回 0', () => {
    // Arrange
    const empty = new Float32Array(0).buffer;
    // Act & Assert
    expect(computeChunkRms(empty)).toBe(0);
  });

  it('全零（数字静音）应返回 0', () => {
    // Arrange
    const silent = makeChunk(0);
    // Act & Assert
    expect(computeChunkRms(silent)).toBe(0);
  });

  it('恒定幅值信号的 RMS 应等于该幅值', () => {
    // Arrange
    const chunk = makeChunk(0.5);
    // Act
    const rms = computeChunkRms(chunk);
    // Assert
    expect(rms).toBeCloseTo(0.5, 5);
  });
});

describe('SilenceTracker', () => {
  const SILENT = 0.0001; // 低于静音阈值 0.0005
  const VOICED = 0.02;   // 高于静音阈值

  it('连续静音恰好达到 4 块时触发一次诊断', () => {
    // Arrange
    const tracker = new SilenceTracker();
    // Act & Assert：前 3 块不触发
    expect(tracker.push(SILENT)).toBe(false);
    expect(tracker.push(SILENT)).toBe(false);
    expect(tracker.push(SILENT)).toBe(false);
    // 第 4 块恰好触发
    expect(tracker.push(SILENT)).toBe(true);
    expect(tracker.isSilent).toBe(true);
  });

  it('已诊断后继续静音不重复触发', () => {
    // Arrange
    const tracker = new SilenceTracker();
    for (let i = 0; i < 4; i++) tracker.push(SILENT);
    // Act & Assert
    expect(tracker.push(SILENT)).toBe(false);
    expect(tracker.push(SILENT)).toBe(false);
  });

  it('有声块复位状态，之后再次持续静音可重新诊断', () => {
    // Arrange
    const tracker = new SilenceTracker();
    for (let i = 0; i < 4; i++) tracker.push(SILENT);
    // Act：有声复位
    expect(tracker.push(VOICED)).toBe(false);
    expect(tracker.isSilent).toBe(false);
    // Assert：再次连续静音 4 块可再触发
    for (let i = 0; i < 3; i++) expect(tracker.push(SILENT)).toBe(false);
    expect(tracker.push(SILENT)).toBe(true);
  });

  it('reset 清空计数与诊断状态', () => {
    // Arrange
    const tracker = new SilenceTracker();
    for (let i = 0; i < 4; i++) tracker.push(SILENT);
    // Act
    tracker.reset();
    // Assert
    expect(tracker.isSilent).toBe(false);
    for (let i = 0; i < 3; i++) expect(tracker.push(SILENT)).toBe(false);
    expect(tracker.push(SILENT)).toBe(true);
  });
});
