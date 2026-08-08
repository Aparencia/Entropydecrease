/**
 * UnifiedTimeline 测试 — 统一时间线（事件 + 转写合并排序）
 * @ai-context: 验证时间轴事件与实时转写按时间戳合并排序的正确性，
 * 以及空态/实时行渲染。纯 jsdom 渲染，不依赖 Electron。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedTimeline } from './UnifiedTimeline';

const baseBundle = {
  timeline: [
    { timestamp: 3000, type: 'voice_start' as const, energy: 0.5 },
    { timestamp: 9000, type: 'voice_end' as const, energy: 0.2 },
    { timestamp: 15000, type: 'keyframe' as const, refId: 'kf-1' },
    { timestamp: 21000, type: 'bookmark' as const, label: '重点：导数定义' },
  ],
  keyframes: [{ id: 'kf-1', timestamp: 15000, imageBase64: '', changeType: 'slide_change' as const }],
  audioSegments: [],
  duration: 24000,
};

describe('UnifiedTimeline 合并排序', () => {
  it('事件与转写按时间戳合并为一条时间线', () => {
    const transcripts = [
      { id: 't1', text: '第一句转写', timestamp: 6000 },
      { id: 't2', text: '第二句转写', timestamp: 12000 },
    ];
    render(
      <UnifiedTimeline
        bundle={baseBundle}
        liveTranscripts={transcripts}
        isActive={false}
      />,
    );

    // 合并后按时间序：语音开始(3s) → 转写1(6s) → 语音结束(9s) → 转写2(12s) → 关键帧(15s) → 重点(21s)
    const follows = (a: string, b: string) => {
      const na = screen.getByText(a);
      const nb = screen.getByText(b);
      return (na.compareDocumentPosition(nb) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    };
    expect(follows('语音开始', '第一句转写')).toBe(true);
    expect(follows('第一句转写', '语音结束')).toBe(true);
    expect(follows('语音结束', '第二句转写')).toBe(true);
    expect(follows('第二句转写', '关键帧')).toBe(true);
    expect(follows('关键帧', '重点标记')).toBe(true);
  });

  it('锚点/书签的 label 文本直接展示在时间线上', () => {
    render(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={[]} autoAnchors={[{ timestamp: 18000, label: '锚点：本节核心公式' }]} isActive={false} />,
    );
    expect(screen.getByText('重点：导数定义')).toBeTruthy();
    expect(screen.getByText('锚点：本节核心公式')).toBeTruthy();
  });

  it('自动锚点（独立数据源）按时间戳参与合并排序', () => {
    const transcripts = [{ id: 't1', text: '转写文本', timestamp: 6000 }];
    render(
      <UnifiedTimeline
        bundle={baseBundle}
        liveTranscripts={transcripts}
        autoAnchors={[{ timestamp: 12000, label: '锚点文本' }]}
        isActive={false}
      />,
    );
    const follows = (a: string, b: string) => {
      const na = screen.getByText(a);
      const nb = screen.getByText(b);
      return (na.compareDocumentPosition(nb) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    };
    expect(follows('转写文本', '锚点文本')).toBe(true);
    expect(follows('锚点文本', '关键帧')).toBe(true);
  });

  it('无数据时显示空态引导文案', () => {
    render(<UnifiedTimeline bundle={{}} liveTranscripts={[]} isActive={false} />);
    expect(screen.getByText('选择智能模式后开始采集')).toBeTruthy();
  });

  it('采集中显示实时 partial 行', () => {
    render(
      <UnifiedTimeline
        bundle={{ timeline: [], keyframes: [], audioSegments: [] }}
        liveTranscripts={[]}
        partialText="正在识别这句…"
        isActive
      />,
    );
    expect(screen.getByText('正在识别这句…')).toBeTruthy();
  });
});
