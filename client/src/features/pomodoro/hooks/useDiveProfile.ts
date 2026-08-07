/**
 * useDiveProfile — 潜航档案数据洞察
 *
 * 聚合近 30 天 pomodoroSessions，生成「下潜档案」所需的统计与主题化洞察文案。
 * 数据不足（<5 次潜次）时返回引导态，不展示空数据。
 *
 * @ai-context: 设置页数据驱动改造——卡片展示当前值 + 数据依据。
 */
import { useEffect, useState } from 'react';
import { pomodoroSessionStore } from '@/lib/storage';
import type { PomodoroSession } from '@/types/models';

/** 数据不足阈值：少于该次数不展示洞察 */
const MIN_SESSION_COUNT = 5;

export interface DiveProfileStats {
  /** 近 30 天潜次总数 */
  totalDives: number;
  /** 潜次完成率（未中断且实际≥80% 计划时长） */
  completionRate: number;
  /** 平均实际专注时长（分钟） */
  avgFocusMinutes: number;
  /** 最常使用的时段（如 "14-16 点"） */
  bestTimeRange: string;
  /** 被打断比例（%） */
  interruptedRate: number;
  /** 数据是否充足（≥5 次潜次） */
  sufficient: boolean;
  /** 顶部档案摘要文案 */
  summaryText: string;
  /** 时长卡洞察文案 */
  durationInsight: string;
  /** 预警卡洞察文案 */
  alertInsight: string;
}

/** 时段分桶：按完成时间映射到 2 小时区间 */
function bucketOfHour(hour: number): string {
  const start = Math.floor(hour / 2) * 2;
  return `${String(start).padStart(2, '0')}-${String(start + 2).padStart(2, '0')} 点`;
}

export function useDiveProfile(): DiveProfileStats {
  const [stats, setStats] = useState<DiveProfileStats>({
    totalDives: 0,
    completionRate: 0,
    avgFocusMinutes: 0,
    bestTimeRange: '',
    interruptedRate: 0,
    sufficient: false,
    summaryText: '',
    durationInsight: '',
    alertInsight: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sessions = await pomodoroSessionStore.getTable()
          .where('completedAt').aboveOrEqual(since)
          .toArray();
        if (cancelled) return;

        if (sessions.length < MIN_SESSION_COUNT) {
          setStats({
            totalDives: sessions.length,
            completionRate: 0,
            avgFocusMinutes: 0,
            bestTimeRange: '',
            interruptedRate: 0,
            sufficient: false,
            summaryText: '完成几次下潜后，这里会显示你的专属节律分析',
            durationInsight: '',
            alertInsight: '',
          });
          return;
        }

        const completed = sessions.filter(
          (s: PomodoroSession) => !s.interrupted && s.actualDuration >= s.duration * 0.8,
        );
        const completionRate = Math.round((completed.length / sessions.length) * 100);
        const avgFocusMinutes = Math.round(
          sessions.reduce((sum, s) => sum + s.actualDuration, 0) / sessions.length / 60,
        );
        const interruptedRate = Math.round(
          (sessions.filter((s) => s.interrupted).length / sessions.length) * 100,
        );

        // 最佳时段：按完成时间分桶统计完成次数
        const bucketCounts = new Map<string, number>();
        for (const s of sessions) {
          const d = s.completedAt instanceof Date ? s.completedAt : new Date(s.completedAt);
          const bucket = bucketOfHour(d.getHours());
          bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
        }
        let bestBucket = '';
        let bestCount = 0;
        bucketCounts.forEach((count, bucket) => {
          if (count > bestCount) { bestCount = count; bestBucket = bucket; }
        });

        setStats({
          totalDives: sessions.length,
          completionRate,
          avgFocusMinutes,
          bestTimeRange: bestBucket,
          interruptedRate,
          sufficient: true,
          summaryText: `近 30 天 ${sessions.length} 次下潜 · 最佳时段 ${bestBucket}`,
          durationInsight: completed.length > 0
            ? `完成率 ${completionRate}% · 平均专注 ${avgFocusMinutes}min`
            : '',
          alertInsight: interruptedRate >= 10
            ? `${interruptedRate}% 的潜次被意外打断，建议开启预警`
            : '',
        });
      } catch {
        // 静默失败：数据不可用时保持初始引导态
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return stats;
}