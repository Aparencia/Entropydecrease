/**
 * @file 深海气泡柱 -- 打卡连续天数（学习时长概览）
 * @description 连续打卡天数以深海气泡柱形式呈现，气泡大小和数量映射学习时长
 * @ai-context: 替代原 DashboardPage 内联的打卡连续天数卡片
 */
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface Props {
  streakDays: number;
  todayChecked: boolean;
  loading?: boolean;
}

/** 根据连续天数生成气泡数据 */
function generateBubbles(streak: number) {
  const count = Math.min(streak, 14);
  return Array.from({ length: count }, (_, i) => {
    const size = 6 + (i % 4) * 3;
    const x = 20 + (i * 17) % 60;
    const delay = i * 0.3;
    const duration = 3 + (i % 3);
    return { id: i, size, x, delay, duration };
  });
}

export default function BubbleStreak({ streakDays, todayChecked, loading }: Props) {
  const prefersReduced = useReducedMotion();
  const bubbles = generateBubbles(streakDays);

  if (loading) {
    return (
      <div className="rounded-[var(--kb-radius-lg)] border border-border/30 bg-bg-elevated/30 backdrop-blur-sm p-4 h-[140px] animate-pulse" />
    );
  }

  return (
    <motion.div
      className="relative rounded-[var(--kb-radius-lg)] border border-cyan-400/20 bg-bg-elevated/30 backdrop-blur-sm overflow-hidden p-4 h-[140px] group hover:border-cyan-400/40 transition-colors duration-500"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label={`连续打卡 ${streakDays} 天`}
    >
      {/* 气泡背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!prefersReduced && bubbles.map((b) => (
          <motion.div
            key={b.id}
            className="absolute rounded-full border border-cyber/20 bg-cyber/10"
            style={{
              width: b.size,
              height: b.size,
              left: `${b.x}%`,
              bottom: -b.size,
            }}
            animate={{
              y: [0, -160],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: b.duration,
              delay: b.delay,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        ))}
      </div>

      {/* 核心数据 */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
        <motion.div
          animate={!prefersReduced ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Flame
            className={`w-6 h-6 ${todayChecked ? 'text-accent-400' : 'text-text-tertiary'}`}
            strokeWidth={1.5}
          />
        </motion.div>
        <span className="text-[28px] font-bold text-cyan-300 tabular-nums">
          {streakDays}
        </span>
        <span className="text-[10px] text-cyan-200/50">天连续打卡</span>
        <div className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
          todayChecked
            ? 'bg-cyber/15 text-cyan-300'
            : 'bg-bg-tertiary/30 text-text-tertiary'
        }`}>
          {todayChecked ? '今日已打卡' : '今日未打卡'}
        </div>
      </div>

      {/* 有色弥散阴影 */}
      <div className="absolute inset-0 pointer-events-none rounded-[var(--kb-radius-lg)] shadow-[inset_0_0_30px_rgba(34,211,238,0.03)]" />
    </motion.div>
  );
}
