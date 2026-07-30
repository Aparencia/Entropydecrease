import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center font-medium',
    'transition-all duration-kb-fast ease-kb-smooth',
    'select-none whitespace-nowrap',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.97] active:duration-kb-fast',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-brand-600 text-white',
          'hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/20',
          'active:bg-brand-800',
          'shadow-kb-sm',
        ].join(' '),
        secondary: [
          'bg-bg-tertiary text-text-primary',
          'hover:bg-border hover:shadow-md',
          'active:bg-border-strong',
          'border border-border/40',
        ].join(' '),
        ghost: [
          'bg-transparent text-text-secondary',
          'hover:bg-bg-tertiary hover:text-text-primary',
          'active:bg-bg-secondary',
        ].join(' '),
        danger: [
          'bg-semantic-error text-white',
          'hover:bg-semantic-error/90 hover:shadow-md hover:shadow-semantic-error/20',
          'active:bg-semantic-error/80',
          'shadow-kb-sm',
        ].join(' '),
        ai: [
          'bg-gradient-to-r from-accent-500 to-brand-500 text-white',
          'hover:from-accent-600 hover:to-brand-600',
          'hover:shadow-md hover:shadow-accent-500/20',
          'shadow-kb-sm',
        ].join(' '),
      },
      size: {
        sm: 'px-3 py-1.5 text-b3 rounded-kb-sm gap-1.5',
        md: 'px-4 py-2 text-b2 rounded-kb-md gap-2',
        lg: 'px-6 py-3 text-b1 rounded-kb-lg gap-2.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

/**
 * 按钮组件 props 接口
 * @param variant - 按钮变体：primary | secondary | ghost | danger | ai
 * @param size - 尺寸：sm | md | lg
 * @param loading - 是否处于加载状态
 * @param icon - 左侧图标
 * @param iconRight - 右侧图标
 * @param asChild - 是否渲染为子元素（Slot 模式）
 * @ai-context 极夜深海主题按钮，CSS active:scale(0.97) 按压反馈 150ms
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  asChild?: boolean;
}

/**
 * 熵减通用按钮组件
 * @param props - ButtonProps
 * @returns React 按钮元素
 * @ai-context 支持 cva 变体 + CSS active scale(0.97) 按压动效 150ms bounce ease
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant,
      size,
      loading = false,
      disabled = false,
      icon,
      iconRight,
      asChild = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        disabled={isDisabled}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-icon-sm h-icon-sm animate-spin" />
        ) : (
          icon
        )}
        {children}
        {iconRight && !loading && iconRight}
      </Comp>
    );
  },
);

Button.displayName = 'Button';
