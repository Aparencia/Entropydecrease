/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：EmptyState。
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/ui/BrandLogo';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'py-kb-2xl px-kb-lg',
        className,
      )}
    >
      <div className="text-text-tertiary/60 mb-kb-md">
        {icon || <BrandLogo mode="floating" size={64} className="text-brand-500/60" />}
      </div>

      <h3 className="text-h3 font-medium text-text-secondary">{title}</h3>

      {description && (
        <p className="mt-kb-xs text-b2 text-text-tertiary max-w-xs">{description}</p>
      )}

      {action && <div className="mt-kb-md">{action}</div>}
    </div>
  );
};

EmptyState.displayName = 'EmptyState';
