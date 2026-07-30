/**
 * @ai-context: 通用组件：GoalMemory。
 */
import { useEffect, useState } from 'react';
import { db } from '@/lib/storage';
import type { PomodoroGoal } from '@/types/models';
import { cn } from '@/lib/utils';

interface GoalMemoryProps {
  onSelect: (text: string) => void;
}

export default function GoalMemory({ onSelect }: GoalMemoryProps) {
  const [goals, setGoals] = useState<PomodoroGoal[]>([]);

  useEffect(() => {
    // 按 useCount 降序加载常用目标
    db.pomodoroGoals
      .orderBy('useCount')
      .reverse()
      .limit(8)
      .toArray()
      .then(setGoals)
      .catch(() => {});
  }, []);

  if (goals.length === 0) return null;

  return (
    <div className="mt-kb-sm">
      <p className="text-c1 text-text-tertiary mb-1.5">常用目标</p>
      <div className="flex flex-wrap gap-1.5">
        {goals.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.text)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-kb-full',
              'bg-bg-tertiary hover:bg-bg-secondary',
              'text-b2 text-text-secondary hover:text-text-primary',
              'transition-all duration-kb-fast',
            )}
          >
            <span className="truncate max-w-[120px]">{g.text}</span>
            <span className="text-c1 text-text-tertiary">{g.useCount}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
