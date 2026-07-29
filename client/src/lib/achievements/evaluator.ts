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
  | { type: 'streak_updated'; days: number };

/**
 * 检查成就解锁条件，返回新解锁的成就列表
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
      await database.achievements.add(achievement);
      unlocked.push(achievement);
    }
  }

  return unlocked;
}
