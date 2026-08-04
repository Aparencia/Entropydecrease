/**
 * 侧边栏学习进度聚合 Hook
 *
 * @ai-context: 从各功能模块 store 聚合真实学习数据，构造侧边栏进度条所需
 * 的 { subject, progress } 结构。数据来源：番茄钟会话记录、闪卡复习统计、
 * 笔记数量、费曼笔记完成度、连续打卡天数。每次挂载时异步加载一次。
 */
import { useState, useEffect } from 'react';
import { db } from '@/lib/storage/database';
import { useFeynmanStore } from '@/features/feynman/store/useFeynmanStore';
import { useNoteStore } from '@/features/notes/store/useNoteStore';

/** 单个学习模块的进度数据 */
export interface LearningProgressItem {
  /** 模块名称（侧边栏显示标签） */
  subject: string;
  /** 进度百分比 0-100 */
  progress: number;
}

/** 每日番茄钟目标数（默认 8 个），用于计算深潜进度 */
const DAILY_POMODORO_GOAL = 8;

/**
 * 聚合侧边栏学习进度
 *
 * 进度模块说明：
 * - 深潜专注：今日完成番茄数 / 每日目标（8个）
 * - 闪卡复习：今日已复习卡片数 / 全部到期卡片数（无到期则按总卡片算）
 * - 笔记积累：有内容的笔记数 / 总笔记数
 * - 费曼讲解：已完成的费曼笔记数 / 总费曼笔记数
 * - 连续打卡：连续打卡天数（每天算 1 点进度，上限 30 天映射 100%）
 */
export function useLearningProgress(): LearningProgressItem[] {
  const [items, setItems] = useState<LearningProgressItem[]>([]);

  // 订阅费曼 store 数据
  const feynmanLoadNotes = useFeynmanStore((s) => s.loadNotes);
  const feynmanGetStats = useFeynmanStore((s) => s.getStats);

  // 订阅笔记 store 数据
  const notes = useNoteStore((s) => s.notes);
  const loadNotes = useNoteStore((s) => s.loadNotes);

  useEffect(() => {
    let cancelled = false;

    async function compute() {
      // 确保各 store 数据已加载（闪卡直接查 DB，无需预加载）
      await Promise.all([feynmanLoadNotes(), loadNotes()]);

      if (cancelled) return;

      const result: LearningProgressItem[] = [];

      // ── 1. 深潜专注：今日完成番茄数 / 每日目标 ──
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      try {
        const sessions = await db.pomodoroSessions
          .where('completedAt')
          .aboveOrEqual(todayStart)
          .toArray();
        const todayCount = sessions.filter((s) => !s.interrupted).length;
        const pomodoroProgress = Math.min(100, Math.round((todayCount / DAILY_POMODORO_GOAL) * 100));
        result.push({ subject: '深潜专注', progress: pomodoroProgress });
      } catch {
        // 数据库读取失败时显示 0%
        result.push({ subject: '深潜专注', progress: 0 });
      }

      // ── 2. 闪卡复习：已学卡占总卡比例 ──
      try {
        const allCards = await db.flashcards.toArray();
        if (allCards.length > 0) {
          const reviewedCards = allCards.filter((c: any) => c.repetitions > 0);
          const flashcardProgress = Math.min(100, Math.round((reviewedCards.length / allCards.length) * 100));
          result.push({ subject: '闪卡复习', progress: flashcardProgress });
        } else {
          result.push({ subject: '闪卡复习', progress: 0 });
        }
      } catch {
        result.push({ subject: '闪卡复习', progress: 0 });
      }

      // ── 3. 笔记积累：有实质内容的笔记占比 ──
      if (notes.length > 0) {
        const withContent = notes.filter(
          (n) => n.content && n.content.length > 50,
        );
        const noteProgress = Math.round((withContent.length / notes.length) * 100);
        result.push({ subject: '笔记积累', progress: noteProgress });
      } else {
        result.push({ subject: '笔记积累', progress: 0 });
      }

      // ── 4. 费曼讲解：完成的费曼笔记占比 ──
      const feynmanStats = feynmanGetStats();
      if (feynmanStats.total > 0) {
        const feynmanProgress = Math.round((feynmanStats.completed / feynmanStats.total) * 100);
        result.push({ subject: '费曼讲解', progress: feynmanProgress });
      } else {
        result.push({ subject: '费曼讲解', progress: 0 });
      }

      // ── 5. 连续打卡：连续天数映射进度（30天 = 100%） ──
      try {
        // FRONT2-M3: 用本地日期（与 useCheckIn 写入格式一致）——原实现取 UTC
        // 日期，UTC+8 用户凌晨 0-8 点会查到 UTC 昨天，打卡进度显示 0
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayRecord = await db.studyCheckIns.where('date').equals(today).first();
        if (todayRecord) {
          const streakProgress = Math.min(100, Math.round((todayRecord.streakDays / 30) * 100));
          result.push({ subject: '连续打卡', progress: streakProgress });
        }
      } catch {
        // 打卡记录读取失败时不显示此项
      }

      if (!cancelled) setItems(result);
    }

    compute();
    return () => { cancelled = true; };
  }, [feynmanLoadNotes, feynmanGetStats, loadNotes, notes.length]);

  return items;
}
