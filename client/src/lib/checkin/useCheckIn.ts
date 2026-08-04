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
  // 使用本地日期而非 UTC，避免 UTC+8 用户凌晨 0-8 点 streak 错位
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function yesterdayStr(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function useCheckIn(moduleName: string) {
  const [todayCheckIn, setTodayCheckIn] = useState<StudyCheckIn | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);

  const checkIn = useCallback(async () => {
    try {
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
    } catch (err) {
      console.error('[CheckIn] Failed to record check-in:', err);
    }
  }, [moduleName]);

  const loadMonthData = useCallback(async () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const records = await db.studyCheckIns.where('date').aboveOrEqual(firstDay).toArray();
    return records as StudyCheckIn[];
  }, []);

  // 加载已有打卡记录，但不自动打卡（由用户显式触发）
  useEffect(() => {
    (async () => {
      try {
        const today = todayStr();
        const existing = await db.studyCheckIns.where('date').equals(today).first();
        if (existing) {
          setTodayCheckIn(existing as StudyCheckIn);
          setStreakDays(existing.streakDays);
        }
      } catch (err) {
        console.error('[CheckIn] Failed to load today check-in:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { todayCheckIn, streakDays, loading, checkIn, loadMonthData };
}
