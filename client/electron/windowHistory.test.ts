// @vitest-environment node
/**
 * 窗口记忆纯函数测试
 * @ai-context: better-sqlite3 经 electron-rebuild 为 Electron ABI，vitest 无法
 * 实例化——仅覆盖纯函数层（模板归一化/hash/boost/LRU 淘汰），SQLite 读写为薄封装不测。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeTitleTemplate,
  hashTitleTemplate,
  computeMemoryBoost,
  pickLruEviction,
} from './windowHistory.js';

describe('normalizeTitleTemplate', () => {
  it('归一化数字（会议号/章节/未读数）', () => {
    expect(normalizeTitleTemplate('腾讯会议 123456789')).toBe('腾讯会议 {n}');
    expect(normalizeTitleTemplate('琅琊榜 第12集')).toBe('琅琊榜 第{n}集');
  });
  it('稳定视频站标题模板', () => {
    expect(normalizeTitleTemplate('新手化妆教程 - bilibili.com')).toBe('新手化妆教程 - bilibili.com');
  });
});

describe('hashTitleTemplate', () => {
  it('同模板同 hash，不同模板不同 hash', () => {
    const t = '腾讯会议 {n}';
    expect(hashTitleTemplate(t)).toBe(hashTitleTemplate(t));
    expect(hashTitleTemplate(t)).not.toBe(hashTitleTemplate('腾讯会议 其他'));
  });
});

describe('computeMemoryBoost', () => {
  it('useCount 封顶 30（min(count,5)*6），recency 7 天内 +10', () => {
    const now = Date.now();
    expect(computeMemoryBoost({ useCount: 3, lastUsedAt: now } as any, now)).toBe(18 + 10);
    expect(computeMemoryBoost({ useCount: 99, lastUsedAt: now } as any, now)).toBe(30 + 10);
  });
  it('30 天内 +5，超过 30 天仅 count 分', () => {
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    expect(computeMemoryBoost({ useCount: 1, lastUsedAt: now - 10 * DAY } as any, now)).toBe(6 + 5);
    expect(computeMemoryBoost({ useCount: 1, lastUsedAt: now - 40 * DAY } as any, now)).toBe(6);
  });
  it('null 记忆返回 0', () => {
    expect(computeMemoryBoost(null, Date.now())).toBe(0);
  });
});

describe('pickLruEviction', () => {
  it('返回最久未使用条目', () => {
    const entries = [
      { titleHash: 'a', lastUsedAt: 100 },
      { titleHash: 'b', lastUsedAt: 50 },
      { titleHash: 'c', lastUsedAt: 200 },
    ];
    expect(pickLruEviction(entries as any)).toBe('b');
  });
});
