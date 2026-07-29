/**
 * 模式指示器
 * 显示当前数据模式（本地/混合/云端）
 *
 * @ai-context: UI 基础组件（shadcn/radix 封装）：ModeIndicator。
 */
import { HardDrive, Cloud, Globe } from 'lucide-react';
import { useModeState } from '@/hooks/useMode';
import { cn } from '@/lib/utils';
import type { AppMode } from '@/lib/mode/ModeManager';

const modeConfig: Record<AppMode, { label: string; icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>; color: string; bg: string }> = {
  local: { label: '本地', icon: HardDrive, color: 'text-text-tertiary', bg: 'bg-bg-secondary' },
  hybrid: { label: '联网', icon: Cloud, color: 'text-brand-500', bg: 'bg-brand-50' },
  full: { label: '云端', icon: Globe, color: 'text-brand-600', bg: 'bg-brand-50' },
};

export interface ModeIndicatorProps {
  className?: string;
}

export default function ModeIndicator({ className }: ModeIndicatorProps) {
  const { mode } = useModeState();
  const config = modeConfig[mode] || modeConfig.local;
  const Icon = config.icon;

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-kb-md', config.bg, className)}
      title={`当前模式：${config.label}`}
    >
      <Icon className={cn('w-icon-xs h-icon-xs', config.color)} strokeWidth={1.5} />
      <span className={cn('text-c1 font-medium', config.color)}>{config.label}</span>
    </span>
  );
}
