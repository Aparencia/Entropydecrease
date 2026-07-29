/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：IconButton。
 */
import React from 'react';
import { cn } from '@/lib/utils';

export type IconButtonSize = 'sm' | 'md';
export type IconButtonVariant = 'default' | 'ghost' | 'danger';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  icon: React.ReactNode;
  tooltip?: string;
}

const sizeStyles: Record<IconButtonSize, string> = {
  sm: 'w-9 h-9',
  md: 'w-11 h-11',
};

const variantStyles: Record<IconButtonVariant, string> = {
  default: [
    'bg-bg-secondary text-text-secondary',
    'hover:bg-bg-tertiary hover:text-text-primary hover:shadow-kb-sm',
    'active:bg-border active:scale-[0.95]',
    'border border-border/50',
  ].join(' '),
  ghost: [
    'bg-transparent text-text-secondary',
    'hover:bg-bg-tertiary hover:text-text-primary',
    'active:bg-bg-secondary active:scale-[0.95]',
  ].join(' '),
  danger: [
    'bg-transparent text-text-secondary',
    'hover:bg-rose-50 hover:text-[#F43F5E] hover:border-[#F43F5E]/20',
    'active:bg-rose-100 active:scale-[0.95]',
    'border border-transparent',
  ].join(' '),
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', variant = 'default', icon, tooltip, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        title={tooltip}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-kb-full',
          'transition-all duration-kb-fast ease-kb-default',
          'select-none',
          sizeStyles[size],
          variantStyles[variant],
          !disabled && 'hover:scale-[1.05]',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
        {...props}
      >
        {icon}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
