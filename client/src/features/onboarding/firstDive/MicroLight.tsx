/**
 * 微光 — 水母伴航生命体的 P1 雏形（纯 CSS 光点，无外部资产）
 *
 * @ai-context: 视觉资产决策（遗留问题①）——P1 用赛博青 CSS 光晕光点
 * 代替水母动画，零依赖零资产成本；P2 升级 SVG/Lottie 时仅替换此组件。
 * 纯展示组件，无副作用。
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MicroLightProps {
  /** 尺寸（px），默认 14 */
  size?: number;
  className?: string;
}

export function MicroLight({ size = 14, className }: MicroLightProps) {
  return (
    <motion.span
      aria-hidden
      className={cn('relative inline-block flex-shrink-0 rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle, var(--kb-cyber-cyan) 0%, transparent 72%)',
        boxShadow: '0 0 12px var(--kb-cyber-cyan), 0 0 28px color-mix(in srgb, var(--kb-cyber-cyan) 40%, transparent)',
      }}
      animate={{ opacity: [0.55, 1, 0.55], scale: [0.92, 1.06, 0.92] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
