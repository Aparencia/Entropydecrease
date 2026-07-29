/**
 * AI 思考指示器 — 三点脉冲波纹
 *
 * 三个赛博青色圆点依次明暗变化，
 * 传达"AI 正在陪伴你思考"的温暖感。
 *
 * @ai-context: UI 基础组件（shadcn/radix 封装）：AIThinkingIndicator。
 */
import { motion } from 'framer-motion';

interface AIThinkingIndicatorProps {
  /** 圆点尺寸，默认 6px */
  size?: number;
  /** 圆点间距，默认 4px */
  gap?: number;
  /** 额外 className */
  className?: string;
}

export function AIThinkingIndicator({ size = 6, gap = 4, className = '' }: AIThinkingIndicatorProps) {
  return (
    <div className={`flex items-center ${className}`} style={{ gap }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: size,
            height: size,
            backgroundColor: 'var(--kb-cyber-cyan)',
          }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
