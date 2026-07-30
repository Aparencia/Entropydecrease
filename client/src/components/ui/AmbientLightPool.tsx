/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：AmbientLightPool。
 */
import { useReducedMotion } from '@/hooks/useReducedMotion';

type AmbientVariant = 'default' | 'focus' | 'relax';

interface AmbientLightPoolProps {
  /** 光晕风格变体 */
  variant?: AmbientVariant;
  /** 光晕强度 0-1，默认 1 */
  intensity?: number;
  /** 额外 className（定位/尺寸由调用方控制） */
  className?: string;
}

/**
 * 变体 → CSS 自定义属性映射
 * 使用 CSS @keyframes + custom properties 替代 Framer Motion repeat:Infinity
 * 仅触发 composite 层，不触发 layout/paint
 */
const VARIANT_STYLES: Record<AmbientVariant, React.CSSProperties> = {
  default: {
    background: 'radial-gradient(circle, var(--kb-ambient-color, rgba(91,138,114,0.06)) 0%, transparent 70%)',
    animationDuration: '6s',
  },
  focus: {
    background: 'radial-gradient(circle, var(--kb-ambient-color, rgba(59,130,246,0.06)) 0%, transparent 70%)',
    animationDuration: '8s',
  },
  relax: {
    background: 'radial-gradient(circle, var(--kb-ambient-color, rgba(123,196,184,0.06)) 0%, transparent 70%)',
    animationDuration: '10s',
  },
};

/**
 * 统一环境光组件 — 纯 CSS 实现
 *
 * 替代各页面分散的 `motion.div + repeat: Infinity` 环境光模式。
 * 使用 CSS @keyframes `kb-ambient-glow`（已定义于 index.css），
 * 仅触发 GPU composite 层，不引起 layout/paint 重算。
 *
 * 自动响应 `prefers-reduced-motion`：减弱动效时降级为静态光晕。
 */
export function AmbientLightPool({
  variant = 'default',
  intensity = 1,
  className = '',
}: AmbientLightPoolProps) {
  const prefersReduced = useReducedMotion();

  const baseStyle: React.CSSProperties = {
    ...VARIANT_STYLES[variant],
    opacity: prefersReduced ? intensity * 0.5 : undefined,
    animation: prefersReduced ? 'none' : undefined,
    pointerEvents: 'none',
    willChange: prefersReduced ? undefined : 'transform, opacity',
  };

  return (
    <div
      className={`kb-ambient-glow ${className}`}
      style={baseStyle}
      aria-hidden="true"
    />
  );
}
