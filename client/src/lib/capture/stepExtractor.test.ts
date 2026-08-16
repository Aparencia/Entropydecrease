/**
 * extractSteps 单元测试（P2-7 步骤提取）
 *
 * @ai-context: 锁定步骤提取契约：slide_change 边界切分、时间窗内指令句
 * 聚合、代表性截图选择、无边界帧兜底单步骤、checklist/闪卡转换。
 */
import { describe, it, expect } from 'vitest';
import { extractSteps, stepsToChecklist, stepsToFlashcards } from './stepExtractor';
import type { KeyFrame, AudioSegment } from './captureTypes';

let ts = 1_000_000;
function kf(changeType: KeyFrame['changeType'], imageBase64 = '', offsetMs = 0): KeyFrame {
  ts += 5000;
  return {
    id: `kf-${ts}`,
    timestamp: ts + offsetMs,
    imageBase64,
    changeType,
  };
}

function seg(start: number, text: string): AudioSegment {
  return {
    id: `seg-${start}`,
    timestampStart: start,
    timestampEnd: start + 3000,
    audioBase64: '',
    energy: 0.1,
    audioText: text,
  };
}

describe('extractSteps', () => {
  it('slide_change 边界切分步骤，指令句聚合为说明', () => {
    const f1 = kf('slide_change', 'img1'); // 边界1
    const f2 = kf('writing', 'img2');
    const f3 = kf('slide_change', 'img3'); // 边界2
    const f4 = kf('writing', 'img4');
    const segments = [
      seg(f1.timestamp + 500, '我们点击这个按钮'),
      seg(f2.timestamp + 500, '把不透明度设置为五十'),
      seg(f3.timestamp + 500, '然后拖到图层面板'),
      seg(f4.timestamp + 500, '普通讲解内容'),
    ];
    const result = extractSteps([f1, f2, f3, f4], segments);
    expect(result.boundaryCount).toBe(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].instruction).toContain('点击这个按钮');
    expect(result.steps[0].imageBase64).toBe('img2');
    expect(result.steps[1].instruction).toContain('拖到图层面板');
  });

  it('无边界帧：整体单步骤兜底', () => {
    const f1 = kf('writing', 'img1');
    const f2 = kf('writing', 'img2');
    const result = extractSteps([f1, f2], [seg(f1.timestamp, '点击这个按钮')]);
    expect(result.boundaryCount).toBe(0);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].title).toBe('点击这个按钮');
  });

  it('无指令句时标题为「步骤 N」', () => {
    const f1 = kf('slide_change', 'img1');
    const result = extractSteps([f1], [seg(f1.timestamp, '普通讲解')]);
    expect(result.steps[0].title).toBe('步骤 1');
    expect(result.steps[0].instruction).toBe('');
  });

  it('边界前后 1s 容差覆盖时序差', () => {
    const f1 = kf('slide_change', 'img1');
    const result = extractSteps(
      [f1],
      [seg(f1.timestamp - 800, '点击这个按钮')], // 边界前 800ms
    );
    expect(result.steps[0].instruction).toContain('点击这个按钮');
  });

  it('空数据：无步骤无异常', () => {
    const result = extractSteps([], []);
    expect(result.steps).toHaveLength(0);
    expect(result.commandCueCount).toBe(0);
  });

  it('超长标题截断 40 字', () => {
    const f1 = kf('slide_change', 'img1');
    const longText = '我们点击这个按钮然后把它拖到图层面板再调整参数设置为百分之五十的数值'.repeat(2);
    const result = extractSteps([f1], [seg(f1.timestamp + 100, longText)]);
    expect(result.steps[0].title.length).toBeLessThanOrEqual(40);
  });
});

describe('stepsToChecklist / stepsToFlashcards（P2-8）', () => {
  it('checklist 转换', () => {
    const steps = [
      { id: 's1', timestamp: 1, title: '步骤 1', instruction: '' },
      { id: 's2', timestamp: 2, title: '步骤 2', instruction: '' },
    ];
    const list = stepsToChecklist(steps);
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe('步骤 1');
  });

  it('闪卡转换：问答形态', () => {
    const steps = [
      { id: 's1', timestamp: 1, title: '点击图层面板', instruction: '点击图层面板并拖动' },
      { id: 's2', timestamp: 2, title: '步骤 2', instruction: '调整参数' },
    ];
    const cards = stepsToFlashcards(steps);
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toContain('点击图层面板');
    expect(cards[0].back).toBe('点击图层面板并拖动');
    expect(cards[1].front).toBe('这一步（截图/操作）是什么？');
  });
});
