/**
 * 沉浸式视图标签药丸组（性质 / 深度）
 * Immersive view tag pills (nature / depth).
 *
 * @ai-context: 从 InspirationPage 拆出的沉浸式卡片上方标签选择组：内容性质与认知
 * 深度两组药丸。选中值经 props 由页面状态驱动，渲染结构与原内联 JSX 完全一致。
 * @ai-context: Extracted from InspirationPage; selected nature/depth and change
 * callbacks are driven by page state via props, markup identical to the original.
 */

import { cn } from '@/lib/utils';
import { CONTENT_NATURE_OPTIONS, COGNITIVE_DEPTH_OPTIONS } from '../constants';

interface ImmersiveTagPillsProps {
  selectedNature: string;
  onNatureChange: (value: string) => void;
  selectedDepth: string;
  onDepthChange: (value: string) => void;
}

export default function ImmersiveTagPills({
  selectedNature,
  onNatureChange,
  selectedDepth,
  onDepthChange,
}: ImmersiveTagPillsProps) {
  return (
    <div className="w-full max-w-md space-y-1.5 mb-2">
      <div className="flex items-center gap-1.5">
        <span className="text-c1 text-text-tertiary shrink-0">性质:</span>
        <div className="flex flex-wrap gap-1">
          {CONTENT_NATURE_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => onNatureChange(opt.value)}
              className={cn(
                'rounded-full text-xs font-medium px-2.5 py-0.5 cursor-pointer transition-colors border',
                selectedNature === opt.value
                  ? cn(opt.color, opt.bg, 'ring-1 ring-brand-300')
                  : 'text-text-tertiary bg-bg-secondary/50 border-border/30 hover:text-text-secondary',
              )}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-c1 text-text-tertiary shrink-0">深度:</span>
        <div className="flex flex-wrap gap-1">
          {COGNITIVE_DEPTH_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => onDepthChange(opt.value)}
              className={cn(
                'rounded-full text-xs font-medium px-2.5 py-0.5 cursor-pointer transition-colors border',
                selectedDepth === opt.value
                  ? cn(opt.color, opt.bg, 'ring-1 ring-brand-300')
                  : 'text-text-tertiary bg-bg-secondary/50 border-border/30 hover:text-text-secondary',
              )}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
