/**
 * 精力-任务匹配提示条（T5）
 *
 * @ai-context: 基于近 30 天 pomodoroSessions 计算当前时段精力档位，
 * 展示"当前时段适合做什么"建议条；纯本地计算，零 AI 依赖，
 * 数据不足时不渲染（不打扰原则）。
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { pomodoroSessionStore } from '@/lib/storage';
import type { PomodoroSession } from '@/types/models';
import { matchTaskToEnergy, type TaskSuggestion } from '../lib/energyMatcher';
import type { RhythmSession } from '../lib/rhythmEngine';

/** 将 PomodoroSession 映射为节律引擎输入：未中断且完成 ≥80% 视为完成 */
function toRhythmSessions(sessions: PomodoroSession[]): RhythmSession[] {
  return sessions.map((s) => ({
    duration: Math.round(s.duration / 60),
    completed: !s.interrupted && s.actualDuration >= s.duration * 0.8,
    date: new Date(s.completedAt).toISOString(),
  }));
}

export function EnergySuggestionBar() {
  const [suggestion, setSuggestion] = useState<TaskSuggestion | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sessions = await pomodoroSessionStore.getTable()
          .where('completedAt').aboveOrEqual(since)
          .toArray();
        if (cancelled || sessions.length === 0) return;
        setSuggestion(matchTaskToEnergy(toRhythmSessions(sessions)));
      } catch {
        // 静默失败，不影响主界面
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!suggestion) return null;

  return (
    <Link
      to={suggestion.route}
      className="flex items-center gap-3 px-4 py-2.5 rounded-kb-md bg-bg-secondary/70 border border-border/40 hover:border-brand/40 transition-colors group"
    >
      <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
        <Zap className="w-3.5 h-3.5 text-brand" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-b3 font-medium text-text-primary truncate">
          当前时段建议：{suggestion.label}
        </p>
        <p className="text-c1 text-text-tertiary truncate">{suggestion.description}</p>
      </div>
    </Link>
  );
}
