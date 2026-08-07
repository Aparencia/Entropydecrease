/**
 * DashboardCard — 三视图统一卡片容器（双方案表面语言）
 *
 * 尺寸固定化规范：圆角/内边距/图标尺寸由本组件统一，视图内不出现裸的 backdrop-blur/shadow 硬编码。
 * 双方案分支（结构性差异非换色）：
 * - deep-sea（深海）：毛玻璃 + 细边框 + hover 模块色边缘光晕
 * - aurora-dome（穹顶）：不透明平面 + 浅阴影（hover 加深）+ 边框
 *
 * @ai-context: 首页统一卡片容器——双主题表面语言分支。
 */
import { cn } from '@/lib/utils';
import { useHomeScheme } from '../hooks/useHomeScheme';
import type { ReactNode, KeyboardEvent } from 'react';

interface DashboardCardProps {
  children: ReactNode;
  className?: string;
  /** hover 光晕/阴影使用的模块色（deep-sea 下生效），如 'pomodoro' */
  accent?: 'pomodoro' | 'note' | 'flashcard' | 'feynman' | 'brand' | 'default';
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
}

const ACCENT_GLOW: Record<NonNullable<DashboardCardProps['accent']>, string> = {
  pomodoro: 'hover:shadow-[0_0_24px_-6px_rgba(249,115,22,0.45)]',
  note: 'hover:shadow-[0_0_24px_-6px_rgba(59,130,246,0.45)]',
  flashcard: 'hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.45)]',
  feynman: 'hover:shadow-[0_0_24px_-6px_rgba(139,92,246,0.45)]',
  brand: 'hover:shadow-[0_0_24px_-6px_rgba(99,102,241,0.45)]',
  default: 'hover:shadow-[0_0_24px_-6px_rgba(255,255,255,0.25)]',
};

export function DashboardCard({
  children,
  className,
  accent = 'default',
  onClick,
  onKeyDown,
  role,
  tabIndex,
  'aria-label': ariaLabel,
}: DashboardCardProps) {
  const { scheme } = useHomeScheme();

  return (
    <div
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        'rounded-kb-xl transition-all duration-beat-x3',
        scheme === 'deep-sea'
          ? cn(
              'border border-border/15 bg-bg-elevated/30 backdrop-blur-sm',
              onClick && 'cursor-pointer hover:bg-bg-elevated/50',
              ACCENT_GLOW[accent],
            )
          : cn(
              'border border-border/30 bg-bg-elevated shadow-kb-sm',
              onClick && 'cursor-pointer hover:shadow-kb-md',
            ),
        className,
      )}
    >
      {children}
    </div>
  );
}
