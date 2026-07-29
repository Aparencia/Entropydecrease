/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：Avatar。
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  src?: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
}

const sizePx: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
};

const sizeStyles: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-b3',
  md: 'w-10 h-10 text-b2',
  lg: 'w-12 h-12 text-b1',
};

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md', className }) => {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;
  const initial = name?.charAt(0).toUpperCase() || '?';
  const px = sizePx[size];

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-kb-full overflow-hidden',
        'flex-shrink-0 select-none',
        'border-2 border-white/20 shadow-kb-sm',
        'transition-all duration-kb-fast',
        sizeStyles[size],
        !showImage && 'bg-brand-600 text-white',
        className,
      )}
      title={name}
    >
      {showImage ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          width={px}
          height={px}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="font-semibold">{initial}</span>
      )}
    </div>
  );
};

Avatar.displayName = 'Avatar';
