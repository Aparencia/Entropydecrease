/**
 * 学习打卡 Hook
 *
 * @ai-context: streakDays 连续性以本地日期字符串（YYYY-MM-DD）判定，
 * 跨时区/改系统时间会产生断签，为已知接受的限制。
 */
import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/storage/database';
import type { StudyCheckIn } from '@/types/models';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

function todayStr(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function useCheckIn(moduleName: string) {
  const [todayCheckIn, setTodayCheckIn] = useState<StudyCheckIn | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);

  const checkIn = useCallback(async () => {
    const today = todayStr();
    const existing = await db.studyCheckIns.where('date').equals(today).first();
    if (existing) {
      // 如果今天已打卡但模块未记录，追加模块
      if (!existing.modulesUsed.includes(moduleName)) {
        existing.modulesUsed.push(moduleName);
        await db.studyCheckIns.update(existing.id, { modulesUsed: existing.modulesUsed });
      }
      setTodayCheckIn(existing as StudyCheckIn);
      setStreakDays(existing.streakDays);
      return;
    }

    // 计算连续天数
    const yesterday = yesterdayStr();
    const lastRecord = await db.studyCheckIns.where('date').equals(yesterday).first();
    const newStreak = lastRecord ? lastRecord.streakDays + 1 : 1;

    const record: StudyCheckIn = {
      id: crypto.randomUUID(),
      date: today,
      checkInTime: new Date(),
      modulesUsed: [moduleName],
      streakDays: newStreak,
    };

    await db.studyCheckIns.put(record);
    soundPlayer.play('daily_checkin');
    setTodayCheckIn(record);
    setStreakDays(newStreak);
  }, [moduleName]);

  const loadMonthData = useCallback(async () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const records = await db.studyCheckIns.where('date').aboveOrEqual(firstDay).toArray();
    return records as StudyCheckIn[];
  }, []);

  useEffect(() => {
    checkIn().finally(() => setLoading(false));
  }, [checkIn]);

  return { todayCheckIn, streakDays, loading, checkIn, loadMonthData };
}
