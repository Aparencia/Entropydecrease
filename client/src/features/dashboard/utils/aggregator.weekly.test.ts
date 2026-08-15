/**
 * 学习分析聚合补充测试（周报/心流/钻取/全量结构）
 * Supplementary aggregator tests — weekly summary, flow, drill, full shape
 *
 * @ai-context: 既有 aggregator.test.ts 覆盖热力图/趋势/推荐；本文件通过
 * aggregateAnalytics 单入口驱动雷达、目标、周报（复习及时率/掌握度变化）、
 * 心流通道与掌握度钻取的内部纯函数，fake timers 固定"今天"保证确定性。
 * @ai-context: The existing aggregator test covers heatmap/trend/recs; this
 * file drives the remaining internals — radar, goals, weekly summary
 * (timeliness/mastery delta), flow channel and mastery drill — through
 * aggregateAnalytics under a fixed fake clock.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { aggregateAnalytics } from './aggregator';
import type {
  PomodoroSession, Note, Flashcard, FeynmanNote, FlashcardReview,
} from '@/types/models';

const at = (day: number, h: number) => new Date(2026, 0, day, h, 0, 0);

// 工厂模式：默认值在前，o 的覆盖值在后（o 必含 id，展开即提供 id，
// 无需单独 id 行——避免与展开重复导致 TS2783）
const session = (o: Partial<PomodoroSession> & { id: string }): PomodoroSession => ({
  mode: 'self_study',
  duration: 1500,
  actualDuration: 1500,
  completedAt: at(14, 10),
  interrupted: false,
  ...o,
});

const note = (o: Partial<Note> & { id: string }): Note => ({
  title: `笔记-${o.id}`,
  content: '{}',
  template: 'free',
  tags: [],
  createdAt: at(1, 0),
  updatedAt: at(14, 11),
  wordCount: 1000,
  pinned: false,
  ...o,
});

const feynman = (o: Partial<FeynmanNote> & { id: string }): FeynmanNote => ({
  concept: '数学',
  explanation: '讲解',
  status: 'completed',
  currentStep: 4,
  selfRating: 4,
  createdAt: at(1, 0),
  updatedAt: at(12, 10),
  ...o,
});

const review = (o: Partial<FlashcardReview> & { id: string; reviewedAt: Date }): FlashcardReview => ({
  cardId: 'c1',
  deckId: 'd1',
  rating: 3,
  easeFactorBefore: 2.5,
  easeFactorAfter: 2.6,
  intervalBefore: 1,
  intervalAfter: 2,
  timeSpent: 5,
  ...o,
});

// 工厂固定 type='basic'：o 只允许覆盖非 type 字段（Partial<Omit<...>> 约束）
const flashcard = (o: Partial<Omit<Flashcard, 'type'>> & { id: string }): Flashcard => ({
  deckId: 'd1',
  front: '概念',
  back: '解释',
  easeFactor: 2.5,
  interval: 10,
  repetitions: 3,
  lapses: 0,
  createdAt: at(1, 0),
  updatedAt: at(1, 0),
  dueDate: at(2, 0),
  order: 0,
  ...o,
  type: 'basic',
});

const baseInput = () => ({
  sessions: [
    session({ id: 's1', subject: '数学', completedAt: at(14, 10) }),
    session({ id: 's2', subject: '英语', duration: 1800, actualDuration: 900, interrupted: true, completedAt: at(13, 15) }),
    session({ id: 's3', subject: '数学', duration: 1200, actualDuration: 1200, completedAt: at(1, 9) }),
  ],
  notes: [
    note({ id: 'n1', tags: ['数学'], wordCount: 2000, updatedAt: at(14, 11) }),
    note({ id: 'n2', tags: ['物理'], wordCount: 500, updatedAt: at(13, 16) }),
  ],
  flashcards: [flashcard({ id: 'c1', sourceNoteId: 'n1' })],
  feynmanNotes: [feynman({ id: 'f1' })],
  reviews: [review({ id: 'r1', reviewedAt: at(14, 12) })],
});

describe('aggregateAnalytics — full structure', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should compute radar, goals and weekly summary for realistic data', () => {
    // Arrange：固定"今天"= 2026-01-15 12:00
    vi.useFakeTimers();
    vi.setSystemTime(at(15, 12));

    // Act
    const agg = aggregateAnalytics(baseInput());

    // Assert：雷达五维
    const byDim = Object.fromEntries(agg.radar.map((r) => [r.dimension, r.value]));
    expect(byDim.focus).toBe(83);
    expect(byDim.efficiency).toBe(83);
    expect(byDim.persistence).toBe(0);
    expect(byDim.breadth).toBe(30);
    expect(byDim.activity).toBe(2);

    // 趋势：近期日期带 7 日均值标签
    expect(agg.trend.find((t) => t.date === '2026-01-14')?.value).toBe(37); // 25 + 笔记10 + 复习2
    expect(agg.trend.find((t) => t.date === '2026-01-13')?.value).toBe(25); // 15 + 笔记10
    expect(agg.trend.find((t) => t.date === '2026-01-12')?.value).toBe(15); // 费曼15

    // 目标：7 天窗口
    const goalHours = agg.goals.find((g) => g.id === 'goal-hours');
    expect(goalHours?.current).toBe(40);
    expect(goalHours?.progressPercent).toBe(7);
    expect(agg.goals.find((g) => g.id === 'goal-notes')?.progressPercent).toBe(40);

    // 周报
    expect(agg.weekly).toMatchObject({
      totalMinutes: 40,
      noteCount: 2,
      reviewCount: 1,
      feynmanCount: 1,
      focusRate: 75,
      reviewTimeliness: null, // 样本不足
      masteryDelta: null,
    });
  });

  it('should return a zeroed structure for empty input', () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(at(15, 12));
    const empty = { sessions: [], notes: [], flashcards: [], feynmanNotes: [], reviews: [] };

    // Act
    const agg = aggregateAnalytics(empty);

    // Assert
    expect(agg.radar.every((r) => r.value === 0)).toBe(true);
    expect(agg.recommendations).toEqual([]);
    expect(agg.goals.every((g) => g.current === 0)).toBe(true);
    expect(agg.weekly).toMatchObject({ totalMinutes: 0, focusRate: 0 });
    expect(agg.flow.insight).toBe('完成更多深潜后，这里会浮现你的心流通道');
    expect(agg.drill.coursesByDimension).toEqual({});
    expect(agg.drill.conceptsByCourse).toEqual({});
  });
});

describe('aggregateAnalytics — weekly review metrics', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should compute timeliness (67%) and mastery delta (+1 day)', () => {
    // Arrange：6 次复习跨两周——上周间隔 1 天、本周间隔 2 天
    vi.useFakeTimers();
    vi.setSystemTime(at(15, 12));
    const reviews = [
      review({ id: 'a', cardId: 'c1', intervalAfter: 1, reviewedAt: at(3, 9) }),
      review({ id: 'b', cardId: 'c1', intervalAfter: 1, reviewedAt: at(5, 9) }),
      review({ id: 'c', cardId: 'c1', intervalAfter: 1, reviewedAt: at(7, 9) }),
      review({ id: 'd', cardId: 'c1', intervalAfter: 2, reviewedAt: at(10, 9) }),
      review({ id: 'e', cardId: 'c1', intervalAfter: 2, reviewedAt: at(12, 9) }),
      review({ id: 'f', cardId: 'c1', intervalAfter: 2, reviewedAt: at(14, 9) }),
    ];

    // Act
    const agg = aggregateAnalytics({ ...baseInput(), sessions: [], reviews });

    // Assert：及时 2/3≈67（间隔 1 天但 3 天后才复习的一对不达标）；掌握度 2-1=1
    expect(agg.weekly.reviewTimeliness).toBe(67);
    expect(agg.weekly.masteryDelta).toBe(1);
  });
});

describe('aggregateAnalytics — flow channel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should surface a matching-challenge insight for 6 flow sessions', () => {
    // Arrange：6 个 25 分钟且全额完成的深潜 → 中挑战×高技能
    vi.useFakeTimers();
    vi.setSystemTime(at(15, 12));
    const sessions = Array.from({ length: 6 }, (_, i) =>
      session({ id: `f${i}`, subject: '数学', completedAt: at(10 + i, 10) }));

    // Act
    const agg = aggregateAnalytics({ ...baseInput(), sessions, notes: [], feynmanNotes: [], reviews: [] });

    // Assert
    expect(agg.flow.cells).toHaveLength(9);
    expect(agg.flow.insight).toContain('你常在挑战与能力匹配的节奏中学习');
  });

  it('should advise shorter sessions when skill is low', () => {
    // Arrange：6 个完成率 50% 的 30 分钟深潜 → 中挑战×低技能
    vi.useFakeTimers();
    vi.setSystemTime(at(15, 12));
    const sessions = Array.from({ length: 6 }, (_, i) =>
      session({ id: `l${i}`, duration: 1800, actualDuration: 900, completedAt: at(10 + i, 10) }));

    // Act
    const agg = aggregateAnalytics({ ...baseInput(), sessions, notes: [], feynmanNotes: [], reviews: [] });

    // Assert
    expect(agg.flow.insight).toContain('完成率偏低');
  });
});

describe('aggregateAnalytics — mastery drill', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should derive L1 courses and L2 concepts from tags and feynman', () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(at(15, 12));

    // Act
    const agg = aggregateAnalytics(baseInput());

    // Assert：L1 维度键出课程
    expect(Object.keys(agg.drill.coursesByDimension).length).toBeGreaterThan(0);
    const focus = agg.drill.coursesByDimension['专注度'];
    expect(focus?.find((e) => e.dimension === '数学')?.value).toBe(100);

    // L2：数学课程概念（费曼 94 分 + 关联卡片笔记 60 分）
    const concepts = agg.drill.conceptsByCourse['数学'];
    expect(concepts?.length).toBeGreaterThan(0);
    expect(concepts?.[0]).toMatchObject({ dimension: '数学', value: 94 });
  });

  it('should map feynman concepts into in-progress / not-started values', () => {
    // Arrange：概念名须包含课程名（课程来自科目/标签），进行中 + 未开始
    vi.useFakeTimers();
    vi.setSystemTime(at(15, 12));
    const input = {
      ...baseInput(),
      notes: [],
      flashcards: [],
      feynmanNotes: [
        feynman({ id: 'ip', concept: '数学进阶', status: 'in_progress' }),
        feynman({ id: 'ns', concept: '数学入门', status: 'not_started' }),
      ],
    };

    // Act
    const agg = aggregateAnalytics(input);

    // Assert：进行中 40 分、未开始 10 分，挂在「数学」课程下
    const byConcept = new Map(
      (agg.drill.conceptsByCourse['数学'] ?? []).map((c) => [c.dimension, c.value]),
    );
    expect(byConcept.get('数学进阶')).toBe(40);
    expect(byConcept.get('数学入门')).toBe(10);
  });
});
