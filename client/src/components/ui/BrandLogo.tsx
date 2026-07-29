/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：BrandLogo。
 */
import React from 'react';
import { cn } from '@/lib/utils';

export type BrandLogoMode = 'animate' | 'static' | 'floating' | 'golden';

export interface BrandLogoProps {
  mode?: BrandLogoMode;
  size?: number;
  className?: string;
}

const CHECK_PATH = 'M5 20 L12 27 L30 8';

export const BrandLogo: React.FC<BrandLogoProps> = ({
  mode = 'static',
  size = 32,
  className,
}) => {
  const isAnimate = mode === 'animate';
  const isGolden = mode === 'golden';
  const isFloating = mode === 'floating';

  const strokeColor = isGolden ? '#FFD700' : 'currentColor';
  const fillColor = isGolden ? 'rgba(255, 215, 0, 0.15)' : 'none';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 35 35"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        'flex-shrink-0',
        isFloating && 'animate-brand-float',
        isGolden && 'drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]',
        className,
      )}
    >
      {/* Optional glow filter for golden mode */}
      {isGolden && (
        <defs>
          <filter id="kb-brand-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}

      {/* Background circle */}
      <circle
        cx="17.5"
        cy="17.5"
        r="15"
        fill={fillColor}
        stroke={isGolden ? 'rgba(255, 215, 0, 0.3)' : 'currentColor'}
        strokeWidth="1.5"
        opacity={isGolden ? 1 : 0.15}
      />

      {/* Check mark path */}
      <path
        d={CHECK_PATH}
        stroke={strokeColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={isAnimate ? 50 : undefined}
        strokeDasharray={isAnimate ? 50 : undefined}
        strokeDashoffset={isAnimate ? undefined : 0}
        className={cn(
          isAnimate && 'animate-brand-draw',
        )}
        filter={isGolden ? 'url(#kb-brand-glow)' : undefined}
      />
    </svg>
  );
};

BrandLogo.displayName = 'BrandLogo';

export default BrandLogo;
