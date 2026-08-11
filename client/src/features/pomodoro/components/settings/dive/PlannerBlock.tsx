/**
 * PlannerBlock — 下潜计划生成（P2 AI 规划师，本地节律优先）
 *
 * 输入今日任务数，基于近 30 天会话节律（rhythmEngine）生成预设计划：
 * 每任务一个专注组（推荐时长 + 短休），每 longBreakInterval 组安排长休。
 * 纯本地计算，零 AI 依赖（本地优先原则）；数据不足回退默认 25min。
 *
 * @ai-context: Chronos P2 规划器组件，设置页「智能领航」卡内嵌。
 */
import { useState, useCallback } from 'react';
import { CalendarClock } from 'lucide-react';
import { pomodoroSessionStore } from '@/lib/storage';
import { recommendRhythmDuration, type RhythmSession } from '../../../lib/rhythmEngine';
import type { PomodoroSession } from '@/types/models';

interface PlannerBlockProps {
  /** 短休时长（分钟，来自当前设置） */
  shortBreakMinutes: number;
  /** 长休间隔（个番茄，来自当前设置） */
  longBreakInterval: number;
}

interface DivePlan {
  focusMinutes: number;
  groups: Array<{ tasks: number; label: string }>;
  totalFocus: number;
}

/** 将 PomodoroSession 映射为节律引擎输入 */
function toRhythmSessions(sessions: PomodoroSession[]): RhythmSession[] {
  return sessions.map((s) => ({
    duration: Math.round(s.duration / 60),
    completed: !s.interrupted && s.actualDuration >= s.duration * 0.8,
    date: s.completedAt instanceof Date ? s.completedAt.toISOString() : String(s.completedAt),
  }));
}

export function PlannerBlock({
  shortBreakMinutes,
  longBreakInterval,
}: PlannerBlockProps) {
  const [taskCount, setTaskCount] = useState(3);
  const [plan, setPlan] = useState<DivePlan | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sessions = await pomodoroSessionStore.getTable()
        .where('completedAt').aboveOrEqual(since)
        .toArray();
      const rec = recommendRhythmDuration(toRhythmSessions(sessions as PomodoroSession[]));
      const focusMinutes = rec.minutes;

      // 按长休间隔分组：每组最多 longBreakInterval 个任务
      const interval = Math.max(1, longBreakInterval);
      const groups: DivePlan['groups'] = [];
      for (let i = 0; i < taskCount; i += interval) {
        const tasks = Math.min(interval, taskCount - i);
        const groupIndex = i / interval + 1;
        groups.push({
          tasks,
          label: groupIndex === 1 ? '第一组' : groupIndex === 2 ? '第二组' : `第 ${groupIndex} 组`,
        });
      }

      setPlan({
        focusMinutes,
        groups,
        totalFocus: focusMinutes * taskCount,
      });
    } catch {
      // 静默：生成失败保留旧计划
    } finally {
      setGenerating(false);
    }
  }, [taskCount, longBreakInterval]);

  return (
    <div className="mt-kb-md p-kb-md rounded-kb-lg bg-bg-secondary/40 border border-border/30">
      <div className="flex items-center gap-2 mb-kb-sm">
        <CalendarClock className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
        <h3 className="text-b2 font-medium text-text-primary">今日下潜计划</h3>
      </div>
      <p className="text-c1 text-text-tertiary mb-kb-sm">
        告诉 Chronos 你今天有几个任务，基于你的节律生成预设计划
      </p>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={8}
          value={taskCount}
          onChange={(e) => setTaskCount(Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1)))}
          className="w-16 bg-bg-tertiary border border-border/50 rounded-kb-md px-2 py-1 text-b2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          aria-label="任务数量"
        />
        <span className="text-c1 text-text-tertiary">个任务</span>
        <button
          onClick={() => void generate()}
          disabled={generating}
          className="ml-auto px-3 py-1.5 rounded-kb-sm bg-brand-500/15 text-brand-600 dark:text-brand-400 text-c1 border border-brand-500/30 transition-all active:scale-95 disabled:opacity-50"
        >
          {generating ? '规划中…' : '生成计划'}
        </button>
      </div>

      {plan && (
        <div className="mt-kb-sm space-y-1">
          {plan.groups.map((g, i) => (
            <div key={i} className="flex items-center justify-between text-c1">
              <span className="text-text-secondary">{g.label} · {g.tasks} 个任务</span>
              <span className="text-text-tertiary">
                {g.tasks} × {plan.focusMinutes}min 专注
                {i < plan.groups.length - 1 ? ` + ${shortBreakMinutes}min 短休` : ''}
              </span>
            </div>
          ))}
          <div className="pt-1.5 mt-1.5 border-t border-border/20 flex items-center justify-between">
            <span className="text-c1 text-text-tertiary">总计专注 {plan.totalFocus}min</span>
            <span className="text-c1 text-brand-500">✨ 基于你的节律推荐</span>
          </div>
        </div>
      )}
    </div>
  );
}