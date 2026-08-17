/**
 * analyzePartial 页级切分测试（P1-5）
 *
 * @ai-context: 验证批内 slide_change 帧作为新页起点逐页独立分析：纯板书批
 * 保持单次调用；多页批按页拆分调用、页内 [图:N] 重映射为批内编号（越界
 * 幻觉编号移除）。外部 remapKeyframeMarkers 负责批内→全局的二次映射。
 * English: page-level splitting of incremental keyframe batches — pure
 * board batches stay single-call; multi-page batches split per slide_change
 * with local [图:N] remapped to batch-level indices (out-of-range dropped).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

import { analyzePartial } from './sessionAnalyzer';
import type { KeyFrame } from '@/lib/capture/captureTypes';

function makeKf(id: string, changeType: KeyFrame['changeType'], ts: number): KeyFrame {
  return { id, timestamp: ts, imageBase64: 'img', changeType };
}

describe('analyzePartial 页级切分', () => {
  const invokeMock = vi.fn();

  beforeEach(() => {
    invokeMock.mockReset();
    (window as unknown as { electronAPI: unknown }).electronAPI = { invoke: invokeMock };
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('纯板书批（无 slide_change）：单次调用，编号不重映射', async () => {
    invokeMock.mockResolvedValue({ content: '知识点 A\n[图:1]\n知识点 B' });
    const kfs = [
      makeKf('a', 'writing', 1000),
      makeKf('b', 'writing', 2000),
      makeKf('c', 'scene_change', 3000),
    ];

    const md = await analyzePartial(kfs, 0);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe('ai_session_analyze');
    expect(invokeMock.mock.calls[0][1].keyframes).toHaveLength(3);
    expect(md).toBe('知识点 A\n[图:1]\n知识点 B');
  });

  it('含翻页批：按 slide_change 切页逐页分析，页内编号重映射为批内编号', async () => {
    // 批 = [w1, s1, w2, s2] → 页组 [[w1], [s1, w2], [s2]]，3 次调用
    invokeMock
      .mockResolvedValueOnce({ content: '页1内容 [图:1]' })
      .mockResolvedValueOnce({ content: '页2内容 [图:1] [图:2]' })
      .mockResolvedValueOnce({ content: '页3内容 [图:1]' });
    const kfs = [
      makeKf('w1', 'writing', 1000),
      makeKf('s1', 'slide_change', 2000),
      makeKf('w2', 'writing', 3000),
      makeKf('s2', 'slide_change', 4000),
    ];

    const md = await analyzePartial(kfs, 0);

    expect(invokeMock).toHaveBeenCalledTimes(3);
    // 各页组帧数：1 / 2 / 1（页首 slide_change 帧归入新页）；kfPayload 仅含
    // timestamp/imageBase64/changeType（无 id），按时间戳断言
    expect(invokeMock.mock.calls[0][1].keyframes.map((k: { timestamp: number }) => k.timestamp)).toEqual([1]);
    expect(invokeMock.mock.calls[1][1].keyframes.map((k: { timestamp: number }) => k.timestamp)).toEqual([2, 3]);
    expect(invokeMock.mock.calls[2][1].keyframes.map((k: { timestamp: number }) => k.timestamp)).toEqual([4]);
    // 页内编号 → 批内编号：页2 [图:1]→[图:2]、[图:2]→[图:3]；页3 [图:1]→[图:4]
    expect(md).toBe('页1内容 [图:1]\n\n页2内容 [图:2] [图:3]\n\n页3内容 [图:4]');
  });

  it('越界页内编号（模型幻觉）被移除', async () => {
    invokeMock
      .mockResolvedValueOnce({ content: '页1内容 [图:1]' })
      .mockResolvedValueOnce({ content: '幻觉编号 [图:9] [图:0]' });
    const kfs = [
      makeKf('w1', 'writing', 1000),
      makeKf('s1', 'slide_change', 2000),
      makeKf('w2', 'writing', 3000),
    ];

    const md = await analyzePartial(kfs, 0);

    // 越界编号移除后残留空格被 analyzePartial 的 trim() 收敛
    expect(md).toBe('页1内容 [图:1]\n\n幻觉编号');
  });

  it('批首即翻页帧：首页从 slide_change 帧开始', async () => {
    invokeMock
      .mockResolvedValueOnce({ content: '页A [图:1]' })
      .mockResolvedValueOnce({ content: '页B [图:1]' });
    const kfs = [
      makeKf('s1', 'slide_change', 1000),
      makeKf('w1', 'writing', 2000),
      makeKf('s2', 'slide_change', 3000),
    ];

    const md = await analyzePartial(kfs, 0);

    // 页组 [[s1, w1], [s2]]：页1 offset 0（[图:1] 不变），页2 offset 2（[图:1]→[图:3]）
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(md).toBe('页A [图:1]\n\n页B [图:3]');
  });
});
