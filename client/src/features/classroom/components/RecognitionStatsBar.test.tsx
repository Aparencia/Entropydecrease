/**
 * RecognitionStatsBar 渲染测试（P0-7）
 *
 * @ai-context: 锁定识别统计条展示契约：引擎徽标三态（本地流式 > 本地按段 >
 * 云端）、关键帧/转写计数、VAD 语音状态（语音中/静默/已停止）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecognitionStatsBar } from './RecognitionStatsBar';
import type { VADStats } from '@/lib/capture/vadMarker';

function makeVad(lastVoiceTimestamp: number): VADStats {
  return {
    currentThreshold: 0.008,
    segmentCount: 0,
    lastVoiceTimestamp,
    calibrated: true,
    processedChunks: 0,
  };
}

describe('RecognitionStatsBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('本地流式引擎徽标 + 帧数/句数统计', () => {
    render(
      <RecognitionStatsBar
        status="capturing"
        keyframeCount={12}
        transcribedCount={34}
        vadStats={makeVad(0)}
        streamingAsrActive
        localAsrReady
      />,
    );
    expect(screen.getByText('本地流式')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('34')).toBeTruthy();
  });

  it('云端转写引擎徽标（本地不可用且非流式）', () => {
    render(
      <RecognitionStatsBar
        status="capturing"
        keyframeCount={0}
        transcribedCount={0}
        vadStats={null}
        streamingAsrActive={false}
        localAsrReady={false}
      />,
    );
    expect(screen.getByText('云端转写')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('VAD 语音状态：最近 2s 有语音 → 语音中；否则静默；停止态 → 已停止', () => {
    const now = Date.now();
    const { rerender } = render(
      <RecognitionStatsBar
        status="capturing"
        keyframeCount={0}
        transcribedCount={0}
        vadStats={makeVad(now - 500)}
        streamingAsrActive={false}
        localAsrReady={false}
      />,
    );
    expect(screen.getByText('语音中')).toBeTruthy();

    rerender(
      <RecognitionStatsBar
        status="capturing"
        keyframeCount={0}
        transcribedCount={0}
        vadStats={makeVad(now - 10_000)}
        streamingAsrActive={false}
        localAsrReady={false}
      />,
    );
    expect(screen.getByText('静默')).toBeTruthy();

    rerender(
      <RecognitionStatsBar
        status="idle"
        keyframeCount={0}
        transcribedCount={0}
        vadStats={makeVad(now - 500)}
        streamingAsrActive={false}
        localAsrReady={false}
      />,
    );
    expect(screen.getByText('已停止')).toBeTruthy();
  });
});
