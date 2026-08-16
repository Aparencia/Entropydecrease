// @vitest-environment node
/**
 * 窗口评分组合入口测试
 * @ai-context: 兼容路径（无信号=纯标题，与改造前行为一致）；信号注入路径；
 * 记忆查找注入（courseName 携带 + boost 计入总分）。
 */
import { describe, it, expect } from 'vitest';
import { scoreAndFilterWindows } from './windowScorer.js';

const WIN = (id: string, title: string) => ({ id, title, thumbnail: '' });

describe('scoreAndFilterWindows — 兼容路径（无信号）', () => {
  it('空标题与黑名单窗口被过滤', () => {
    const out = scoreAndFilterWindows([WIN('1', ''), WIN('2', 'Program Manager'), WIN('3', '腾讯会议')]);
    expect(out.map((w) => w.id)).toEqual(['3']);
  });
  it('无信号时评分与旧逻辑等价（关键词排序）', () => {
    const out = scoreAndFilterWindows([WIN('1', '随便看看'), WIN('2', '腾讯会议 - 网课')]);
    expect(out[0].id).toBe('2');
    expect(out[0].score).toBeGreaterThanOrEqual(80);
    expect(out[1].score).toBe(0);
  });
  it('matched 兼容：填充最高权重理由', () => {
    const out = scoreAndFilterWindows([WIN('1', '腾讯会议 - 网课')]);
    expect(out[0].matched).toBeTruthy();
  });
});

describe('scoreAndFilterWindows — 信号注入路径', () => {
  it('按 source id 注入信号参与评分', () => {
    const out = scoreAndFilterWindows(
      [WIN('window:111:0', '原神萌新攻略')],
      {
        signalsBySourceId: new Map([['window:111:0', { title: '原神萌新攻略', processName: 'steam.exe' }]]),
      },
    );
    expect(out[0].processName).toBe('steam.exe');
    expect(out[0].confidence).toBeDefined();
    expect(out[0].reasons?.length).toBeGreaterThan(0);
  });
  it('记忆查找注入：携带 courseName 并计入 boost', () => {
    const out = scoreAndFilterWindows(
      [WIN('window:111:0', '高等数学 - bilibili.com')],
      {
        signalsBySourceId: new Map([['window:111:0', { title: '高等数学 - bilibili.com' }]]),
        memoryLookup: () => ({ courseName: '高等数学', boost: 40 }),
      },
    );
    expect(out[0].memoryCourseName).toBe('高等数学');
    expect(out[0].score).toBeGreaterThanOrEqual(40);
  });
  it('排序：总分降序，同分按 id 稳定', () => {
    const out = scoreAndFilterWindows(
      [WIN('a', '随便看看'), WIN('b', '腾讯会议 - 网课'), WIN('c', '随便看看')],
      {
        signalsBySourceId: new Map([
          ['a', { title: '随便看看' }],
          ['b', { title: '腾讯会议 - 网课' }],
          ['c', { title: '随便看看' }],
        ]),
      },
    );
    expect(out.map((w) => w.id)).toEqual(['b', 'a', 'c']);
  });
});
