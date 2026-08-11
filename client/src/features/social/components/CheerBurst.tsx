/**
 * Cheer 爆发动画 — 收到鼓励时的 emoji 喷发
 * Cheer burst — emoji burst animation on received cheer
 *
 * @ai-context: 纯展示组件：接收 cheer 事件后播放一次 emoji 上升消散动画，
 * 完成后自动回调 onDone。随机散布 10 个粒子，framer-motion 驱动。
 * @ai-context: Pure display component; plays a one-shot emoji particle
 * burst and calls onDone when finished.
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { CheerEvent } from '../types';

interface CheerBurstProps {
  cheer: CheerEvent;
  onDone: () => void;
}

const PARTICLE_COUNT = 10;

/** 从固定色带取色（浅色/深色主题均可见） */
const COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#f87171'];

export default function CheerBurst({ cheer, onDone }: CheerBurstProps) {
  // 每次 cheer 事件生成一组新粒子（以事件时间戳为 key 强制重挂载）
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: `${cheer.at}-${i}`,
        x: (Math.random() - 0.5) * 160,
        y: -40 - Math.random() * 120,
        scale: 0.7 + Math.random() * 0.9,
        rotate: (Math.random() - 0.5) * 90,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.15,
      })),
    [cheer.at],
  );

  useEffect(() => {
    const timer = setTimeout(onDone, 1200);
    return () => clearTimeout(timer);
  }, [cheer.at, onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center" aria-hidden>
      <div className="relative">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: p.x,
              y: p.y,
              scale: p.scale,
              rotate: p.rotate,
            }}
            transition={{ duration: 1.1, delay: p.delay, ease: 'easeOut' }}
            className="absolute left-1/2 top-1/2 text-2xl"
            style={{ color: p.color }}
          >
            {cheer.emoji}
          </motion.span>
        ))}
        <motion.p
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: [0, 1, 1, 0], y: -24, scale: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="text-c1 text-text-secondary text-center whitespace-nowrap"
        >
          {cheer.fromNickname} 为你加油
        </motion.p>
      </div>
    </div>
  );
}
