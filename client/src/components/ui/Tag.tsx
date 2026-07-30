/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：Tag。
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TagColor = NonNullable<VariantProps<typeof tagVariants>['color']>;

const tagVariants = cva(
  [
    'inline-flex items-center gap-1',
    'px-2.5 py-0.5',
    'text-b3 font-medium',
    'rounded-kb-full',
    'transition-colors duration-kb-fast',
  ].join(' '),
  {
    variants: {
      color: {
        brand: 'bg-brand-100/70 text-brand-700',
        pomodoro: 'bg-rose-100/70 text-rose-700',
        note: 'bg-accent-100/70 text-accent-700',
        flashcard: 'bg-cyan-100/70 text-cyan-700',
        feynman: 'bg-indigo-100/70 text-indigo-700',
        default: 'bg-bg-tertiary text-text-secondary',
      },
    },
    defaultVariants: {
      color: 'default',
    },
  },
);

export interface TagProps {
  color?: TagColor;
  closable?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const Tag: React.FC<TagProps> = ({
  color,
  closable = false,
  onClose,
  children,
  className,
}) => {
  return (
    <span className={cn(tagVariants({ color }), className)}>
      {children}
      {closable && (
        <button
          onClick={onClose}
          className={cn(
            'p-0.5 rounded-kb-full',
            'hover:bg-black/10',
            'transition-colors duration-kb-fast',
          )}
          aria-label="移除"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};

Tag.displayName = 'Tag';
