/**
 * UnifiedTimeline 测试 — 统一时间线（事件 + 转写合并排序）
 * @ai-context: 验证时间轴事件与实时转写按时间戳合并排序的正确性，
 * 以及空态/实时行渲染。纯 jsdom 渲染，不依赖 Electron。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('UnifiedTimeline 批量插入', () => {
  const transcripts = [
    { id: 't1', text: '原始转写一', timestamp: 6000 },
    { id: 't2', text: '原始转写二', editedText: '修正后的转写二', timestamp: 12000 },
  ];

  it('课后（非采集中）展示勾选框与插入笔记操作栏', () => {
    render(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={transcripts} isActive={false} onInsertToNote={() => {}} />,
    );
    // 操作栏提示与按钮可见
    expect(screen.getByText(/勾选转写行后可批量插入笔记/)).toBeTruthy();
    expect(screen.getByText('插入笔记')).toBeTruthy();
  });

  it('采集中不展示勾选与插入操作栏（避免干扰实时显示）', () => {
    render(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={transcripts} isActive onInsertToNote={() => {}} />,
    );
    expect(screen.queryByText('插入笔记')).toBeNull();
  });

  it('未提供 onInsertToNote 时不展示插入操作栏', () => {
    render(<UnifiedTimeline bundle={baseBundle} liveTranscripts={transcripts} isActive={false} />);
    expect(screen.queryByText('插入笔记')).toBeNull();
  });

  it('勾选转写行后插入：拼接带 [HH:MM:SS] 时间戳的 Markdown，修正后文本优先', () => {
    const onInsert = vi.fn();
    render(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={transcripts} isActive={false} onInsertToNote={onInsert} />,
    );

    // 勾选两行（行首圆形勾选按钮，title 提示）
    const checkboxes = screen.getAllByTitle('勾选后插入笔记');
    expect(checkboxes.length).toBe(2);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    // 操作栏计数（"已勾选 <strong>N</strong> 句转写"：getByText 只拼直接文本子节点，
    // strong 内数字被丢弃，故直接断言操作栏 DOM 文本）
    const bar = document.querySelector('[class*="border-t"]');
    expect(bar?.textContent).toContain('已勾选');
    expect(bar?.textContent).toContain('2');
    expect(bar?.textContent).toContain('句转写');

    fireEvent.click(screen.getByText('插入笔记'));
    expect(onInsert).toHaveBeenCalledTimes(1);

    const markdown = onInsert.mock.calls[0][0] as string;
    // 每行带 [HH:MM:SS] 时间戳前缀，修正后文本优先（t2 用 editedText）
    expect(markdown).toMatch(/^\[\d{2}:\d{2}:\d{2}\] 原始转写一$/m);
    expect(markdown).toMatch(/\[\d{2}:\d{2}:\d{2}\] 修正后的转写二$/m);
    expect(markdown).not.toContain('原始转写二');
  });

  it('未勾选任何行时插入按钮禁用', () => {
    const onInsert = vi.fn();
    render(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={transcripts} isActive={false} onInsertToNote={onInsert} />,
    );
    const btn = screen.getByText('插入笔记') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('插入成功后清空勾选（防重复点击重复插入）', () => {
    const onInsert = vi.fn();
    render(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={transcripts} isActive={false} onInsertToNote={onInsert} />,
    );
    fireEvent.click(screen.getAllByTitle('勾选后插入笔记')[0]);
    fireEvent.click(screen.getByText('插入笔记'));
    expect(onInsert).toHaveBeenCalledTimes(1);
    // 勾选已清空：操作栏回到提示态，按钮重新禁用
    expect(screen.getByText(/勾选转写行后可批量插入笔记/)).toBeTruthy();
    expect((screen.getByText('插入笔记') as HTMLButtonElement).disabled).toBe(true);
  });

  it('liveTranscripts 截断（FIFO）后失效勾选被清理，计数随之修正', () => {
    const { rerender } = render(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={transcripts} isActive={false} onInsertToNote={() => {}} />,
    );
    const boxes = screen.getAllByTitle('勾选后插入笔记');
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    const bar1 = document.querySelector('[class*="border-t"]');
    expect(bar1?.textContent).toContain('2');

    // FIFO 截断：t2 被移除 → 失效勾选自动清理，计数降至 1
    rerender(
      <UnifiedTimeline bundle={baseBundle} liveTranscripts={[transcripts[0]]} isActive={false} onInsertToNote={() => {}} />,
    );
    const bar2 = document.querySelector('[class*="border-t"]');
    expect(bar2?.textContent).toContain('1');
  });
});
