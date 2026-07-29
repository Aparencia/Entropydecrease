import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export type CardVariant = NonNullable<VariantProps<typeof cardVariants>['variant']>;
export type CardPadding = NonNullable<VariantProps<typeof cardVariants>['padding']>;

const cardVariants = cva(
  'transition-all duration-300 ease-kb-smooth backdrop-blur-xl overflow-hidden',
  {
    variants: {
      variant: {
        default: [
          'bg-bg-secondary/60 rounded-kb-lg shadow-kb-sm kb-squircle',
          'border border-border/40',
          'hover:shadow-kb-md hover:border-border/60',
        ].join(' '),
        elevated: [
          'bg-bg-secondary/60 rounded-kb-lg shadow-kb-md kb-squircle',
          'border border-border/20',
          'hover:shadow-lg hover:border-border/40',
        ].join(' '),
        outlined: [
          'bg-bg-secondary/40 rounded-kb-lg kb-squircle',
          'border border-border/50',
          'hover:border-border-strong hover:shadow-kb-sm',
        ].join(' '),
      },
      padding: {
        none: '',
        sm: 'p-kb-sm',
        md: 'p-kb-md',
        lg: 'p-kb-lg',
      },
      hoverable: {
        true: 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-border/60',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      hoverable: false,
    },
  },
);

/**
 * 卡片组件 props
 * @param variant - 变体：default | elevated | outlined
 * @param padding - 内边距：none | sm | md | lg
 * @param hoverable - 是否启用悬浮动效（CSS translateY(-2px) + shadow 增强, 200ms）
 * @ai-context 极夜深海主题卡片，hoverable 使用 CSS hover:-translate-y-0.5 (2px)
 */
export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

/**
 * 熵减通用卡片组件
 * @param props - CardProps
 * @returns React 卡片元素
 * @ai-context hoverable=true 时 CSS 驱动 translateY(-2px) + shadow 增强 200ms
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant, padding, hoverable, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, padding, hoverable }), className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

/* ── 子组件 ────────────────────────────────────────── */

/**
 * 卡片头部
 * @param props - HTMLDivElement props
 * @returns React 元素
 * @ai-context 卡片内容区头部容器，4px 基准网格间距
 */
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-kb-xs pb-kb-md', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

/**
 * 卡片内容区
 * @param props - HTMLDivElement props
 * @returns React 元素
 * @ai-context 卡片主内容容器
 */
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('pb-kb-md last:pb-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

/**
 * 卡片底部
 * @param props - HTMLDivElement props
 * @returns React 元素
 * @ai-context 卡片底部操作区容器
 */
export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center pt-kb-md', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
