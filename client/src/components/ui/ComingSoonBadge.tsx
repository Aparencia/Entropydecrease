/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：ComingSoonBadge。
 */
import { cn } from '@/lib/utils';

export interface ComingSoonBadgeProps {
  className?: string;
}

/**
 * 轻量内联徽章，用于在按钮或菜单项旁标示"即将推出"
 * 使用 muted 色调 + 小圆角 + 极小字号，视觉上不打断主内容
 */
export function ComingSoonBadge({ className }: ComingSoonBadgeProps) {
  return (
    <span
      className={cn(
        // 布局
        'inline-flex items-center',
        // 尺寸
        'px-1.5 py-0.5',
        // 字体
        'text-c2 font-medium leading-none whitespace-nowrap',
        // 颜色
        'text-text-tertiary',
        // 背景
        'bg-bg-tertiary',
        // 边框
        'border border-border/40',
        // 圆角
        'rounded-kb-sm',
        // 间距（与相邻元素保持微小间距）
        'ml-1.5',
        className,
      )}
    >
      即将推出
    </span>
  );
}
