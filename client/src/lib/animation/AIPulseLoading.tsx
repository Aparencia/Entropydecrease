/**
 * @file AI 三点脉冲波纹加载组件
 * @description 替代传统旋转加载圈的三点脉冲效果
 * @ai-context 在所有 AI 加载状态处使用，颜色随主题适配
 */
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { isDarkMode } from './themeVariants';
import { cn } from '@/lib/utils';

interface AIPulseLoadingProps {
  /** 容器额外 className */
  className?: string;
  /** 圆点尺寸（px），默认 6 */
  dotSize?: number;
  /** 文字标签（可选） */
  label?: string;
}

/**
 * AI 三点脉冲加载组件
 */
export default function AIPulseLoading({ className, dotSize = 6, label }: AIPulseLoadingProps) {
  const prefersReduced = useReducedMotion();
  const dark = isDarkMode();

  // 深色：明亮赛博青 #0891B2，浅色：柔和蓝灰 #64748B
  const dotColor = dark ? '#0891B2' : '#64748B';

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full inline-block"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: dotColor,
            animation: prefersReduced
              ? 'none'
              : `kb-ai-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      {label && (
        <span className={cn(
          'text-[12px] ml-1',
          dark ? 'text-cyan-400/70' : 'text-slate-500/70',
        )}>
          {label}
        </span>
      )}
    </div>
  );
}
