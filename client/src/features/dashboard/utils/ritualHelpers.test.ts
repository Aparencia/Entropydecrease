/**
 * ritualHelpers 单元测试 / Unit tests for ritual pure helpers
 *
 * @ai-context: AAA 模式（Arrange/Act/Assert），覆盖目标接力、快选标签、
 * 三段式合成与复习卡触发判定的边界用例（空值/去重/截断/排序）。
 * @ai-context: AAA-style tests covering goal relay, quick tags,
 * structured goal composition and review-card trigger edge cases.
 */
import { describe, it, expect } from 'vitest';
import type { RitualRecord } from '@/types/ritual';
import {
  getTodayStr,
  findLastUnfinishedGoal,
  buildQuickTags,
  composeStructuredGoal,
  shouldScheduleReviewCard,
  computeRitualStreak,
  MAX_QUICK_TAGS,
} from './ritualHelpers';

function makeRecord(overrides: Partial<RitualRecord> = {}): RitualRecord {
  return {
    id: 'r1',
    date: '2026-07-29',
    goalTags: [],
    ritualDurationMs: 60_000,
    planVariant: 'standard',
    createdAt: new Date('2026-07-29T08:00:00'),
    ...overrides,
  };
}

describe('getTodayStr', () => {
  it('should format date as YYYY-MM-DD with zero padding', () => {
    // Arrange
    const date = new Date(2026, 0, 5); // 2026-01-05

    // Act & Assert
    expect(getTodayStr(date)).toBe('2026-01-05');
  });
});

describe('findLastUnfinishedGoal', () => {
  it('should return most recent unfinished goal excluding today', () => {
    // Arrange
    const records = [
      makeRecord({ id: 'a', date: '2026-07-27', goalText: '旧目标', goalCompleted: false }),
      makeRecord({ id: 'b', date: '2026-07-29', goalText: '昨日目标' }),
      makeRecord({ id: 'c', date: '2026-07-30', goalText: '今日目标' }),
    ];

    // Act
    const result = findLastUnfinishedGoal(records, '2026-07-30');

    // Assert
    expect(result).toBe('昨日目标');
  });

  it('should skip completed goals', () => {
    // Arrange
    const records = [
      makeRecord({ id: 'a', date: '2026-07-29', goalText: '已完成', goalCompleted: true }),
      makeRecord({ id: 'b', date: '2026-07-28', goalText: '未完成', goalCompleted: false }),
    ];

    // Act & Assert
    expect(findLastUnfinishedGoal(records, '2026-07-30')).toBe('未完成');
  });

  it('should return undefined for empty records or blank goals', () => {
    // Arrange
    const blankOnly = [makeRecord({ goalText: '   ' })];

    // Act & Assert
    expect(findLastUnfinishedGoal([], '2026-07-30')).toBeUndefined();
    expect(findLastUnfinishedGoal(blankOnly, '2026-07-30')).toBeUndefined();
  });
});

describe('buildQuickTags', () => {
  it('should place relay goal first and fill rest with note titles', () => {
    // Arrange
    const titles = ['线性代数', '微积分', '概率论'];

    // Act
    const tags = buildQuickTags(titles, '完成第三章习题');

    // Assert
    expect(tags[0]).toEqual({ text: '完成第三章习题', relay: true });
    expect(tags).toHaveLength(4);
    expect(tags.slice(1).every((t) => !t.relay)).toBe(true);
  });

  it('should cap total tags at MAX_QUICK_TAGS', () => {
    // Arrange
    const titles = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    // Act
    const tags = buildQuickTags(titles, '接力目标');

    // Assert
    expect(tags).toHaveLength(MAX_QUICK_TAGS);
  });

  it('should deduplicate and drop empty titles', () => {
    // Arrange
    const titles = ['重复', '重复', '  ', '有效'];

    // Act
    const tags = buildQuickTags(titles);

    // Assert
    expect(tags.map((t) => t.text)).toEqual(['重复', '有效']);
  });

  it('should truncate overly long titles with ellipsis', () => {
    // Arrange
    const longTitle = '这是一个非常非常非常长的笔记标题超出限制';

    // Act
    const tags = buildQuickTags([longTitle]);

    // Assert
    expect(tags[0].text.endsWith('…')).toBe(true);
    expect(tags[0].text.length).toBeLessThanOrEqual(15);
  });

  it('should work without relay goal', () => {
    // Act
    const tags = buildQuickTags(['标题一'], undefined);

    // Assert
    expect(tags).toEqual([{ text: '标题一', relay: false }]);
  });
});

describe('composeStructuredGoal', () => {
  it('should compose verb + object + scope', () => {
    // Act & Assert
    expect(composeStructuredGoal('搞懂', '傅里叶变换', '前两节')).toBe('搞懂傅里叶变换 前两节');
  });

  it('should omit scope when blank', () => {
    // Act & Assert
    expect(composeStructuredGoal('复习', '英语单词', '  ')).toBe('复习英语单词');
  });

  it('should return empty string when object is blank', () => {
    // Act & Assert
    expect(composeStructuredGoal('完成', '   ', '第一章')).toBe('');
  });
});

describe('shouldScheduleReviewCard', () => {
  it('should schedule only for fuzzy and unmastered marks', () => {
    // Act & Assert
    expect(shouldScheduleReviewCard('fuzzy')).toBe(true);
    expect(shouldScheduleReviewCard('unmastered')).toBe(true);
    expect(shouldScheduleReviewCard('mastered')).toBe(false);
    expect(shouldScheduleReviewCard(undefined)).toBe(false);
    expect(shouldScheduleReviewCard(null)).toBe(false);
  });
});

describe('computeRitualStreak', () => {
  it('should return 1 when no prior records (only today)', () => {
    // Act & Assert
    expect(computeRitualStreak([], '2026-07-30')).toBe(1);
  });

  it('should count consecutive days including today', () => {
    // Arrange — 昨天、前天连续
    const records = [
      makeRecord({ date: '2026-07-29' }),
      makeRecord({ date: '2026-07-28' }),
    ];

    // Act & Assert — 今天 + 29 + 28 = 3
    expect(computeRitualStreak(records, '2026-07-30')).toBe(3);
  });

  it('should stop at the first gap', () => {
    // Arrange — 29 有、28 缺、27 有（断裂）
    const records = [
      makeRecord({ date: '2026-07-29' }),
      makeRecord({ date: '2026-07-27' }),
    ];

    // Act & Assert — 今天 + 29 = 2（27 因 28 缺失不计）
    expect(computeRitualStreak(records, '2026-07-30')).toBe(2);
  });

  it('should ignore duplicate dates', () => {
    // Arrange
    const records = [
      makeRecord({ id: 'a', date: '2026-07-29' }),
      makeRecord({ id: 'b', date: '2026-07-29' }),
    ];

    // Act & Assert
    expect(computeRitualStreak(records, '2026-07-30')).toBe(2);
  });
});

