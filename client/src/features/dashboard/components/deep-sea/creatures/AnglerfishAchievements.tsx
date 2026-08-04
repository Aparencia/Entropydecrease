/**
 * @file 灯笼鱼成就墙 -- 成就体系
 * @description 每个成就以深海灯笼鱼形态呈现，已解锁成就灯笼发光，未解锁则暗淡
 * @ai-context: 替代原 AchievementPanel.tsx，使用 db.achievements + ACHIEVEMENT_DEFS
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Timer, Layers, Lightbulb, FileText, Flame, Trophy, Medal, Repeat, ListChecks, Award,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/storage/database';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements/definitions';
import type { Achievement } from '@/types/models';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useNavigate } from 'react-router-dom';

const ICON_MAP: Record<string, LucideIcon> = { Timer, Layers, Lightbulb, FileText, Flame, Trophy, Medal, Repeat, ListChecks };

function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function AnglerfishAchievements() {
  const navigate = useNavigate();
  const [unlockedMap, setUnlockedMap] = useState<Record<string, Achievement>>({});
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    db.achievements
      .toArray()
      .then((achievements) => {
        const map: Record<string, Achievement> = {};
        achievements.forEach((a) => { map[a.key] = a; });
        setUnlockedMap(map);
      });
  }, []);

  const unlockedCount = Object.keys(unlockedMap).length;

  return (
    <motion.div
      className="rounded-[var(--kb-radius-lg)] border border-cyan-400/15 bg-bg-elevated/20 backdrop-blur-sm p-3 overflow-hidden"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label={`成就墙，已解锁 ${unlockedCount} 个`}
    >
      {/* 标题 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-medium text-cyan-200/60">灯笼鱼成就</h3>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-amber-300/50">{unlockedCount}/{ACHIEVEMENT_DEFS.length}</span>
          {/* R9 成就证书入口：跳转打印页生成证书 */}
          <button
            onClick={() => navigate('/certificate')}
            className="flex items-center gap-0.5 text-[9px] text-cyan-200/50 hover:text-cyan-200 transition-colors"
            title="生成成就证书"
          >
            <Award className="w-3 h-3" strokeWidth={1.5} /> 证书
          </button>
        </div>
      </div>

      {/* 成就网格 */}
      <div className="grid grid-cols-4 gap-2">
        {ACHIEVEMENT_DEFS.map((def, i) => {
          const Icon = ICON_MAP[def.icon] ?? Timer;
          const unlocked = unlockedMap[def.key];
          const isUnlocked = !!unlocked;

          return (
            <motion.div
              key={def.key}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-[var(--kb-radius-md)] transition-all duration-500',
                isUnlocked
                  ? 'bg-amber-400/5 hover:bg-amber-400/10'
                  : 'bg-bg-tertiary/10 hover:bg-bg-tertiary/20',
              )}
              initial={prefersReduced ? {} : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              whileHover={{ scale: 1.08 }}
              title={def.description}
            >
              {/* 灯笼发光体 */}
              <div
                className={cn(
                  'relative p-1.5 rounded-full transition-all duration-500',
                  isUnlocked
                    ? 'bg-amber-400/15 text-amber-300'
                    : 'bg-bg-tertiary/30 text-text-tertiary/40',
                )}
                style={{
                  boxShadow: isUnlocked
                    ? '0 0 12px rgba(251, 191, 36, 0.3), 0 0 4px rgba(251, 191, 36, 0.2)'
                    : 'none',
                }}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                {/* 发光脉冲（已解锁） */}
                {isUnlocked && !prefersReduced && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    animate={{
                      boxShadow: [
                        '0 0 8px rgba(251, 191, 36, 0.2)',
                        '0 0 16px rgba(251, 191, 36, 0.4)',
                        '0 0 8px rgba(251, 191, 36, 0.2)',
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>
              <span className={cn(
                'text-[8px] font-medium text-center leading-tight',
                isUnlocked ? 'text-text-primary/80' : 'text-text-tertiary/40',
              )}>
                {def.title}
              </span>
              {isUnlocked && (
                <span className="text-[7px] text-amber-300/50">{formatDate(unlocked.unlockedAt)}</span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
