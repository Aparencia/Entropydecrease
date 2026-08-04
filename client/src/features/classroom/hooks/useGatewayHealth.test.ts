/**
 * useGatewayHealth 单元测试（P0-4 网关健康软阻断状态机）
 *
 * @ai-context: mock fetch 覆盖 ok / down / down→恢复放行三态，另含
 * 网关 URL 未配置视为 down（不发探针）、缓存优先、卸载清定时器、
 * 卸载后迟到探针响应不写共享缓存。
 * 每个用例 resetModules 取全新模块注册表，隔离 gatewayHealthCache 的
 * 模块级缓存，避免用例间互相污染。
 * @ai-context: Covers ok/down/recovery transitions with mocked fetch,
 * empty-URL short-circuit, cache-first path, interval cleanup and the
 * unmount guard (late probe responses must not write the shared cache);
 * fresh module registry per test isolates the shared health cache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// jsdom 部分版本缺少 AbortSignal.timeout：补齐以免探针构造参数时抛错
if (typeof (AbortSignal as { timeout?: unknown }).timeout !== 'function') {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout =
    () => new AbortController().signal;
}

/** 重置模块注册表后装配全新 store + hook（健康缓存随之归零） */
async function renderFresh(gatewayUrl: string) {
  vi.resetModules();
  const { useSettingsStore } = await import('@/stores/useSettingsStore');
  useSettingsStore.setState((s) => ({
    aiConfig: { ...s.aiConfig, gatewayUrl },
  }));
  const { useGatewayHealth } = await import('./useGatewayHealth');
  // 预检的异步 setState 可能落在微任务里：整体包进 act 抑制告警
  return await act(async () => renderHook(() => useGatewayHealth()));
}

/** 冲刷微任务，让探针 Promise 落定 */
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGatewayHealth', () => {
  it('网关可达：预检后进入 ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = await renderFresh('http://gateway.test');
    await flush();
    expect(result.current.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway.test/health/quick',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('网关不可达：进入 down 并挂 15s 自动复检定时器', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const intervalSpy = vi.spyOn(window, 'setInterval');
    const { result } = await renderFresh('http://gateway.test');
    await flush();
    expect(result.current.status).toBe('down');
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 15_000);
  });

  it('down→恢复：复检命中后自动放行并清除定时器', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const { result } = await renderFresh('http://gateway.test');
    await flush();
    expect(result.current.status).toBe('down');

    // 推进 15s 触发复检：探针恢复 → 放行
    await act(async () => { vi.advanceTimersByTime(15_000); });
    await flush();
    expect(result.current.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(clearSpy).toHaveBeenCalled();
  });

  it('网关 URL 未配置：视为 down 且不发起探针', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = await renderFresh('   ');
    await flush();
    expect(result.current.status).toBe('down');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('缓存命中：直接采用缓存结果，不发探针', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.setState((s) => ({
      aiConfig: { ...s.aiConfig, gatewayUrl: 'http://gateway.test' },
    }));
    const cache = await import('@/hooks/gatewayHealthCache');
    cache.writeHealthCache({ status: 'online', latency: 10 });
    const { useGatewayHealth } = await import('./useGatewayHealth');
    const { result } = await act(async () => renderHook(() => useGatewayHealth()));
    await flush();
    expect(result.current.status).toBe('ok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('组件卸载：清除复检定时器', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const { result, unmount } = await renderFresh('http://gateway.test');
    await flush();
    expect(result.current.status).toBe('down');
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('组件卸载：迟到探针响应不写共享缓存', async () => {
    // fetch 挂起：探针在途时卸载，随后才 resolve 的响应必须被代际保护丢弃
    let resolveFetch!: (v: unknown) => void;
    const pending = new Promise((r) => { resolveFetch = r; });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = await renderFresh('http://gateway.test');
    // 必须在 renderFresh（内部 resetModules）之后导入，才是 hook 共用的缓存实例
    const cache = await import('@/hooks/gatewayHealthCache');
    await flush();
    expect(result.current.status).toBe('checking');
    expect(cache.readHealthCache()).toBeNull();
    unmount();
    // 卸载后响应才到达：不得写共享缓存（否则陈旧结果扩散给其他消费方）
    resolveFetch({ ok: true, json: async () => ({ status: 'ok' }) });
    await flush();
    expect(cache.readHealthCache()).toBeNull();
  });
});
