/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：ComingSoonPlaceholder。
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface ComingSoonPlaceholderProps {
  /** 功能名称 */
  title: string;
  /** 功能描述（可选） */
  description?: string;
  /** 图标（可选） */
  icon?: React.ReactNode;
  /** 计划版本，如 "v0.5.0" */
  plannedVersion?: string;
  className?: string;
}

/**
 * 全功能占位区域组件，用于尚未开发的功能模块。
 * 展示大标题、描述、图标以及"即将推出"徽章，
 * 以优雅的视觉风格替代空白或报错页面。
 */
export function ComingSoonPlaceholder({
  title,
  description,
  icon,
  plannedVersion,
  className,
}: ComingSoonPlaceholderProps) {
  return (
    <div
      className={cn(
        // 布局：居中
        'flex flex-col items-center justify-center',
        // 尺寸
        'w-full min-h-64',
        // 间距
        'px-kb-xl py-kb-2xl',
        // 边框：虚线，柔和
        'border-2 border-dashed border-border/60',
        // 圆角
        'rounded-kb-xl',
        // 背景：使用 bg-tertiary 的半透明效果
        'bg-bg-tertiary/40',
        className,
      )}
    >
      {/* 图标区域 */}
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center',
            'w-14 h-14',
            'rounded-kb-lg',
            'bg-bg-tertiary',
            'text-text-tertiary',
            'mb-kb-md',
          )}
        >
          {icon}
        </div>
      )}

      {/* 大徽章 */}
      <span
        className={cn(
          'inline-flex items-center',
          'px-3 py-1',
          'text-b3 font-semibold tracking-wide',
          'text-brand-600',
          'bg-brand-50',
          'border border-brand-200/60',
          'rounded-kb-full',
          'mb-kb-sm',
        )}
      >
        Coming Soon
      </span>

      {/* 标题 */}
      <h2
        className={cn(
          'text-h2 font-semibold text-center',
          'text-text-primary',
          'mt-kb-sm',
        )}
      >
        {title}
      </h2>

      {/* 描述 */}
      {description && (
        <p
          className={cn(
            'text-b2 text-center max-w-sm',
            'text-text-secondary',
            'mt-kb-xs leading-relaxed',
          )}
        >
          {description}
        </p>
      )}

      {/* 计划版本标注 */}
      {plannedVersion && (
        <p
          className={cn(
            'text-c1',
            'text-text-tertiary',
            'mt-kb-md',
          )}
        >
          计划在{' '}
          <span className="font-medium text-text-secondary">
            {plannedVersion}
          </span>{' '}
          中推出
        </p>
      )}
    </div>
  );
}
