/**
 * 成就解锁评估器测试 / Achievement evaluator tests
 *
 * @ai-context: 覆盖 R9 扩展——里程碑型成就（百颗番茄/百卡复习/十次费曼/
 * 二十篇笔记）按数据库累计计数解锁、sop_first_run 一次性事件解锁；已解锁
 * key 不重复解锁。database 全 Mock，绝不触碰真实 IndexedDB。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAchievements, type AchievementEvent } from './evaluator';

interface MockDb {
  achievements: { toArray: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
  pomodoroSessions: { count: ReturnType<typeof vi.fn> };
  flashcardReviews: { count: ReturnType<typeof vi.fn> };
  feynmanNotes: { where: ReturnType<typeof vi.fn> };
  notes: { count: ReturnType<typeof vi.fn> };
}

const mocks = vi.hoisted(() => ({
  db: {} as MockDb,
  feynmanWhereResult: { equals: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.feynmanWhereResult.equals.mockReturnValue({ count: vi.fn().mockResolvedValue(0) });
  mocks.db.achievements = { toArray: vi.fn().mockResolvedValue([]), add: vi.fn().mockResolvedValue('id') };
  mocks.db.pomodoroSessions = { count: vi.fn().mockResolvedValue(0) };
  mocks.db.flashcardReviews = { count: vi.fn().mockResolvedValue(0) };
  mocks.db.feynmanNotes = { where: vi.fn().mockReturnValue(mocks.feynmanWhereResult) };
  mocks.db.notes = { count: vi.fn().mockResolvedValue(0) };
});

async function run(event: AchievementEvent): Promise<string[]> {
  const unlocked = await checkAchievements(event, mocks.db as unknown as Parameters<typeof checkAchievements>[1]);
  return unlocked.map((a) => a.key);
}

describe('checkAchievements (R9 milestone extension)', () => {
  it('should unlock pomodoro_100 only when 100+ sessions recorded', async () => {
    mocks.db.pomodoroSessions.count.mockResolvedValue(99);
    expect(await run({ type: 'pomodoro_completed' })).not.toContain('pomodoro_100');
    mocks.db.pomodoroSessions.count.mockResolvedValue(100);
    expect(await run({ type: 'pomodoro_completed' })).toContain('pomodoro_100');
  });

  it('should unlock reviews_100 on review_completed with 100+ reviews', async () => {
    mocks.db.flashcardReviews.count.mockResolvedValue(100);
    expect(await run({ type: 'review_completed' })).toContain('reviews_100');
  });

  it('should unlock feynman_10 only when 10+ completed feynman notes', async () => {
    mocks.feynmanWhereResult.equals.mockReturnValue({ count: vi.fn().mockResolvedValue(9) });
    expect(await run({ type: 'feynman_completed' })).not.toContain('feynman_10');
    mocks.feynmanWhereResult.equals.mockReturnValue({ count: vi.fn().mockResolvedValue(10) });
    expect(await run({ type: 'feynman_completed' })).toContain('feynman_10');
  });

  it('should unlock notes_20 when 20+ notes exist', async () => {
    mocks.db.notes.count.mockResolvedValue(20);
    expect(await run({ type: 'note_created' })).toContain('notes_20');
  });

  it('should unlock sop_first_run on sop_completed event', async () => {
    expect(await run({ type: 'sop_completed' })).toContain('sop_first_run');
  });

  it('should not re-unlock achievements already present', async () => {
    mocks.db.achievements.toArray.mockResolvedValue([{ key: 'sop_first_run' }]);
    expect(await run({ type: 'sop_completed' })).not.toContain('sop_first_run');
    expect(mocks.db.achievements.add).not.toHaveBeenCalled();
  });

  it('should unlock starter achievements on their events', async () => {
    expect(await run({ type: 'pomodoro_completed' })).toContain('first_pomodoro');
    expect(await run({ type: 'feynman_completed' })).toContain('first_feynman');
    expect(await run({ type: 'note_created' })).toContain('first_note');
  });

  it('should not break the chain when a milestone count query fails', async () => {
    // reviews_100 的计数查询失败 → 视为未达标，但同批其他成就仍正常检查
    mocks.db.flashcardReviews.count.mockRejectedValue(new Error('quota exceeded'));
    const unlocked = await run({ type: 'sop_completed' });
    expect(unlocked).toContain('sop_first_run');
    expect(unlocked).not.toContain('reviews_100');
  });

  it('should resolve (not reject) when a count query throws mid-loop', async () => {
    mocks.db.pomodoroSessions.count.mockRejectedValue(new Error('db unavailable'));
    await expect(run({ type: 'pomodoro_completed' })).resolves.toBeInstanceOf(Array);
    // first_pomodoro 不依赖计数，仍解锁；pomodoro_100 静默视为未达标
    expect(await run({ type: 'pomodoro_completed' })).toContain('first_pomodoro');
  });

  it('should skip silently when add rejected by unique index (concurrent unlock)', async () => {
    mocks.db.achievements.add.mockRejectedValue(new Error('ConstraintError'));
    await expect(run({ type: 'sop_completed' })).resolves.not.toThrow();
    expect(mocks.db.achievements.add).toHaveBeenCalled();
  });
});
