/**
 * @file 浮游生物流 -- 最近活动
 * @description 最近学习活动以浮游生物粒子流形态呈现，hover 展开详情
 * @ai-context: 替代原 DashboardPage 内联的最近活动列表，兼容 ActivityItem 数据接口
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** 活动条目（从 DashboardPage 提取的类型） */
export interface ActivityItem {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  text: string;
  time: string;
  accent: string;
  timestamp: number;
}

interface Props {
  activities: ActivityItem[];
  loading?: boolean;
}

/** 发光颜色映射 */
const glowColors: Record<string, string> = {
  pomodoro: 'rgba(251,146,60,0.5)',
  note: 'rgba(91,138,114,0.5)',
  flashcard: 'rgba(168,85,247,0.5)',
  feynman: 'rgba(34,211,238,0.5)',
};

const dotColors: Record<string, string> = {
  pomodoro: 'bg-accent-400',
  note: 'bg-brand-400',
  flashcard: 'bg-amber',
  feynman: 'bg-cyber',
};

export default function PlanktonStream({ activities, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const prefersReduced = useReducedMotion();

  if (loading) {
    return (
      <div className="rounded-[var(--kb-radius-lg)] border border-border/30 bg-bg-elevated/30 backdrop-blur-sm p-4 h-[140px] animate-pulse" />
    );
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-[var(--kb-radius-lg)] border border-cyan-400/10 bg-bg-elevated/20 backdrop-blur-sm p-6 flex flex-col items-center justify-center gap-2">
        <div className="w-8 h-8 rounded-full bg-cyber/10 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-cyber/40 animate-pulse" />
        </div>
        <span className="text-[10px] text-cyan-200/40">深海寂静中，开始学习后将有微光汇聚</span>
      </div>
    );
  }

  return (
    <motion.div
      className="rounded-[var(--kb-radius-lg)] border border-cyan-400/15 bg-bg-elevated/20 backdrop-blur-sm overflow-hidden"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label="最近活动"
    >
      <div className="p-3">
        <h3 className="text-[10px] font-medium text-cyan-200/60 mb-2">浮游生物流</h3>
        <div className="flex flex-col gap-1.5">
          <AnimatePresence>
            {activities.map((item, i) => {
              const Icon = item.icon;
              const isHovered = hoveredIdx === i;
              return (
                <motion.div
                  key={i}
                  initial={prefersReduced ? {} : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--kb-radius-sm)] hover:bg-cyber/5 transition-colors duration-300 cursor-default"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {/* 发光节点 */}
                  <div
                    className={cn('p-1 rounded-full shrink-0 transition-shadow duration-300', dotColors[item.accent] || 'bg-cyber')}
                    style={{
                      boxShadow: isHovered ? `0 0 10px ${glowColors[item.accent] || glowColors.pomodoro}` : 'none',
                    }}
                  >
                    <Icon className="w-3 h-3 text-white/90" strokeWidth={1.5} />
                  </div>
                  {/* 文本 */}
                  <span className="text-[11px] text-text-primary/80 flex-1 truncate">{item.text}</span>
                  <span className="text-[9px] text-text-tertiary/50 shrink-0 tabular-nums">{item.time}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
