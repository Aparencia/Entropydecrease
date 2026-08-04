/**
 * 成就解锁评估器
 *
 * @ai-context: 成就判定为一次性解锁（已解锁的 key 跳过）。db 通过默认参数注入，
 * 测试时可传入 Mock 数据库实例，禁止在测试中连接真实 IndexedDB。
 * @ai-context: 副作用——命中条件时写入 achievements 表。
 */

import { db } from '@/lib/storage/database';
import { ACHIEVEMENT_DEFS } from './definitions';
import type { Achievement } from '@/types/models';

export type AchievementEvent = 
  | { type: 'pomodoro_completed' }
  | { type: 'flashcard_created' }
  | { type: 'feynman_completed' }
  | { type: 'note_created' }
  | { type: 'streak_updated'; days: number }
  | { type: 'review_completed' }
  | { type: 'sop_completed' };

/**
 * 检查成就解锁条件，返回新解锁的成就列表
 *
 * 里程碑型成就（pomodoro_100 等）以事件为触发时机、内部查询数据库累计
 * 计数判定，调用方无需统计总数；sop 数据在 SQLite，sop_first_run 为
 * 一次性事件型（触发即解锁）。
 *
 * 容错设计：计数查询失败视为未达标（safeCount），写入被 &key 唯一索引
 * 拦截（并发重复解锁）时静默跳过——成就检查是尽力而为，任何单项失败
 * 都不中断整条检查链，也不影响主流程。
 */
export async function checkAchievements(
  event: AchievementEvent,
  database: typeof db = db,
): Promise<Achievement[]> {
  const unlocked: Achievement[] = [];
  const existingKeys = (await database.achievements.toArray()).map(a => a.key);

  for (const def of ACHIEVEMENT_DEFS) {
    if (existingKeys.includes(def.key)) continue; // 已解锁

    let shouldUnlock = false;

    switch (def.key) {
      case 'first_pomodoro':
        shouldUnlock = event.type === 'pomodoro_completed';
        break;
      case 'first_card':
        shouldUnlock = event.type === 'flashcard_created';
        break;
      case 'first_feynman':
        shouldUnlock = event.type === 'feynman_completed';
        break;
      case 'first_note':
        shouldUnlock = event.type === 'note_created';
        break;
      case 'streak_3':
        shouldUnlock = event.type === 'streak_updated' && event.days >= 3;
        break;
      case 'streak_7':
        shouldUnlock = event.type === 'streak_updated' && event.days >= 7;
        break;
      case 'streak_30':
        shouldUnlock = event.type === 'streak_updated' && event.days >= 30;
        break;
      case 'pomodoro_100':
        shouldUnlock = event.type === 'pomodoro_completed'
          && (await safeCount(database.pomodoroSessions.count())) >= 100;
        break;
      case 'reviews_100':
        shouldUnlock = event.type === 'review_completed'
          && (await safeCount(database.flashcardReviews.count())) >= 100;
        break;
      case 'feynman_10':
        shouldUnlock = event.type === 'feynman_completed'
          && (await safeCount(database.feynmanNotes.where('status').equals('completed').count())) >= 10;
        break;
      case 'notes_20':
        shouldUnlock = event.type === 'note_created'
          && (await safeCount(database.notes.count())) >= 20;
        break;
      case 'sop_first_run':
        shouldUnlock = event.type === 'sop_completed';
        break;
    }

    if (shouldUnlock) {
      const achievement: Achievement = {
        id: crypto.randomUUID(),
        key: def.key,
        title: def.title,
        description: def.description,
        icon: def.icon,
        unlockedAt: new Date(),
      };
      try {
        await database.achievements.add(achievement);
        unlocked.push(achievement);
      } catch {
        // 并发下 &key 唯一索引拦截重复写入（成就已由并发调用解锁）——静默跳过
      }
    }
  }

  return unlocked;
}

/** 安全计数：查询失败视为 0（成就检查尽力而为，不因存储异常中断整条检查链） */
async function safeCount(p: Promise<number>): Promise<number> {
  try {
    return await p;
  } catch {
    return 0;
  }
}
