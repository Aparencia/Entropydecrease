/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：Skeleton。
 */
import type React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Shimmer 骨架基础样式：脉动 + 光泽扫过 */
const shimmerBase = cn(
  'bg-bg-tertiary overflow-hidden relative',
  'before:content-[\'\'] before:absolute before:inset-0',
  'before:bg-gradient-to-r before:from-transparent before:via-bg-secondary/50 before:to-transparent',
  'before:animate-shimmer before:bg-[length:200%_100%]',
  'animate-pulse-skeleton',
);

export type SkeletonVariant = NonNullable<VariantProps<typeof skeletonVariants>['variant']>;

const skeletonVariants = cva(shimmerBase, {
  variants: {
    variant: {
      text: 'rounded-kb-sm',
      circular: 'rounded-kb-full',
      rectangular: 'rounded-kb-md',
    },
  },
  defaultVariants: {
    variant: 'text',
  },
});

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  lines?: number;
  className?: string;
}

export function Skeleton({
  variant,
  width,
  height,
  lines = 1,
  className,
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  if (variant === 'circular') {
    return (
      <div
        className={cn(skeletonVariants({ variant }), className)}
        style={{
          width: style.width || '40px',
          height: style.height || style.width || '40px',
        }}
      />
    );
  }

  if (variant === 'rectangular') {
    return (
      <div
        className={cn(skeletonVariants({ variant }), className)}
        style={{
          width: style.width || '100%',
          height: style.height || '120px',
        }}
      />
    );
  }

  // text (default)
  return (
    <div className="flex flex-col gap-kb-xs">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            skeletonVariants({ variant: 'text' }),
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full',
            className,
          )}
          style={{ height: height ? style.height : '0.875rem' }}
        />
      ))}
    </div>
  );
}

Skeleton.displayName = 'Skeleton';
