/**
 * @ai-context: 通用组件：AchievementPanel。
 */
import { useEffect, useState } from 'react';
import {
  Timer, Layers, Lightbulb, FileText, Flame, Trophy, Medal,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { db } from '@/lib/storage/database';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements/definitions';
import type { Achievement } from '@/types/models';

const ICON_MAP: Record<string, LucideIcon> = {
  Timer,
  Layers,
  Lightbulb,
  FileText,
  Flame,
  Trophy,
  Medal,
};

function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function AchievementPanel() {
  const [unlockedMap, setUnlockedMap] = useState<Record<string, Achievement>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.achievements
      .toArray()
      .then((achievements) => {
        const map: Record<string, Achievement> = {};
        achievements.forEach((a) => { map[a.key] = a; });
        setUnlockedMap(map);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="flex flex-col gap-kb-md">
      <h2 className="text-h2 font-semibold text-text-primary">成就墙</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-kb-md">
        {ACHIEVEMENT_DEFS.map((def) => {
          const Icon = ICON_MAP[def.icon] ?? Timer;
          const unlocked = unlockedMap[def.key];
          return (
            <Card
              key={def.key}
              variant="default"
              padding="md"
              className={cn(
                'flex flex-col items-center gap-kb-sm text-center transition-all duration-kb-normal',
                !unlocked && !loading && 'opacity-40 grayscale',
              )}
            >
              <div
                className={cn(
                  'p-2.5 rounded-kb-lg',
                  unlocked ? 'bg-brand-500/10 text-brand-600' : 'bg-bg-tertiary text-text-tertiary',
                )}
              >
                <Icon className="w-icon-md h-icon-md" strokeWidth={1.5} />
              </div>
              <span className={cn(
                'text-b2 font-medium',
                unlocked ? 'text-text-primary' : 'text-text-tertiary',
              )}>
                {def.title}
              </span>
              <span className="text-c1 text-text-tertiary leading-tight">
                {def.description}
              </span>
              {unlocked && (
                <span className="text-c1 text-brand-500 font-medium">
                  ✓ {formatDate(unlocked.unlockedAt)}
                </span>
              )}
              {!unlocked && !loading && (
                <span className="text-c1 text-text-quaternary">未解锁</span>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
