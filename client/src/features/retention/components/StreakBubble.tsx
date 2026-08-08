/**
 * 气泡 Streak 显示组件
 * Bubble streak display component
 *
 * @ai-context: Dashboard 角落的浮动气泡，显示连续天数。点击展开本周日历视图。
 * 无排名、无比较（4.5 节约束）。洋流休息日显示为水波纹。
 * @ai-context: Floating bubble in Dashboard corner showing consecutive days.
 * Click to expand weekly calendar view. No ranking/comparison (4.5 constraint).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getWeekView } from '../lib/streakEngine';
import type { StreakState } from '../types';

const DOW_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

export interface StreakBubbleProps {
  streakState: StreakState | null;
}

export function StreakBubble({ streakState }: StreakBubbleProps) {
  const prefersReduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  if (!streakState || streakState.currentStreak === 0) return null;

  const weekView = getWeekView(streakState, new Date());

  return (
    <div className="relative">
      {/* 气泡按钮 / Bubble button —— 浅色模式适配：加深背景色与文字色，确保白底上可读 */}
      <motion.button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
          'bg-orange-100 dark:bg-orange-400/10 border border-orange-200 dark:border-orange-300/20',
          'text-orange-600 dark:text-orange-300 text-xs font-medium',
          'hover:bg-orange-200 dark:hover:bg-orange-400/20 transition-colors',
        )}
        whileTap={prefersReduced ? {} : { scale: 0.95 }}
      >
        <Flame className="w-3.5 h-3.5" strokeWidth={1.5} />
        {streakState.currentStreak} 天
      </motion.button>

      {/* 展开面板 / Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className={cn(
              'absolute top-full mt-2 right-0 z-50 w-56 p-3 rounded-xl',
              'bg-[#0d1b2e]/95 backdrop-blur-md border border-white/10 shadow-xl',
            )}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2 }}
          >
            {/* 标题 / Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-white/50">本周学习</span>
              <button
                onClick={() => setExpanded(false)}
                className="p-1 rounded text-white/30 hover:text-white/60"
                aria-label="关闭"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* 周日历 / Week calendar */}
            <div className="flex justify-between gap-1">
              {weekView.map((day, i) => (
                <div key={day.date} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] text-white/30">{DOW_SHORT[i]}</span>
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[9px]',
                      day.isActive && 'bg-cyber/30 text-cyber shadow-[0_0_6px_rgba(74,155,217,0.3)]',
                      day.isRestDay && !day.isActive && 'bg-blue-400/10 text-blue-300/50 border border-blue-300/20 border-dashed',
                      !day.isActive && !day.isRestDay && 'bg-white/5 text-white/20',
                      day.isToday && 'ring-1 ring-white/30',
                    )}
                    title={day.isRestDay ? '洋流休息日' : day.isActive ? '已学习' : '未学习'}
                  >
                    {day.isActive ? '·' : day.isRestDay ? '~' : ''}
                  </div>
                </div>
              ))}
            </div>

            {/* 统计 / Stats */}
            <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-[10px] text-white/30">
              <span>最长 {streakState.longestStreak} 天</span>
              <span>休息日：周{DOW_SHORT[streakState.restDayPreference]}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
