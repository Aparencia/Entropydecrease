/**
 * CycleMarkers — 番茄循环标记（能量条）
 *
 * 显示当前预设的长休间隔进度：filled 个已完成的番茄 + 剩余空位。
 * 数量由预设的 longBreakInterval 驱动，切换预设时自动变化。
 *
 * @ai-context: 从 PomodoroPage 内联 JSX 抽取为独立组件，
 * 供 PresetEditor 预览和 ImmersiveTimer 复用。
 * @ai-context: Extracted energy-bar markers; count driven by preset.longBreakInterval.
 * @ai-context: P3-19 React.memo 包裹——props（total/filled/className）仅在完成数或
 * 预设变化时改变，避免番茄钟每秒 tick 引发的父组件重渲染连带本组件空转。
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING, BEAT } from '@/lib/animation/springConfig';

interface CycleMarkersProps {
  /** 总标记数（预设的 longBreakInterval） */
  total: number;
  /** 已填充数（completedCount） */
  filled: number;
  className?: string;
}

export default memo(function CycleMarkers({ total, filled, className }: CycleMarkersProps) {
  // 无长休预设：不渲染标记条，但保留计数文字 0/0
  if (total <= 0) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <span className="text-[11px] text-text-tertiary/60 font-mono tabular-nums">
          {filled}/{total}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {Array.from({ length: total }, (_, i) => {
        const isFilled = i < filled;
        return (
          <motion.div
            key={i}
            className={cn(
              'h-2 rounded-full transition-all',
              isFilled
                ? 'bg-brand-500 shadow-[0_0_8px_rgba(91,138,114,0.4)]'
                : 'bg-border/30',
            )}
            /* transitionDuration 内联：Tailwind JIT 无法生成运行时拼接的 duration-[...] 任意值类 */
            style={{
              width: isFilled ? '24px' : '16px',
              transitionDuration: `${BEAT.x2}ms`,
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3 + i * 0.05, ...SPRING.bouncy }}
          />
        );
      })}
      <span className="text-[11px] text-text-tertiary/60 ml-2 font-mono tabular-nums">
        {filled}/{total}
      </span>
    </div>
  );
});
