/**
 * 窗口监听 hook 测试：自动选中三规则与课程名回填
 * @ai-context: mock window.electronAPI；仅验证自动选中评估逻辑。
 *
 * 时序说明：挂载时 refreshWindows 会异步 setWindows([])，若与测试触发的
 * 窗口更新同处一个 act 微任务队列，后落定者会覆盖前者。故 invoke mock 按
 * channel 区分返回值，且 setup 内先 flush 挂载期异步更新，再触发事件。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWindowWatcher } from './useWindowWatcher';

const invokeMock = vi.fn();
// 显式声明参数类型：channel + 回调，使 mock.calls 可安全索引
const onMock = vi.fn((_channel: string, _cb: (...args: unknown[]) => void) => () => {});
const notifyMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: invokeMock,
    on: onMock,
  };
  // screen_list_windows 返回空列表；其余 channel（start/stop/memory_record）返回 undefined
  invokeMock.mockImplementation((channel: string) =>
    Promise.resolve(channel === 'screen_list_windows' ? [] : undefined),
  );
});

function makeWindow(id: string, overrides: Record<string, unknown> = {}) {
  return { id, title: `win-${id}`, score: 0, ...overrides };
}

async function setup() {
  const hook = renderHook(() =>
    useWindowWatcher({
      courseMeta: { courseName: undefined as string | undefined },
      setCourseMeta: vi.fn(),
      onNotify: notifyMock,
    }),
  );
  // 冲刷挂载期 refreshWindows 的异步 setWindows([])，避免其覆盖后续事件触发的窗口更新
  await act(async () => {});
  return hook;
}

describe('useWindowWatcher — 自动选中', () => {
  it('high 置信度 top1 自动选中并 toast', async () => {
    const { result } = await setup();
    const high = makeWindow('w1', { score: 150, confidence: 'high', processName: 'wemeet.exe', reasons: ['学习意图'] });

    await act(async () => {
      onMock.mock.calls.forEach(([channel, cb]) => {
        if (channel === 'screen_windows_changed') cb(null, [high, makeWindow('w2', { score: 20 })]);
      });
    });

    await waitFor(() => {
      expect(result.current.selectedWindow?.id).toBe('w1');
    });
    expect(notifyMock).toHaveBeenCalledWith('success', expect.stringContaining('w1'));
  });

  it('前台窗口 + 唯一候选自动选中（无记忆）', async () => {
    const { result } = await setup();
    const fg = makeWindow('w1', { score: 90, confidence: 'medium', isForeground: true, learningScore: 80, processName: 'chrome.exe' });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [fg, makeWindow('w2', { score: 10, learningScore: 5 })]));
    });

    await waitFor(() => {
      expect(result.current.selectedWindow?.id).toBe('w1');
    });
  });

  it('medium 且无记忆且非唯一候选 → 不自动选中', async () => {
    const { result } = await setup();
    const med = makeWindow('w1', { score: 80, confidence: 'medium', learningScore: 75 });
    const med2 = makeWindow('w2', { score: 75, confidence: 'medium', learningScore: 70 });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [med, med2]));
    });

    await waitFor(() => {
      expect(result.current.selectedWindow).toBeNull();
    });
  });

  it('已有选中时不覆盖（不重复 toast）', async () => {
    const { result } = await setup();
    const high = makeWindow('w1', { score: 150, confidence: 'high' });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [high]));
    });
    await act(async () => {
      result.current.setSelectedWindow(makeWindow('w2', { score: 5 }));
    });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [high, makeWindow('w3', { score: 5 })]));
    });

    expect(result.current.selectedWindow?.id).toBe('w2');
  });

  it('记忆课程名回填 courseName（detectedBy=memory）', async () => {
    const setCourseMeta = vi.fn();
    const hook = renderHook(() =>
      useWindowWatcher({
        courseMeta: { courseName: undefined as string | undefined },
        setCourseMeta,
        onNotify: notifyMock,
      }),
    );
    await act(async () => {});
    const mem = makeWindow('w1', { score: 150, confidence: 'high', memoryCourseName: '高等数学' });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [mem]));
    });

    await waitFor(() => {
      // setCourseMeta 以函数式更新调用（与正则提取 effect 一致，避免闭包过期）
      expect(setCourseMeta).toHaveBeenCalledTimes(1);
    });
    const updater = setCourseMeta.mock.calls[0][0] as (prev: { courseName?: string }) => Record<string, unknown>;
    expect(updater({ courseName: undefined })).toEqual(
      expect.objectContaining({ courseName: '高等数学', detectedBy: 'memory' }),
    );
    hook.unmount();
  });
});
