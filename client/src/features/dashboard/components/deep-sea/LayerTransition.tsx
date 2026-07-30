/**
 * @file 层间过渡动效组件
 * @description 深海层与层之间的过渡区域，包含"潜水"动效：环境色渐变 + 浮力粒子加速 + blur 过渡
 * @ai-context: 使用 framer-motion useInView 触发过渡动画
 */
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import type { DepthZone } from './useDepthScroll';

interface Props {
  fromZone: DepthZone;
  toZone: DepthZone;
}

/** 层间过渡粒子（加速上浮效果） */
const TRANSITION_PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 10 + (i * 7.3) % 80,
  size: 1.5 + (i % 3),
  delay: i * 0.4,
}));

export default function LayerTransition({ fromZone, toZone }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0.3, once: false });

  return (
    <div
      ref={ref}
      className="relative h-16 flex items-center justify-center overflow-hidden"
      data-from-zone={fromZone}
      data-to-zone={toZone}
    >
      {/* 过渡渐变带 */}
      <motion.div
        className="absolute inset-0"
        animate={{
          opacity: isInView ? 0.6 : 0.2,
        }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        style={{
          background: `linear-gradient(180deg, transparent 0%, rgba(34, 211, 238, 0.04) 50%, transparent 100%)`,
        }}
      />

      {/* 加速上浮粒子 */}
      {isInView && TRANSITION_PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-cyan-300/40"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            bottom: 0,
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -64, opacity: [0, 0.8, 0] }}
          transition={{
            duration: 1.2,
            delay: p.delay,
            ease: 'easeOut',
            repeat: Infinity,
            repeatDelay: 2,
          }}
        />
      ))}

      {/* 深度分界线 */}
      <motion.div
        className="absolute left-8 right-8 h-px"
        animate={{
          opacity: isInView ? 0.3 : 0.1,
          scaleX: isInView ? 1 : 0.6,
        }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.3) 50%, transparent 100%)',
        }}
      />
    </div>
  );
}
