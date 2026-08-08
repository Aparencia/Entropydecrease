/**
 * @file 深海珍珠 -- 目标进度
 * @description 学习目标以深海珍珠生长形态呈现，珍珠大小/光泽 = 完成度
 * @ai-context: 新增组件，使用 GoalProgress 数据接口
 */
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { GoalProgress } from '@/features/dashboard/types/analytics';

interface Props {
  goals: GoalProgress[];
  loading?: boolean;
}

/** 根据进度计算珍珠视觉参数 */
function pearlStyle(percent: number) {
  const size = 24 + (percent / 100) * 24; // 24-48px
  const glow = Math.round((percent / 100) * 40) / 100; // 0-0.4
  const hue = percent >= 100 ? '45' : '180'; // 金色=完成, 青色=进行中
  return { size, glow, hue };
}

export default function PearlGoal({ goals, loading }: Props) {
  const prefersReduced = useReducedMotion();

  if (loading) {
    return (
      <div className="rounded-[var(--kb-radius-lg)] border border-border/30 bg-bg-elevated/30 backdrop-blur-sm p-4 h-[120px] animate-pulse" />
    );
  }

  if (!goals.length) return null;

  return (
    <motion.div
      className="rounded-[var(--kb-radius-lg)] border border-cyber/15 bg-bg-elevated/20 backdrop-blur-sm p-3"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label="目标进度"
    >
      <h3 className="text-[10px] font-medium text-cyber/60 mb-3">深海珍珠 -- 本周目标</h3>
      <div className="flex items-end justify-around gap-3">
        {goals.map((goal, i) => {
          const ps = pearlStyle(goal.progressPercent);
          return (
            <motion.div
              key={goal.id}
              className="flex flex-col items-center gap-1.5"
              initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.5, ease: 'easeOut' }}
            >
              {/* 珍珠 */}
              <motion.div
                className="relative rounded-full flex items-center justify-center"
                style={{
                  width: ps.size,
                  height: ps.size,
                  background: `radial-gradient(circle at 35% 35%, hsla(${ps.hue}, 80%, 80%, ${0.3 + ps.glow}), hsla(${ps.hue}, 60%, 40%, ${0.1 + ps.glow * 0.5}))`,
                  boxShadow: `0 0 ${ps.glow * 20}px hsla(${ps.hue}, 70%, 60%, ${ps.glow * 0.6}), inset 0 0 ${ps.glow * 10}px hsla(${ps.hue}, 80%, 90%, ${ps.glow * 0.3})`,
                }}
                animate={!prefersReduced ? {
                  boxShadow: [
                    `0 0 ${ps.glow * 15}px hsla(${ps.hue}, 70%, 60%, ${ps.glow * 0.4})`,
                    `0 0 ${ps.glow * 25}px hsla(${ps.hue}, 70%, 60%, ${ps.glow * 0.7})`,
                    `0 0 ${ps.glow * 15}px hsla(${ps.hue}, 70%, 60%, ${ps.glow * 0.4})`,
                  ],
                } : {}}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span className="text-[9px] font-bold text-white/80 tabular-nums">
                  {goal.progressPercent}%
                </span>
              </motion.div>
              {/* 标签 */}
              <span className="text-[8px] text-cyber/50 text-center leading-tight max-w-[60px]">
                {goal.title}
              </span>
              <span className="text-[7px] text-text-tertiary/40 tabular-nums">
                {goal.current}/{goal.target}{goal.unit}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
