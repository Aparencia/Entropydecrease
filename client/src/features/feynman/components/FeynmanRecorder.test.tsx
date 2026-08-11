/**
 * FeynmanRecorder 组件测试 / Tests for E2 recording persistence
 *
 * @ai-context: 覆盖 B5(E2) 契约——有 noteId 时停止录音持久化到
 * {userData}/recordings（stem=feynman-{noteId}）、挂载时加载跨会话回放、
 * 删除时清理本地文件；无 noteId 保持会话内回放（不落盘）。electronAPI
 * 全 Mock，绝不触碰真实 IPC/麦克风。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { FeynmanRecorder } from './FeynmanRecorder';

const mocks = vi.hoisted(() => {
  const api = {
    invoke: vi.fn(),
    on: vi.fn(),
    recording: {
      save: vi.fn(),
      load: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { api };
});

beforeEach(() => {
  // 只注入 electronAPI 属性，不替换 window 本体（保留 React 的 Node instanceof 检查）
  Object.defineProperty(window, 'electronAPI', { value: mocks.api, configurable: true, writable: true });
  vi.clearAllMocks();
  // 默认 IPC 行为：ASR 可用、采集可启动
  mocks.api.invoke.mockImplementation(async (channel: string) => {
    switch (channel) {
      case 'local_asr_stream_available': return { available: true };
      case 'audio_capture_status': return { active: false };
      case 'audio_capture_start': return { success: true };
      case 'local_asr_stream_start': return { success: true };
      case 'local_asr_stream_stop': return { success: true };
      case 'audio_capture_stop': return { success: true };
      default: return {};
    }
  });
  mocks.api.on.mockReturnValue(() => {});
  mocks.api.recording.save.mockResolvedValue({ success: true });
  mocks.api.recording.load.mockResolvedValue({ success: false, notFound: true });
  mocks.api.recording.delete.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  delete (window as { electronAPI?: unknown }).electronAPI;
});

/** 取某 channel 上注册的渲染侧回调（事件模拟入口） */
function handlerOf(channel: string): (...args: unknown[]) => void {
  const call = mocks.api.on.mock.calls.find((c) => c[0] === channel);
  if (!call) throw new Error(`no handler for ${channel}`);
  return call[1] as (...args: unknown[]) => void;
}

async function recordOnce() {
  // 开始录音
  fireEvent.click(screen.getByRole('button', { name: /口头讲解/ }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  // 模拟一帧 PCM 音频块（1 秒 16kHz 单声道）
  act(() => {
    handlerOf('audio_capture_chunk')({ audioBuffer: new Float32Array(16000).buffer, sampleRate: 16000 });
  });
  // 停止录音
  fireEvent.click(screen.getByRole('button', { name: /停止讲解/ }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('FeynmanRecorder (B5/E2 persistence)', () => {
  it('should persist recording to {userData}/recordings when noteId given', async () => {
    render(<FeynmanRecorder explanation="" onExplanationChange={() => {}} noteId="note-1" />);
    await act(async () => { await Promise.resolve(); });
    await recordOnce();
    // 停止后触发持久化：stem = feynman-{noteId}
    const saved = mocks.api.recording.save.mock.calls[0];
    expect(saved?.[0]).toBe('feynman-note-1');
    expect(typeof saved?.[1]).toBe('string');
    expect(saved?.[1].length).toBeGreaterThan(100); // 有效 base64 WAV
  });

  it('should load persisted recording on mount for cross-session playback', async () => {
    mocks.api.recording.load.mockResolvedValue({
      success: true,
      base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YQAAAAA=',
    });
    render(<FeynmanRecorder explanation="" onExplanationChange={() => {}} noteId="note-2" />);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.api.recording.load).toHaveBeenCalledWith('feynman-note-2');
    // 加载成功后显示回放条
    expect(document.querySelector('audio')).not.toBeNull();
  });

  it('should not persist when noteId missing (session-only playback)', async () => {
    render(<FeynmanRecorder explanation="" onExplanationChange={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    await recordOnce();
    expect(mocks.api.recording.save).not.toHaveBeenCalled();
  });

  it('should delete local file when playback removed', async () => {
    mocks.api.recording.load.mockResolvedValue({
      success: true,
      base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YQAAAAA=',
    });
    render(<FeynmanRecorder explanation="" onExplanationChange={() => {}} noteId="note-3" />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByTitle('删除录音'));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.api.recording.delete).toHaveBeenCalledWith('feynman-note-3');
    expect(document.querySelector('audio')).toBeNull();
  });

  it('should wait for in-flight save before deleting local file (race guard)', async () => {
    // save 挂起不 resolve：删除必须先等 save 完成，防止文件删而复生
    let resolveSave: (v: unknown) => void = () => {};
    mocks.api.recording.save.mockImplementation(
      () => new Promise((r) => { resolveSave = r; }),
    );
    render(<FeynmanRecorder explanation="" onExplanationChange={() => {}} noteId="note-4" />);
    await act(async () => { await Promise.resolve(); });
    await recordOnce(); // save 已发起但未完成
    fireEvent.click(screen.getByTitle('删除录音'));
    expect(mocks.api.recording.delete).not.toHaveBeenCalled();
    await act(async () => {
      resolveSave({ success: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.api.recording.delete).toHaveBeenCalledWith('feynman-note-4');
  });
});
