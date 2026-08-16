/**
 * IpcSileroVad 单元测试 — 并发合并、概率缓存、不可用降级
 *
 * @ai-context: 锁定渲染进程封装的行为契约：同一时刻最多 1 个在途请求
 * （新块合并待发、保留最新）；概率记录带时间戳并可窗口聚合；主进程报告
 * 不可用后停止发送；reset/dispose 清空状态。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IpcSileroVad } from './sileroVad';

/** 可控 resolve 的 IPC mock */
function installIpcMock() {
  const pending: Array<(value: { probability: number | null; available: boolean }) => void> = [];
  const mock = vi.fn(
    (_args: { samples: ArrayBuffer; sampleRate?: number; reset?: boolean }) =>
      new Promise<{ probability: number | null; available: boolean }>((resolve) => {
        pending.push(resolve);
      }),
  );
  (window as unknown as { electronAPI: { vad_silero_process: typeof mock } }).electronAPI = {
    vad_silero_process: mock,
  };
  return { mock, pending };
}

describe('IpcSileroVad — 概率缓存与聚合', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    // 清理 window mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electronAPI;
  });

  it('latestProb 返回最近一次推理概率；recentProb 返回窗口均值', async () => {
    // Arrange
    const { mock, pending } = installIpcMock();
    const vad = new IpcSileroVad();
    // Act：两块，概率 0.2 / 0.6
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    pending[0]({ probability: 0.2, available: true });
    await vi.advanceTimersByTimeAsync(0);
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    pending[1]({ probability: 0.6, available: true });
    await vi.advanceTimersByTimeAsync(0);
    // Assert
    expect(vad.latestProb()).toBe(0.6);
    expect(vad.recentProb(1000)).toBeCloseTo(0.4, 5);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('在途时新块合并待发：仅保留最新块，总请求数有界', async () => {
    // Arrange
    const { mock, pending } = installIpcMock();
    const vad = new IpcSileroVad();
    // Act：连续 3 块（第 2、3 块在途合并）
    vad.push(new Float32Array(1600));
    vad.push(new Float32Array(1600));
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    expect(mock).toHaveBeenCalledTimes(1);
    pending[0]({ probability: 0.5, available: true });
    await vi.advanceTimersByTimeAsync(0);
    // 合并后仅再发 1 次（最新块）
    expect(mock).toHaveBeenCalledTimes(2);
    expect(vad.latestProb()).toBe(0.5);
  });

  it('主进程报告不可用后停止发送并返回 null 概率', async () => {
    // Arrange
    const { mock, pending } = installIpcMock();
    const vad = new IpcSileroVad();
    // Act
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    pending[0]({ probability: null, available: false });
    await vi.advanceTimersByTimeAsync(0);
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    // Assert：不可用后不再发送
    expect(mock).toHaveBeenCalledTimes(1);
    expect(vad.latestProb()).toBeNull();
    expect(vad.recentProb(1000)).toBeNull();
  });

  it('reset 清空概率记录并携带 reset 标志通知主进程', async () => {
    // Arrange
    const { mock, pending } = installIpcMock();
    const vad = new IpcSileroVad();
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    pending[0]({ probability: 0.8, available: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(vad.latestProb()).toBe(0.8);
    // Act
    vad.reset();
    // Assert：概率清空；reset 调用携带 reset 标志（第 2 次调用）
    expect(vad.latestProb()).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0].reset).toBe(true);
  });

  it('dispose 后不再发送', async () => {
    // Arrange
    const { mock } = installIpcMock();
    const vad = new IpcSileroVad();
    vad.dispose();
    // Act
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    // Assert
    expect(mock).not.toHaveBeenCalled();
  });

  it('无 electronAPI 环境时静默降级', async () => {
    // Arrange：不安装 electronAPI mock
    const vad = new IpcSileroVad();
    // Act
    vad.push(new Float32Array(1600));
    await vi.advanceTimersByTimeAsync(0);
    // Assert
    expect(vad.latestProb()).toBeNull();
  });
});
