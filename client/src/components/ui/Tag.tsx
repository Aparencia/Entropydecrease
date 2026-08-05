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
        pomodoro: 'bg-pomodoro-light/40 text-pomodoro',
        note: 'bg-note-light/40 text-note',
        flashcard: 'bg-flashcard-light/40 text-flashcard',
        feynman: 'bg-feynman-light/40 text-feynman',
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
  /** 点击回调（存在时渲染为可交互元素：cursor + hover/active 反馈） */
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  /** 选中态（用于标签筛选等场景高亮） */
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Tag: React.FC<TagProps> = ({
  color,
  closable = false,
  onClose,
  onClick,
  active = false,
  children,
  className,
}) => {
  return (
    <span
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        tagVariants({ color }),
        onClick && 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.97] select-none',
        active && 'ring-1 ring-brand-500/40 bg-brand-50/60 shadow-sm',
        className,
      )}
    >
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
