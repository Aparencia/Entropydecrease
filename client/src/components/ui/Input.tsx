import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export type InputSize = NonNullable<VariantProps<typeof inputVariants>['size']>;

const inputVariants = cva(
  [
    'flex items-center rounded-kb-md',
    'bg-bg-secondary border',
    'transition-all duration-kb-fast ease-kb-default',
    'focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200/50',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 text-b3 gap-1.5',
        md: 'h-10 px-3 text-b2 gap-2',
        lg: 'h-12 px-4 text-b1 gap-2.5',
      },
      error: {
        true: 'border-semantic-error/60 focus-within:border-semantic-error focus-within:ring-semantic-error/20',
        false: 'border-border/70',
      },
    },
    defaultVariants: {
      size: 'md',
      error: false,
    },
  },
);

/**
 * 输入框组件 props
 * @param label - 输入框标签文本
 * @param error - 错误提示文本
 * @param prefix - 输入框前缀节点（图标等）
 * @param suffix - 输入框后缀节点（图标等）
 * @param size - 尺寸变体：sm(32px) | md(40px) | lg(48px)
 * @ai-context 极夜深海主题输入框，4px 基准网格，双主题色板
 */
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  size?: InputSize;
}

/**
 * 熵减通用输入框组件
 * @param props - InputProps
 * @returns React 输入框元素
 * @ai-context 使用 cva 变体，支持错误态/正常态边框色切换
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, prefix, suffix, size, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-kb-xs">
        {label && (
          <label htmlFor={inputId} className="text-b2 font-medium text-text-primary">
            {label}
          </label>
        )}

        <div className={cn(inputVariants({ size, error: !!error }), className)}>
          {prefix && <span className="text-text-tertiary flex-shrink-0">{prefix}</span>}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex-1 bg-transparent outline-none',
              'text-text-primary placeholder:text-text-tertiary',
              'min-w-0',
            )}
            {...props}
          />

          {suffix && <span className="text-text-tertiary flex-shrink-0">{suffix}</span>}
        </div>

        {error && (
          <p className="text-c1 text-semantic-error">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
